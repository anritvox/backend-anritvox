const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { authenticateAdmin } = require("../middleware/authMiddleware");

const {
  addProductSerials,
  getProductSerials,
  getProductSerialStats,
  updateProductSerial,
  deleteProductSerial,
  checkSerialAvailability,
} = require("../models/serialModel");

// GET /api/serials/:productId - list all serials for a product
router.get("/:productId", async (req, res) => {
  try {
    const productId = req.params.productId;
    const serials = await getProductSerials(productId);
    res.json({ success: true, serials });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// POST /api/serials/generate - generate serials AND auto-update product stock
router.post("/generate", authenticateAdmin, async (req, res) => {
  try {
    const { productId, count, batchNumber, prefix } = req.body;
    if (!productId || !count) {
      return res.status(400).json({ message: "Product ID and Count are required" });
    }
    const customString = prefix || "CUSTOM";
    if (customString.length !== 6) {
      return res.status(400).json({ message: "Custom string must be exactly 6 characters long" });
    }
    const generatedSerials = [];
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (let i = 0; i < count; i++) {
      let randomString = "";
      for (let j = 0; j < 6; j++) {
        randomString += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      const batchString = batchNumber ? `${batchNumber}` : "";
      generatedSerials.push(`${customString}${batchString}${randomString}`);
    }

    const result = await addProductSerials(productId, generatedSerials);

    // AUTO-SYNC: Update product stock to reflect generated serial count
    await pool.query(
      "UPDATE products SET stock = stock + ? WHERE id = ?",
      [result.added, productId]
    );

    // Get updated stock value to return
    const [[product]] = await pool.query("SELECT stock FROM products WHERE id = ?", [productId]);

    res.status(201).json({
      message: `${count} Serials generated and inventory updated automatically`,
      count: result.added,
      serials: result.serials.slice(0, 10),
      totalGenerated: result.added,
      newStock: product ? product.stock : null,
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// POST /api/serials/:productId/add - manually add serials
router.post("/:productId/add", authenticateAdmin, async (req, res) => {
  try {
    const productId = req.params.productId;
    const { serials } = req.body;
    if (!Array.isArray(serials) || serials.length === 0) {
      return res.status(400).json({ success: false, message: "Serials must be a non-empty array" });
    }
    const result = await addProductSerials(productId, serials);
    // Also update stock
    await pool.query("UPDATE products SET stock = stock + ? WHERE id = ?", [result.added, productId]);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// PUT /api/serials/:productId/:id - update a serial
router.put("/:productId/:id", authenticateAdmin, async (req, res) => {
  try {
    const { serial } = req.body;
    if (!serial) return res.status(400).json({ success: false, message: "Serial is required" });
    const result = await updateProductSerial(req.params.productId, req.params.id, serial);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// DELETE /api/serials/:productId/:id - delete a serial AND reduce stock
router.delete("/:productId/:id", authenticateAdmin, async (req, res) => {
  try {
    const { productId, id } = req.params;
    const result = await deleteProductSerial(productId, id);
    // Reduce stock by 1 when a serial is deleted
    await pool.query("UPDATE products SET stock = GREATEST(0, stock - 1) WHERE id = ?", [productId]);
    res.json({ success: true, result, message: "Serial deleted and stock adjusted" });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// GET /api/serials/:productId/stats - get serial stats
router.get("/:productId/stats", authenticateAdmin, async (req, res) => {
  try {
    const stats = await getProductSerialStats(req.params.productId);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// POST /api/serials/check - check serial availability
router.post("/check", async (req, res) => {
  try {
    const { serial } = req.body;
    if (!serial) return res.status(400).json({ success: false, message: "Serial is required" });
    const result = await checkSerialAvailability(serial);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

module.exports = router;
