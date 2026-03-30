const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const excel = require("exceljs");
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

const generateChecksum = (baseString) => {
  let sum = 0;
  for (let i = 0; i < baseString.length; i++) sum += baseString.charCodeAt(i);
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

// GET /api/serials/export/excel - Native Excel Export
router.get("/export/excel", authenticateAdmin, async (req, res) => {
  try {
    const { productId, status } = req.query;
    
    let query = `
      SELECT ps.serial_number, ps.status, ps.created_at, p.name as product_name
      FROM product_serials ps
      JOIN products p ON ps.product_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (productId) {
      query += ` AND ps.product_id = ?`;
      params.push(productId);
    }
    if (status) {
      query += ` AND ps.status = ?`;
      params.push(status);
    }
    
    query += ` ORDER BY ps.created_at DESC`;
    const [serials] = await pool.query(query, params);

    const workbook = new excel.Workbook();
    const worksheet = workbook.addWorksheet("Serials Inventory");

    worksheet.columns = [
      { header: "Serial Number", key: "serial_number", width: 30 },
      { header: "Product Name", key: "product_name", width: 40 },
      { header: "Status", key: "status", width: 15 },
      { header: "Created At", key: "created_at", width: 25 }
    ];

    // Style the header row for visual clarity
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };

    worksheet.addRows(serials);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Anritvox_Serials_${new Date().getTime()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Export generation failed:", err);
    res.status(500).json({ success: false, message: "Failed to generate Excel file." });
  }
});

// POST /api/serials/generate - Advanced Pro Generator
router.post("/generate", authenticateAdmin, async (req, res) => {
  try {
    const { productId, count, prefix, format = "advanced" } = req.body;
    if (!productId || !count || count <= 0) {
      return res.status(400).json({ message: "Product ID and a valid Count are required" });
    }

    const generatedSerials = new Set(); 

    while (generatedSerials.size < count) {
      let newSerial = "";

      if (format === "legacy") {
        const customString = prefix ? prefix.toUpperCase() : "CUSTOM";
        if (customString.length !== 6) {
          return res.status(400).json({ message: "Model Prefix must be exactly 6 characters for legacy format" });
        }
        const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
        newSerial = `${customString}${randomPart}`;
      } else {
        const pfx = prefix ? prefix.toUpperCase().slice(0, 4).padEnd(4, 'X') : "ANRI";
        const date = new Date();
        const yy = String(date.getFullYear()).slice(-2);
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
        const baseSerial = `${pfx}-${yy}${mm}-${randomPart}`;
        const checksum = generateChecksum(baseSerial); 
        newSerial = `${baseSerial}-${checksum}`;
      }
      generatedSerials.add(newSerial); 
    }

    const serialArray = Array.from(generatedSerials);
    const result = await addProductSerials(productId, serialArray);
    const [[product]] = await pool.query("SELECT quantity FROM products WHERE id = ?", [productId]);

    res.status(201).json({
      message: `${count} Serials generated in ${format} format.`,
      formatUsed: format,
      count: result.added,
      serialsPreview: serialArray.slice(0, 10), 
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

// POST /api/serials/validate-checksum (Frontend instant verify)
router.post("/validate-checksum", async (req, res) => {
  const { serial } = req.body;
  if (!serial) return res.status(400).json({ valid: false });
  
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
