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

// POST /api/serials/generate - generate 10-digit serials
router.post("/generate", authenticateAdmin, async (req, res) => {
  try {
    const { productId, count, prefix } = req.body;
    
    if (!productId || !count) {
      return res.status(400).json({ message: "Product ID and Count are required" });
    }
    
    const customString = prefix ? prefix.toUpperCase() : "CUSTOM";
    
    if (customString.length !== 6) {
      return res.status(400).json({ message: "Model Prefix must be exactly 6 characters long (e.g., AV2316)" });
    }

    const generatedSerials = [];
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    
    // EXACT 10-DIGIT LOGIC: 6 char prefix + 4 char random suffix
    for (let i = 0; i < count; i++) {
      let randomString = "";
      for (let j = 0; j < 4; j++) {
        randomString += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      generatedSerials.push(`${customString}${randomString}`);
    }

    // Insert serials (The model automatically and safely handles the stock/quantity sync)
    const result = await addProductSerials(productId, generatedSerials);

    // Fetch the safely updated quantity to send back to the React UI
    const [[product]] = await pool.query("SELECT quantity FROM products WHERE id = ?", [productId]);

    res.status(201).json({
      message: `${count} Serials generated in 10-digit format (e.g., ${generatedSerials[0]})`,
      count: result.added,
      serials: result.serials.slice(0, 10),
      totalGenerated: result.added,
      newStock: product ? product.quantity : null,
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
    
    // Model automatically syncs quantity
    const result = await addProductSerials(productId, serials);
    
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

// DELETE /api/serials/:productId/:id - delete a serial
router.delete("/:productId/:id", authenticateAdmin, async (req, res) => {
  try {
    const { productId, id } = req.params;
    
    // Model automatically handles reducing the quantity dynamically
    const result = await deleteProductSerial(productId, id);
    
    res.json({ success: true, result, message: "Serial deleted successfully" });
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
