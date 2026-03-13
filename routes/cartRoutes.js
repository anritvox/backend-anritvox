// backend/routes/cartRoutes.js
// Cart: add, update, remove, clear, get - all require user auth
const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/authMiddleware');
const { getCartByUser, upsertCartItem, removeCartItem, clearCart, getCartTotal } = require('../models/cartModel');

// GET /api/cart  - get current user's cart
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { items, total } = await getCartTotal(req.user.id);
    return res.json({ items, total });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to load cart' });
  }
});

// POST /api/cart  - add/update item  { productId, quantity }
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ message: 'productId and quantity (>=1) are required' });
    }
    const items = await upsertCartItem(req.user.id, productId, quantity);
    const total = items.reduce((s, i) => s + i.subtotal, 0);
    return res.json({ items, total: parseFloat(total.toFixed(2)) });
  } catch (err) {
    console.error(err);
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || 'Failed to update cart' });
  }
});

// DELETE /api/cart/:productId  - remove one item
router.delete('/:productId', authenticateUser, async (req, res) => {
  try {
    const items = await removeCartItem(req.user.id, req.params.productId);
    const total = items.reduce((s, i) => s + i.subtotal, 0);
    return res.json({ items, total: parseFloat(total.toFixed(2)) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to remove item' });
  }
});

// DELETE /api/cart  - clear entire cart
router.delete('/', authenticateUser, async (req, res) => {
  try {
    await clearCart(req.user.id);
    return res.json({ items: [], total: 0 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to clear cart' });
  }
});

module.exports = router;
