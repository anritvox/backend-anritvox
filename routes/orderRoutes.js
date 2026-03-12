// backend/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const { userAuth } = require('./userRoutes');
const { createOrder, getOrdersByUser } = require('../models/orderModel');
const { getCartByUser, clearCart } = require('../models/cartModel');
const { getAddressesByUser } = require('../models/addressModel');

// POST /api/orders  (create COD order from cart)
router.post('/', userAuth, async (req, res) => {
  try {
    const { addressId, deliveryType } = req.body;
    if (!addressId) return res.status(400).json({ message: 'addressId is required' });

    const addresses = await getAddressesByUser(req.user.id);
    const address = addresses.find(a => a.id === parseInt(addressId));
    if (!address) return res.status(404).json({ message: 'Address not found' });

    const items = await getCartByUser(req.user.id);
    if (!items.length) return res.status(400).json({ message: 'Cart is empty' });

    const total = items.reduce((sum, i) => sum + parseFloat(i.price) * i.quantity, 0);

    const orderId = await createOrder(req.user.id, {
      items,
      total: total.toFixed(2),
      addressSnapshot: address,
      deliveryType: deliveryType || 'standard'
    });

    await clearCart(req.user.id);

    return res.status(201).json({ orderId, message: 'Order placed successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to create order' });
  }
});

// GET /api/orders  (my orders)
router.get('/', userAuth, async (req, res) => {
  try {
    const orders = await getOrdersByUser(req.user.id);
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load orders' });
  }
});

module.exports = router;
