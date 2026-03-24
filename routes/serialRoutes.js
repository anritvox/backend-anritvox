const express = require("express");
const router = express.Router();
const { authenticateAdmin } = require("../middleware/authMiddleware");

const {
  addProductSerials,
  getProductSerials,
  getProductSerialStats,
  updateProductSerial,
  deleteProductSerial,
  checkSerialAvailability,
} = require("../models/serialModel");

const addSerials = addProductSerials;

router.get("/:productId", async (req, res) => {
  try {
    const productId = req.params.productId;
    const serials = await getProductSerials(productId);
    res.json({ success: true, serials });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

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

    res.status(201).json({
      message: `${count} Serials generated successfully`,
      count: result.added,
      serials: result.serials.slice(0, 10),
      totalGenerated: result.added,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:productId/add", async (req, res) => {
  try {
    const productId = req.params.productId;
    const { serials } = req.body;

    if (!Array.isArray(serials) || serials.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Serials must be a non-empty array",
      });
    }

    const result = await addSerials(productId, serials);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.put("/:productId/:id", async (req, res) => {
  try {
    const productId = req.params.productId;
    const serialId = req.params.id;
    const { serial } = req.body;

    if (!serial) {
      return res.status(400).json({
        success: false,
        message: "Serial is required",
      });
    }

    const result = await updateProductSerial(productId, serialId, serial);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.delete("/:productId/:id", async (req, res) => {
  try {
    const productId = req.params.productId;
    const serialId = req.params.id;

    const result = await deleteProductSerial(productId, serialId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

router.post("/check", async (req, res) => {
  try {
    const { serial } = req.body;

    if (!serial) {
      return res.status(400).json({
        success: false,
        message: "Serial is required",
      });
    }

    const result = await checkSerialAvailability(serial);
    res.json({ success: true, result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

module.exports = router;