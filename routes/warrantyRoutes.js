// backend/routes/warrantyRoutes.js
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
// Returns serial info including is_legacy and base_warranty_months
// so the frontend can show the purchase date field only for new-policy serials
router.get("/validate/:serial", async (req, res) => {
  try {
    if (!req.params.serial) {
      return res.status(400).json({ message: "Serial parameter is required" });
    }
    const info = await validateSerial(req.params.serial);
    res.json(info);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Validation failed" });
  }
});

// PUBLIC: Register the warranty
// Body fields:
//   serialNumber / serial, productId, customerName, email, phone,
//   purchaseDate (required for new-policy serials), shopName,
//   invoiceUrl (optional, for anti-tampering audit trail)
//
// The 14-day IST validation and warranty_end_date calculation happen
// entirely server-side inside warrantyModel.registerWarranty()
router.post("/register", async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "Empty request payload" });
    }
    const result = await registerWarranty(req.body);
    res.status(201).json(result);
  } catch (err) {
    // Preserve the exact error status (400 for 14-day rejection, 404 for invalid serial, etc.)
    res.status(err.status || 500).json({ message: err.message || "Registration failed" });
  }
});

// ADMIN: View all warranty registrations
router.get("/admin", authenticateAdmin, async (req, res) => {
  try {
    const list = await getAllRegistrations();
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: "Server error loading registrations" });
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
    const [rows] = await pool.query("SELECT product_id FROM product_serials WHERE id = ?", [serialId]);
    if (rows.length === 0) return res.status(404).json({ message: "Serial not found" });
    const productId = rows[0].product_id;
    await pool.query("DELETE FROM product_serials WHERE id = ?", [serialId]);
    await pool.query("UPDATE products SET quantity = GREATEST(0, quantity - 1) WHERE id = ?", [productId]);
    res.json({ message: "Serial number deleted and inventory adjusted" });
  } catch (err) {
    console.error("Delete serial error:", err);
    res.status(500).json({ message: "Server error deleting serial" });
  }
});

// ADMIN: Get all serials with product info (for full serial management)
// Now includes base_warranty_months and is_legacy for admin visibility
router.get("/serials", authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ps.id, ps.serial_number, ps.status, ps.product_id, ps.created_at,
             ps.base_warranty_months, ps.is_legacy,
             p.name as product_name, p.sku
      FROM product_serials ps
      LEFT JOIN products p ON ps.product_id = p.id
      ORDER BY ps.created_at DESC
      LIMIT 500
    `);
    res.json(rows);
  } catch (err) {
    console.error("Get serials error:", err);
    res.status(500).json({ message: "Server error loading serials" });
  }
});

// ALIAS: GET / = GET /admin (for frontend api.js compatibility)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const list = await getAllRegistrations();
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: 'Server error loading registrations' });
  }
});

// ADMIN: Update warranty status
router.patch('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'approved', 'rejected', 'processing', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: 'Invalid status value' });
    await updateWarrantyStatus(req.params.id, status);
    res.json({ message: 'Warranty status updated', status });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Update failed' });
  }
});

// ADMIN: Delete warranty registration
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await deleteWarranty(req.params.id);
    res.json({ message: 'Warranty registration deleted' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Delete failed' });
  }
});

module.exports = router;
