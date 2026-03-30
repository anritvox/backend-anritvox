const express = require("express");
const router = express.Router();
const crypto = require("crypto");
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

// Helper function to generate a checksum character
const generateChecksum = (baseString) => {
  let sum = 0;
  for (let i = 0; i < baseString.length; i++) {
    sum += baseString.charCodeAt(i);
  }
  return sum.toString(36).toUpperCase().slice(-1);
};

// GET /api/serials/:productId - list all serials for a product
router.get("/:productId", async (req, res) => {
  try {
    const serials = await getProductSerials(req.params.productId);
    res.json({ success: true, serials });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// POST /api/serials/generate - Advanced Pro Generator
router.post("/generate", authenticateAdmin, async (req, res) => {
  try {
    const { productId, count, prefix, format = "advanced" } = req.body;
    
    if (!productId || !count || count <= 0) {
      return res.status(400).json({ message: "Product ID and a valid Count are required" });
    }

    const generatedSerials = new Set(); // Feature 2: Set guarantees no in-memory duplicates

    // Feature 5: Loop until we have EXACTLY the requested count
    while (generatedSerials.size < count) {
      let newSerial = "";

      if (format === "legacy") {
        // LEGACY FORMAT: Exactly 6 char prefix + 4 char random suffix (10 digits)
        const customString = prefix ? prefix.toUpperCase() : "CUSTOM";
        if (customString.length !== 6) {
          return res.status(400).json({ message: "Model Prefix must be exactly 6 characters for legacy format (e.g., AV2316)" });
        }
        // Feature 1: Crypto Randomness
        const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
        newSerial = `${customString}${randomPart}`;
        
      } else {
        // ADVANCED FORMAT: PREFIX-YYMM-XXXXXX-C (e.g., ANRI-2603-A3B7K9-F)
        const pfx = prefix ? prefix.toUpperCase().slice(0, 4).padEnd(4, 'X') : "ANRI";
        const date = new Date();
        const yy = String(date.getFullYear()).slice(-2);
        const mm = String(date.getMonth() + 1).padStart(2, '0'); // Feature 3: Temporal Tracking
        
        const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
        const baseSerial = `${pfx}-${yy}${mm}-${randomPart}`;
        
        const checksum = generateChecksum(baseSerial); // Feature 4: Algorithmic Checksum
        newSerial = `${baseSerial}-${checksum}`;
      }

      generatedSerials.add(newSerial); // Set will naturally reject duplicates without crashing
    }

    const serialArray = Array.from(generatedSerials);

    // Insert serials using the enhanced model
    const result = await addProductSerials(productId, serialArray);

    // Fetch the safely updated quantity
    const [[product]] = await pool.query("SELECT quantity FROM products WHERE id = ?", [productId]);

    res.status(201).json({
      message: `${count} Serials generated in ${format} format.`,
      formatUsed: format,
      count: result.added,
      serialsPreview: serialArray.slice(0, 10), // Show max 10 in response to save bandwidth
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
    const { serials } = req.body;
    if (!Array.isArray(serials) || serials.length === 0) {
      return res.status(400).json({ success: false, message: "Serials must be a non-empty array" });
    }
    const result = await addProductSerials(req.params.productId, serials);
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
    const result = await deleteProductSerial(req.params.productId, req.params.id);
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

// NEW POST /api/serials/validate-checksum (Frontend instant verify)
router.post("/validate-checksum", async (req, res) => {
  const { serial } = req.body;
  if (!serial) return res.status(400).json({ valid: false });
  
  // Legacy format bypass (if no dashes, treat as valid structurally)
  if (!serial.includes("-")) return res.json({ valid: true, isLegacy: true });

  const parts = serial.split('-');
  const providedChecksum = parts.pop();
  const baseSerial = parts.join('-');
  
  let sum = 0;
  for (let i = 0; i < baseSerial.length; i++) sum += baseSerial.charCodeAt(i);
  const calculatedChecksum = sum.toString(36).toUpperCase().slice(-1);

  res.json({ valid: calculatedChecksum === providedChecksum, isLegacy: false });
});

module.exports = router;
