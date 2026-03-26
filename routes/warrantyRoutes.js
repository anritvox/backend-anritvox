const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const {
  validateSerial,
  registerWarranty,
  getAllRegistrations,
  updateWarrantyStatus,
  deleteWarranty
} = require("../models/warrantyModel");
const { authenticateAdmin } = require("../middleware/authMiddleware");

// PUBLIC: Check serial for the E-Warranty form
router.get("/validate/:serial", async (req, res) => {
  try {
    const info = await validateSerial(req.params.serial);
    res.json(info);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// PUBLIC: Register the warranty
router.post("/register", async (req, res) => {
  try {
    const result = await registerWarranty(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ADMIN: View all warranty registrations
router.get("/admin", authenticateAdmin, async (req, res) => {
  try {
    const list = await getAllRegistrations();
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ADMIN: Update warranty status
router.put("/admin/:id", authenticateAdmin, async (req, res) => {
  try {
    await updateWarrantyStatus(req.params.id, req.body.status);
    res.json({ message: "Status updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error updating status" });
  }
});

// ADMIN: Delete warranty registration
router.delete("/admin/:id", authenticateAdmin, async (req, res) => {
  try {
    await deleteWarranty(req.params.id);
    res.json({ message: "Warranty deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error deleting warranty" });
  }
});

// ADMIN: Delete a serial number directly from warranty/serial management
router.delete("/serials/:id", authenticateAdmin, async (req, res) => {
  try {
    const serialId = req.params.id;
    // Get the serial info first to know the product_id for stock adjustment
    const [rows] = await pool.query("SELECT product_id FROM product_serials WHERE id = ?", [serialId]);
    if (rows.length === 0) return res.status(404).json({ message: "Serial not found" });
    const productId = rows[0].product_id;
    await pool.query("DELETE FROM product_serials WHERE id = ?", [serialId]);
    // Adjust stock
    await pool.query("UPDATE products SET stock = GREATEST(0, stock - 1) WHERE id = ?", [productId]);
    res.json({ message: "Serial number deleted and inventory adjusted" });
  } catch (err) {
    console.error("Delete serial error:", err);
    res.status(500).json({ message: "Server error deleting serial" });
  }
});

// ADMIN: Get all serials with product info (for full serial management)
router.get("/serials", authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ps.id, ps.serial_number, ps.status, ps.product_id, ps.created_at,
             p.name as product_name, p.sku
      FROM product_serials ps
      LEFT JOIN products p ON ps.product_id = p.id
      ORDER BY ps.created_at DESC
      LIMIT 500
    `);
    res.json(rows);
  } catch (err) {
    console.error("Get serials error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
