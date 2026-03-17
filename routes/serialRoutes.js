const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/authMiddleware');
const { addSerials, checkSerial, getSerialsByProduct, updateSerialStatus, deleteSerial } = require('../models/serialModel');

// Admin: Bulk Generate Serials
router.post('/generate', authenticateAdmin, async (req, res) => {
  try {
    const { productId, count, batchNumber, prefix } = req.body;
    if (!productId || !count) return res.status(400).json({ message: 'Product ID and Count are required' });
    if (prefix && prefix.length !== 4) return res.status(400).json({ message: 'Prefix must be exactly 4 characters long' });
    
    const serials = await addSerials(productId, count, batchNumber, prefix || 'ANRI');
    res.status(201).json({ message: `${count} Serials generated successfully`, serials });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: Get Serials by Product (FIX FOR THE HTML PARSE ERROR)
router.get('/product/:productId', authenticateAdmin, async (req, res) => {
  try {
    const serials = await getSerialsByProduct(req.params.productId);
    res.json({ serials });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Public: Check Serial Status / Product Finder
router.get('/check/:serial', async (req, res) => {
  try {
    const data = await checkSerial(req.params.serial);
    if (!data) return res.status(404).json({ message: 'Invalid Serial Number.' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Admin: Get All Serials (Used by fetchAllSerialRecords in api.js)
router.get('/all', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await require('../config/db').query('SELECT * FROM product_serials ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    
// Admin: Update Serial Status
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await updateSerialStatus(req.params.id, status);
    res.json({ message: 'Serial status updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: Delete Serial
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await deleteSerial(req.params.id);
    res.json({ message: 'Serial deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
res.status(500).json({ message: err.message });
  }
});
module.exports = router;
