const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/authMiddleware');
const { addSerials, checkSerial, generateProfessionalSerial } = require('../models/serialModel');

// Admin: Bulk Generate Serials
router.post('/generate', authenticateAdmin, async (req, res) => {
  try {
    const { productId, count, batchNumber, prefix } = req.body;
    if (!productId || !count) return res.status(400).json({ message: 'Product ID and Count are required' });
    
    const serials = await addSerials(productId, count, batchNumber, prefix || 'AV');
    res.status(201).json({ message: `${count} Serials generated successfully`, serials });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Public: Check Serial Status / Product Finder
router.get('/check/:serial', async (req, res) => {
  try {
    const data = await checkSerial(req.params.serial);
    if (!data) return res.status(404).json({ message: 'Invalid Serial Number. Please check and try again.' });
    
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
