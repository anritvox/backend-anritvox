const express = require('express');
const router = express.Router();
const { AddressModel } = require('../models/addressModel');
const { authenticateUser } = require('../middleware/authMiddleware');
const pool = require('../config/db');

/**
 * @route   GET /api/addresses
 * @desc    Get all saved addresses for the authenticated user
 * @access  Private
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const addresses = await AddressModel.getUserAddresses(req.user.id);
    // Returning both formats to ensure frontend compatibility
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

/**
 * @route   POST /api/addresses
 * @desc    Create a new address for the authenticated user
 * @access  Private
 */
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { full_name, phone, line1, pincode, city, state } = req.body;
    
    // Validate required fields matching Checkout.jsx form
    if (!full_name || !phone || !line1 || !pincode || !city || !state) {
      return res.status(400).json({ 
        success: false, 
        message: 'All required address fields must be filled.' 
      });
    }

    await AddressModel.createAddress(req.user.id, req.body);
    
    // Fetch updated list to return to frontend as expected by Checkout.jsx
    const updatedAddresses = await AddressModel.getUserAddresses(req.user.id);
    
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

/**
 * @route   PATCH /api/addresses/:id/default
 * @desc    Set a specific address as the default
 * @access  Private
 */
router.patch('/:id/default', authenticateUser, async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.user.id;

    // Transactional update to ensure only one default exists
    await pool.query('UPDATE addresses SET is_default = FALSE WHERE user_id = ?', [userId]);
    const [result] = await pool.query(
      'UPDATE addresses SET is_default = TRUE WHERE id = ? AND user_id = ?', 
      [addressId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    const updatedAddresses = await AddressModel.getUserAddresses(userId);
    res.json({ success: true, message: 'Default address updated', data: updatedAddresses });
  } catch (error) {
    console.error("[Address API PATCH Error]:", error.message);
    res.status(500).json({ success: false, message: 'Failed to update default address' });
  }
});

/**
 * @route   DELETE /api/addresses/:id
 * @desc    Remove an address
 * @access  Private
 */
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM addresses WHERE id = ? AND user_id = ?', 
      [req.params.id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    const updatedAddresses = await AddressModel.getUserAddresses(req.user.id);
    res.json({ success: true, message: 'Address deleted', data: updatedAddresses });
  } catch (error) {
    console.error("[Address API DELETE Error]:", error.message);
    res.status(500).json({ success: false, message: 'Failed to delete address' });
  }
});

module.exports = router;
