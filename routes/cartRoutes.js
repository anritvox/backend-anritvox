// backend/routes/cartRoutes.js
const express = require('express');
const router = express.Router();
const { userAuth } = require('./userRoutes');
const { getCartByUser, upsertCartItem, removeCartItem, clearCart } = require('../models/cartModel');

// GET /api/cart
router.get('/', userAuth, async (req, res) => {
  try {
    const items = await getCartByUser(req.user.id);
    return res.json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to load cart' });
  }
});

// POST /api/cart  { productId, quantity }
router.post('/', userAuth, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ message: 'productId and quantity required' });
    }
    await upsertCartItem(req.user.id, productId, quantity);
    const items = await getCartByUser(req.user.id);
    return res.json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to update cart' });
  }
});

// DELETE /api/cart/:productId
router.delete('/:productId', userAuth, async (req, res) => {
  try {
    await removeCartItem(req.user.id, req.params.productId);
    const items = await getCartByUser(req.user.id);
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to remove item' });
  }
});

// DELETE /api/cart  (clear all)
router.delete('/', userAuth, async (req, res) => {
  try {
    await clearCart(req.user.id);
    return res.json([]);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to clear cart' });
  }
});

module.exports = router;
