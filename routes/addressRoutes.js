const express = require('express');
const router = express.Router();
const { AddressModel } = require('../models/addressModel');
const { authenticateUser } = require('../middleware/authMiddleware');
const pool = require('../config/db');

router.get('/', authenticateUser, async (req, res) => {
  try {
    const addresses = await AddressModel.getAddressesByUser(req.user.id);
    res.json({ 
      success: true, 
      data: addresses,
      addresses: addresses 
    });
  } catch (error) {
    console.error("[Address API GET Error]:", error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch addresses' });
  }
});

router.post('/', authenticateUser, async (req, res) => {
  try {
    const { full_name, phone, line1, pincode, city, state } = req.body;
    
    if (!full_name || !phone || !line1 || !pincode || !city || !state) {
      return res.status(400).json({ 
        success: false, 
        message: 'All required address fields must be filled.' 
      });
    }

    await AddressModel.createAddress(req.user.id, req.body);
    const updatedAddresses = await AddressModel.getAddressesByUser(req.user.id);
    
    res.status(201).json({ 
      success: true, 
      message: 'Address saved successfully', 
      data: updatedAddresses,
      addresses: updatedAddresses
    });
  } catch (error) {
    console.error("[Address API POST Error]:", error.message);
    res.status(500).json({ success: false, message: 'Failed to save address' });
  }
});

router.patch('/:id/default', authenticateUser, async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.user.id;

    const success = await AddressModel.setAsDefault(userId, addressId);

    if (!success) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    const updatedAddresses = await AddressModel.getAddressesByUser(userId);
    res.json({ success: true, message: 'Default address updated', data: updatedAddresses });
  } catch (error) {
    console.error("[Address API PATCH Error]:", error.message);
    res.status(500).json({ success: false, message: 'Failed to update default address' });
  }
});

router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const success = await AddressModel.deleteAddress(req.user.id, req.params.id);

    if (!success) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    const updatedAddresses = await AddressModel.getAddressesByUser(req.user.id);
    res.json({ success: true, message: 'Address deleted', data: updatedAddresses });
  } catch (error) {
    console.error("[Address API DELETE Error]:", error.message);
    res.status(500).json({ success: false, message: 'Failed to delete address' });
  }
});

module.exports = router;
