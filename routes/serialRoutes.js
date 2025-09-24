// backend/routes/serialRoutes.js
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getProductSerials,
  addProductSerials,
  deleteProductSerial,
  updateProductSerial,
  checkSerialAvailability,
  getProductSerialStats,
} = require("../models/serialModel");

// GET /api/serials/check/:serial - Check if serial is available
router.get("/check/:serial", async (req, res) => {
  try {
    const result = await checkSerialAvailability(req.params.serial);
    res.json(result);
  } catch (err) {
    console.error("Error checking serial availability:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/products/:id/serials - Get all serials for a product
router.get("/products/:id/serials", authMiddleware, async (req, res) => {
  try {
    const serials = await getProductSerials(req.params.id);
    const stats = await getProductSerialStats(req.params.id);

    res.json({
      serials,
      statistics: stats,
    });
  } catch (err) {
    console.error("Error fetching product serials:", err);
    res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
});

// POST /api/products/:id/serials - Add new serials to existing product
router.post("/products/:id/serials", authMiddleware, async (req, res) => {
  try {
    const { serials } = req.body;

    if (!Array.isArray(serials) || serials.length === 0) {
      return res.status(400).json({
        error: "Serials array is required and cannot be empty",
      });
    }

    if (serials.length > 100) {
      return res.status(400).json({
        error: "Cannot add more than 100 serials at once",
      });
    }

    const result = await addProductSerials(req.params.id, serials);

    res.status(201).json({
      message: `Successfully added ${result.added} serial numbers`,
      ...result,
    });
  } catch (err) {
    console.error("Error adding serials:", err);
    res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
});

// POST /api/products/:id/serials/bulk - Bulk add serials (CSV support)
router.post("/products/:id/serials/bulk", authMiddleware, async (req, res) => {
  try {
    let { serials, csvData } = req.body;

    // Handle CSV data conversion
    if (csvData && typeof csvData === "string") {
      serials = csvData
        .split(/[\n\r,;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    if (!Array.isArray(serials) || serials.length === 0) {
      return res.status(400).json({
        error: "No valid serials provided",
      });
    }

    if (serials.length > 1000) {
      return res.status(400).json({
        error: "Bulk import limited to 1000 serials per request",
      });
    }

    const result = await addProductSerials(req.params.id, serials);

    res.status(201).json({
      message: `Bulk import successful: ${result.added} serials added`,
      ...result,
    });
  } catch (err) {
    console.error("Error bulk adding serials:", err);
    res.status(err.status || 500).json({
      error: err.message || "Bulk import failed",
    });
  }
});

// PUT /api/products/:id/serials/:serialId - Edit specific serial
router.put(
  "/products/:id/serials/:serialId",
  authMiddleware,
  async (req, res) => {
    try {
      const { serial } = req.body;

      if (!serial || typeof serial !== "string") {
        return res.status(400).json({
          error: "Serial number is required",
        });
      }

      const result = await updateProductSerial(
        req.params.id,
        req.params.serialId,
        serial
      );

      res.json({
        message: "Serial number updated successfully",
        ...result,
      });
    } catch (err) {
      console.error("Error updating serial:", err);
      res.status(err.status || 500).json({
        error: err.message || "Server error",
      });
    }
  }
);

// DELETE /api/products/:id/serials/:serialId - Delete specific serial
router.delete(
  "/products/:id/serials/:serialId",
  authMiddleware,
  async (req, res) => {
    try {
      const result = await deleteProductSerial(
        req.params.id,
        req.params.serialId
      );

      res.json({
        message: `Serial number '${result.deleted}' deleted successfully`,
        ...result,
      });
    } catch (err) {
      console.error("Error deleting serial:", err);
      res.status(err.status || 500).json({
        error: err.message || "Server error",
      });
    }
  }
);

module.exports = router;
