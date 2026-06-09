// backend/routes/couponRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/authMiddleware');
const { createCoupon, getAllCoupons, getCouponByCode, updateCoupon, deleteCoupon, validateCoupon } = require('../models/couponModel');

// POST /api/coupons/validate - validate coupon (public)
router.post('/validate', async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    if (!code) return res.status(400).json({ message: 'Coupon code is required' });
    const result = await validateCoupon(code, parseFloat(orderTotal) || 0);
    if (!result.valid) return res.status(400).json({ message: result.message });
    res.json({ valid: true, discount: result.discount, coupon: { code: result.coupon.code, discount_type: result.coupon.discount_type, discount_value: result.coupon.discount_value } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to validate coupon' });
  }
});

// GET /api/coupons - admin: get all coupons
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const coupons = await getAllCoupons();
    res.json(coupons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get coupons' });
  }
});

// POST /api/coupons - admin: create coupon
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { code, discount_type, discount_value, min_order_amount, max_discount, usage_limit, expires_at } = req.body;
    if (!code || !discount_type || !discount_value) return res.status(400).json({ message: 'code, discount_type, discount_value are required' });
    const id = await createCoupon(req.body);
    res.status(201).json({ message: 'Coupon created', id });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Coupon code already exists' });
    console.error(err);
    res.status(500).json({ message: 'Failed to create coupon' });
  }
});

// PUT /api/coupons/:id - admin: update coupon
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    await updateCoupon(req.params.id, req.body);
    res.json({ message: 'Coupon updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update coupon' });
  }
});

// DELETE /api/coupons/:id - admin: delete coupon
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await deleteCoupon(req.params.id);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete coupon' });
  }
});

module.exports = router;
