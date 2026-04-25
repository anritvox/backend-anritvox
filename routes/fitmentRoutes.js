const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateAdmin } = require('../middleware/authMiddleware');
const multer = require('multer');
const XLSX = require('xlsx');

// Multer memory storage for Excel upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Initialize fitment tables
const initFitmentTables = async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS vehicle_makes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS vehicle_models (
        id INT AUTO_INCREMENT PRIMARY KEY,
        make_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        year_start INT,
        year_end INT,
        FOREIGN KEY (make_id) REFERENCES vehicle_makes(id) ON DELETE CASCADE
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS product_fitment (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        make VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        year_start INT,
        year_end INT,
        bulb_type VARCHAR(50),
        notes TEXT,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_fitment_product (product_id),
        INDEX idx_fitment_make_model (make, model)
      )
    `);
    console.log('[DB] Fitment tables ready');
  } catch (err) {
    console.error('[DB] Fitment table error:', err.message);
  }
};

initFitmentTables();

// GET /api/fitment/check?productId=1&make=BMW&model=3+Series&year=2020
router.get('/check', async (req, res) => {
  try {
    const { productId, make, model, year } = req.query;
    if (!productId || !make || !model) {
      return res.status(400).json({ success: false, message: 'productId, make, model required' });
    }
    const yearNum = parseInt(year) || null;
    let sql = `
      SELECT * FROM product_fitment
      WHERE product_id = ? AND LOWER(make) = LOWER(?)
      AND LOWER(model) LIKE LOWER(?)
    `;
    const params = [productId, make, `%${model}%`];
    if (yearNum) {
      sql += ' AND (year_start IS NULL OR year_start <= ?) AND (year_end IS NULL OR year_end >= ?)';
      params.push(yearNum, yearNum);
    }
    const [rows] = await db.execute(sql, params);
    res.json({ success: true, fits: rows.length > 0, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/fitment/product/:productId - get all fitments for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM product_fitment WHERE product_id = ? ORDER BY make, model, year_start',
      [req.params.productId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/fitment/makes - unique makes list
router.get('/makes', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT DISTINCT make FROM product_fitment ORDER BY make ASC'
    );
    res.json({ success: true, data: rows.map(r => r.make) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/fitment/models?make=BMW
router.get('/models', async (req, res) => {
  try {
    const { make } = req.query;
    const [rows] = await db.execute(
      'SELECT DISTINCT model, year_start, year_end FROM product_fitment WHERE LOWER(make) = LOWER(?) ORDER BY model ASC',
      [make || '']
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/fitment/upload-excel - Admin: Upload Excel fitment data
router.post('/upload-excel', authenticateAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const productId = req.body.productId;
    if (!productId) return res.status(400).json({ success: false, message: 'productId required' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) return res.status(400).json({ success: false, message: 'Empty Excel file' });

    // Delete existing fitment for this product
    await db.execute('DELETE FROM product_fitment WHERE product_id = ?', [productId]);

    // Insert new rows
    // Expected columns: Make, Model, YearStart, YearEnd, BulbType, Notes
    let inserted = 0;
    for (const row of rows) {
      const make = row['Make'] || row['make'] || row['MAKE'];
      const model = row['Model'] || row['model'] || row['MODEL'];
      const yearStart = parseInt(row['YearStart'] || row['year_start'] || row['Year Start']) || null;
      const yearEnd = parseInt(row['YearEnd'] || row['year_end'] || row['Year End']) || null;
      const bulbType = row['BulbType'] || row['bulb_type'] || row['Bulb Type'] || null;
      const notes = row['Notes'] || row['notes'] || null;

      if (!make || !model) continue;

      await db.execute(
        'INSERT INTO product_fitment (product_id, make, model, year_start, year_end, bulb_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [productId, make.trim(), model.trim(), yearStart, yearEnd, bulbType, notes]
      );
      inserted++;
    }

    res.json({ success: true, message: `Imported ${inserted} fitment records`, count: inserted });
  } catch (err) {
    console.error('Fitment upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/fitment/manual - Admin: Add single fitment record
router.post('/manual', authenticateAdmin, async (req, res) => {
  try {
    const { product_id, make, model, year_start, year_end, bulb_type, notes } = req.body;
    if (!product_id || !make || !model) {
      return res.status(400).json({ success: false, message: 'product_id, make, model required' });
    }
    await db.execute(
      'INSERT INTO product_fitment (product_id, make, model, year_start, year_end, bulb_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [product_id, make, model, year_start || null, year_end || null, bulb_type || null, notes || null]
    );
    res.json({ success: true, message: 'Fitment record added' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/fitment/:id - Admin: Delete fitment record
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await db.execute('DELETE FROM product_fitment WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Fitment record deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/fitment/product/:productId/all - Clear all fitment for product
router.delete('/product/:productId/all', authenticateAdmin, async (req, res) => {
  try {
    await db.execute('DELETE FROM product_fitment WHERE product_id = ?', [req.params.productId]);
    res.json({ success: true, message: 'All fitment records cleared' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
