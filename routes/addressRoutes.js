// backend/routes/addressRoutes.js
const express = require('express');
const router = express.Router();
const { userAuth } = require('./userRoutes');
const { getAddressesByUser, createAddress, updateAddress, deleteAddress } = require('../models/addressModel');

// GET /api/addresses
router.get('/', userAuth, async (req, res) => {
  try {
    const list = await getAddressesByUser(req.user.id);
    return res.json(list);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load addresses' });
  }
});

// POST /api/addresses
router.post('/', userAuth, async (req, res) => {
  try {
    const { full_name, phone, line1, line2, city, state, pincode, is_default } = req.body;
    if (!full_name || !phone || !line1 || !city || !state || !pincode) {
      return res.status(400).json({ message: 'Required fields missing' });
    }
    const id = await createAddress(req.user.id, { full_name, phone, line1, line2, city, state, pincode, is_default });
    const list = await getAddressesByUser(req.user.id);
    return res.status(201).json(list);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create address' });
  }
});

// PUT /api/addresses/:id
router.put('/:id', userAuth, async (req, res) => {
  try {
    await updateAddress(req.params.id, req.user.id, req.body);
    const list = await getAddressesByUser(req.user.id);
    return res.json(list);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update address' });
  }
});

// DELETE /api/addresses/:id
router.delete('/:id', userAuth, async (req, res) => {
  try {
    await deleteAddress(req.params.id, req.user.id);
    const list = await getAddressesByUser(req.user.id);
    return res.json(list);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete address' });
  }
});

module.exports = router;
