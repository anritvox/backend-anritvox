const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const excel = require("exceljs");
const pool = require("../config/db");
const { authenticateAdmin } = require("../middleware/authMiddleware");
const {
  getAllSerials,
  addProductSerials,
  getProductSerials,
  getProductSerialStats,
  updateProductSerial,
  deleteProductSerial,
  checkSerialAvailability,
  deleteSerialBatch,
} = require("../models/serialModel");

const generateChecksum = (baseString) => {
  let sum = 0;
  for (let i = 0; i < baseString.length; i++) sum += baseString.charCodeAt(i);
  return sum.toString(36).toUpperCase().slice(-1);
};

// GET /api/serials/admin/all - View all serial numbers across all products with advanced filters
router.get("/admin/all", authenticateAdmin, async (req, res) => {
  try {
    const result = await getAllSerials(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/serials/all - Query filtering and pagination array matrix required by deployment guide
router.get("/all", authenticateAdmin, async (req, res) => {
  try {
    const result = await getAllSerials(req.query);
    res.json({
      serials: result.serials,
      pagination: result.pagination
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/serials/export/excel - High-performance structured excel download streaming
router.get("/export/excel", authenticateAdmin, async (req, res) => {
  try {
    // Retrieve tracking rows without standard page limits to complete full registry export
    const result = await getAllSerials({ ...req.query, page: 1, limit: 1000000 });
    const serials = result.serials;

    const workbook = new excel.Workbook();
    const worksheet = workbook.addWorksheet("Serial Registry Ledger");

    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Product ID", key: "product_id", width: 12 },
      { header: "Product Name", key: "product_name", width: 25 },
      { header: "Serial Number", key: "serial_number", width: 30 },
      { header: "Status", key: "status", width: 15 },
      { header: "Batch Number", key: "batch_number", width: 18 },
      { header: "Base Warranty (Months)", key: "base_warranty_months", width: 22 },
      { header: "Policy Mode", key: "policy_mode", width: 15 },
      { header: "Notes / Audit Logs", key: "notes", width: 30 },
      { header: "Registered Owner", key: "user_name", width: 20 },
      { header: "Registration Date", key: "registered_at", width: 22 },
      { header: "Created Timestamp", key: "created_at", width: 22 }
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "3B82F6" }
    };

    serials.forEach((s) => {
      const row = worksheet.addRow({
        id: s.id,
        product_id: s.product_id,
        product_name: s.product_name || "N/A",
        serial_number: s.serial_number,
        status: String(s.status).toUpperCase(),
        batch_number: s.batch_number || "N/A",
        base_warranty_months: s.base_warranty_months !== null ? s.base_warranty_months : "Legacy",
        policy_mode: s.is_legacy ? "Legacy" : "New E-Warranty",
        notes: s.notes || "",
        user_name: s.user_name || "",
        registered_at: s.registered_at ? new Date(s.registered_at).toLocaleString() : "",
        created_at: s.created_at ? new Date(s.created_at).toLocaleString() : ""
      });

      const statusCell = row.getCell("status");
      if (s.status === "available") {
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "D1FAE5" } };
        statusCell.font = { color: { argb: "065F46" } };
      } else if (s.status === "registered" || s.status === "sold") {
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDD5" } };
        statusCell.font = { color: { argb: "9A3412" } };
      }
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=registry_serials_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/serials/statistics - Compute core breakdowns and available parameters metrics
router.get("/statistics", async (req, res) => {
  try {
    const productId = req.query.productId;
    const stats = await getProductSerialStats(productId);
    res.json({
      total: stats.total || 0,
      available: stats.available || 0,
      sold: stats.sold || 0,
      registered: stats.registered || 0,
      blocked: stats.blocked || 0
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/serials/validate/:serial - Run checksum integrity testing and verification
router.get("/validate/:serial", async (req, res) => {
  try {
    const { serial } = req.params;
    const cleaned = serial.trim().toUpperCase();
    
    if (!cleaned.includes("-")) {
      const isValidLegacy = /^[A-Z0-9]+$/.test(cleaned);
      return res.json({
        serial: cleaned,
        valid: isValidLegacy,
        message: isValidLegacy ? "Legacy format is structurally valid" : "Invalid legacy string format"
      });
    }

    const lastDashIdx = cleaned.lastIndexOf("-");
    if (lastDashIdx === -1 || lastDashIdx === 0 || lastDashIdx === cleaned.length - 1) {
      return res.json({ serial: cleaned, valid: false, message: "Structural layout verification failed" });
    }

    const baseSerial = cleaned.slice(0, lastDashIdx);
    const originalChecksum = cleaned.slice(lastDashIdx + 1);
    const computedChecksum = generateChecksum(baseSerial);

    const valid = originalChecksum === computedChecksum;
    res.json({
      serial: cleaned,
      valid,
      message: valid ? "Serial number format is valid" : "Invalid token validation checksum mismatch"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/serials/:productId - List all serials for a product
router.get("/:productId", async (req, res) => {
  try {
    const serials = await getProductSerials(req.params.productId);
    res.json({ success: true, serials });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// GET /api/serials/:productId/stats - Get summary statistics for single product context
router.get("/:productId/stats", async (req, res) => {
  try {
    const stats = await getProductSerialStats(req.params.productId);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// POST /api/serials/generate - Advanced Pro Generator featuring customizable date configurations for audits
router.post("/generate", authenticateAdmin, async (req, res) => {
  try {
    const { productId, count, prefix, format = "advanced", base_warranty_months, batchNumber, notes, month, year } = req.body;
    
    if (!productId || !count) {
      return res.status(400).json({ success: false, message: "Product ID and count required" });
    }

    const warrantyMonths = base_warranty_months ? parseInt(base_warranty_months, 10) : null;
    const generatedSerials = new Set();
    
    // Default to the server context date
    const date = new Date();
    let yy = String(date.getFullYear()).slice(-2);
    let mm = String(date.getMonth() + 1).padStart(2, '0');

    // Override time windows if explicit parameters are passed from the administration audit form
    if (year) {
      const yearStr = String(year);
      yy = yearStr.length === 4 ? yearStr.slice(-2) : yearStr.padStart(2, '0');
    }
    if (month) {
      mm = String(month).padStart(2, '0');
    }

    while (generatedSerials.size < count) {
      let newSerial = "";
      if (format === "legacy") {
        const pfx = prefix ? prefix.toUpperCase().slice(0, 3) : "ANR";
        newSerial = `${pfx}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      } else {
        const pfx = prefix ? prefix.toUpperCase().slice(0, 4).padEnd(4, 'X') : "ANRI";
        const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
        const baseSerial = `${pfx}-${yy}${mm}-${randomPart}`;
        const checksum = generateChecksum(baseSerial);
        newSerial = `${baseSerial}-${checksum}`;
      }
      generatedSerials.add(newSerial);
    }

    const result = await addProductSerials(productId, Array.from(generatedSerials), warrantyMonths, batchNumber || null, notes || null);
    
    res.json({ 
      success: true, 
      message: `${generatedSerials.size} Serials generated successfully`,
      count: generatedSerials.size, 
      serials: Array.from(generatedSerials),
      totalGenerated: generatedSerials.size,
      result 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/serials/:productId/add - Manually inject serial batches
router.post("/:productId/add", authenticateAdmin, async (req, res) => {
  try {
    const { serials, base_warranty_months, batchNumber, notes } = req.body;
    const warrantyMonths = base_warranty_months ? parseInt(base_warranty_months, 10) : null;
    const result = await addProductSerials(req.params.productId, serials, warrantyMonths, batchNumber || null, notes || null);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/serials/:productId/:serialId - Update single serial entry properties
router.patch("/:productId/:serialId", authenticateAdmin, async (req, res) => {
  try {
    const { serial_number } = req.body;
    const result = await updateProductSerial(req.params.productId, req.params.serialId, serial_number);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/serials/batch/:batchNumber - Purge entire batch assignments cleanly
router.delete("/batch/:batchNumber", authenticateAdmin, async (req, res) => {
  try {
    const { batchNumber } = req.params;
    const result = await deleteSerialBatch(batchNumber);
    res.json({
      message: "Batch deleted successfully",
      deletedCount: result.deletedCount
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// DELETE /api/serials/:productId/:serialId - Evict discrete serial asset
router.delete("/:productId/:serialId", authenticateAdmin, async (req, res) => {
  try {
    const result = await deleteProductSerial(req.params.productId, req.params.serialId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
