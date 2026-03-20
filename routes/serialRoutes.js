const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { authenticateAdmin } = require('../middleware/authMiddleware');
const { 
  addSerials, 
  checkSerial, 
  getSerialsByProduct, 
  getAllSerials,
  updateSerialStatus, 
  deleteSerial,
  deleteBatch,
  getSerialStatistics,
  validateSerialChecksum
} = require('../models/serialModel');

// ========== ADMIN: Bulk Generate Serials ==========
router.post('/generate', authenticateAdmin, async (req, res) => {
  try {
    const { productId, count, batchNumber, prefix } = req.body;
    
    if (!productId || !count) {
      return res.status(400).json({ message: 'Product ID and Count are required' });
    }
    
    if (prefix && prefix.length !== 4) {
      return res.status(400).json({ message: 'Prefix must be exactly 4 characters long' });
    }
    
    const serials = await addSerials(productId, count, batchNumber, prefix || 'ANRI');
    res.status(201).json({ 
      message: `${count} Serials generated successfully`, 
      count: serials.length,
      serials: serials.slice(0, 10), // Return first 10 for preview
      totalGenerated: serials.length
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== ADMIN: Get Serials by Product with Pagination ==========
router.get('/product/:productId', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 100, status, sortBy, sortOrder } = req.query;
    const result = await getSerialsByProduct(req.params.productId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      sortBy,
      sortOrder
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== ADMIN: Get All Serials with Advanced Filtering ==========
router.get('/all', authenticateAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 100, 
      status, 
      productId, 
      batchNumber,
      searchTerm,
      sortBy, 
      sortOrder 
    } = req.query;
    
    const result = await getAllSerials({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      productId: productId ? parseInt(productId) : null,
      batchNumber,
      searchTerm,
      sortBy,
      sortOrder
    });
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== ADMIN: Export Serials to Excel ==========
router.get('/export/excel', authenticateAdmin, async (req, res) => {
  try {
    const { 
      status, 
      productId, 
      batchNumber,
      searchTerm
    } = req.query;
    
    // Get all matching serials (no pagination for export)
    const result = await getAllSerials({
      page: 1,
      limit: 1000000, // Large limit to get all records
      status,
      productId: productId ? parseInt(productId) : null,
      batchNumber,
      searchTerm,
      sortBy: 'created_at',
      sortOrder: 'DESC'
    });
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Serial Numbers');
    
    // Define columns
    worksheet.columns = [
      { header: 'Serial Number', key: 'serial_number', width: 25 },
      { header: 'Product Name', key: 'product_name', width: 30 },
      { header: 'Product ID', key: 'product_id', width: 12 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Batch Number', key: 'batch_number', width: 20 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20 },
      { header: 'Updated At', key: 'updated_at', width: 20 }
    ];
    
    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    // Add data rows
    result.serials.forEach(serial => {
      const row = worksheet.addRow({
        serial_number: serial.serial_number,
        product_name: serial.product_name || 'N/A',
        product_id: serial.product_id,
        status: serial.status,
        batch_number: serial.batch_number || 'N/A',
        notes: serial.notes || '',
        created_at: serial.created_at,
        updated_at: serial.updated_at
      });
      
      // Add color coding based on status
      if (serial.status === 'available') {
        row.getCell('status').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF92D050' }
        };
      } else if (serial.status === 'sold') {
        row.getCell('status').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC000' }
        };
      } else if (serial.status === 'registered') {
        row.getCell('status').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF00B0F0' }
        };
      } else if (serial.status === 'blocked') {
        row.getCell('status').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF0000' }
        };
      }
    });
    
    // Set response headers
    const fileName = `serials_${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    
    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ========== ADMIN: Get Serial Statistics ==========
router.get('/statistics', authenticateAdmin, async (req, res) => {
  try {
    const { productId } = req.query;
    const stats = await getSerialStatistics(productId ? parseInt(productId) : null);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== PUBLIC: Check Serial Status / Product Finder ==========
router.get('/check/:serial', async (req, res) => {
  try {
    const data = await checkSerial(req.params.serial);
    if (!data) {
      return res.status(404).json({ message: 'Invalid Serial Number.' });
    }
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ========== PUBLIC: Validate Serial Checksum ==========
router.get('/validate/:serial', async (req, res) => {
  try {
    const isValid = validateSerialChecksum(req.params.serial);
    res.json({ 
      serial: req.params.serial,
      valid: isValid,
      message: isValid ? 'Serial number format is valid' : 'Invalid serial number format or checksum'
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== ADMIN: Update Serial Status ==========
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    await updateSerialStatus(req.params.id, status, notes);
    res.json({ message: 'Serial status updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== ADMIN: Delete Single Serial ==========
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await deleteSerial(req.params.id);
    res.json({ message: 'Serial deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ========== ADMIN: Delete Entire Batch ==========
router.delete('/batch/:batchNumber', authenticateAdmin, async (req, res) => {
  try {
    const deletedCount = await deleteBatch(req.params.batchNumber);
    res.json({ 
      message: `Batch deleted successfully`, 
      deletedCount 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
