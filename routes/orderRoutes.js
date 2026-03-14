// backend/routes/orderRoutes.js
// Orders: checkout, customer history, admin management
const express = require('express');
const router = express.Router();
const { authenticateUser, authenticateAdmin } = require('../middleware/authMiddleware');
const { createOrder, getOrdersByUser, getAllOrders, getOrderById, updateOrderStatus, updatePaymentStatus } = require('../models/orderModel');
const { getCartTotal, clearCart } = require('../models/cartModel');
const { getAddressesByUser } = require('../models/addressModel');

// ─── CUSTOMER ROUTES ─────────────────────────────────────────────

// POST /api/orders  - place order from cart
// Body: { addressId, deliveryType, paymentMode, couponCode, notes }
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { addressId, deliveryType, paymentMode, couponCode, notes } = req.body;
    if (!addressId) return res.status(400).json({ message: 'addressId is required' });

    // Verify address belongs to user
    const addresses = await getAddressesByUser(req.user.id);
    const address = addresses.find((a) => a.id === parseInt(addressId));
    if (!address) return res.status(404).json({ message: 'Address not found' });

    // Get cart
    const { items, total: cartTotal } = await getCartTotal(req.user.id);
    if (!items.length) return res.status(400).json({ message: 'Cart is empty' });

    // Apply coupon if provided
    let discount = 0;
    let resolvedCoupon = null;
    const pool = require('../config/db'); // ensure pool is available for the coupon check
    if (couponCode) {
      const [coupons] = await pool.query(
        `SELECT * FROM coupons WHERE code=? AND is_active=1
         AND (valid_from IS NULL OR valid_from <= NOW())
         AND (valid_until IS NULL OR valid_until >= NOW())`,
        [couponCode.toUpperCase()]
      );
      const coupon = coupons[0];
      if (coupon) {
        if (cartTotal >= (coupon.min_order_value || 0)) {
          discount = coupon.type === 'percentage'
            ? Math.min(cartTotal * coupon.value / 100, coupon.max_discount || Infinity)
            : coupon.value;
          discount = parseFloat(Math.min(discount, cartTotal).toFixed(2));
          resolvedCoupon = coupon.code;
          // Increment usage
          await pool.query('UPDATE coupons SET used_count=used_count+1 WHERE id=?', [coupon.id]);
        }
      }
    }

    const subtotal = cartTotal;
    const total = parseFloat((subtotal - discount).toFixed(2));

    const orderId = await createOrder(req.user.id, {
      items,
      subtotal,
      discount,
      total,
      couponCode: resolvedCoupon,
      addressSnapshot: address,
      deliveryType: deliveryType || 'standard',
      paymentMode: paymentMode || 'COD',
      notes: notes || null,
    });

    await clearCart(req.user.id);
    return res.status(201).json({ orderId, message: 'Order placed successfully', total, discount });
  } catch (err) {
    console.error('Place order error:', err);
    // 🔴 THIS IS THE FIX: We now send the exact database error back to the frontend
    const errorMsg = err.sqlMessage || err.message || 'Failed to create order';
    return res.status(500).json({ message: `Database Error: ${errorMsg}` });
  }
});

// GET /api/orders/my  - my orders
router.get('/my', authenticateUser, async (req, res) => {
  try {
    const orders = await getOrdersByUser(req.user.id);
    return res.json(orders);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to load orders' });
  }
});

// GET /api/orders  - my orders (alias)
router.get('/', authenticateUser, async (req, res) => {
  try {
    const orders = await getOrdersByUser(req.user.id);
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load orders' });
  }
});

// GET /api/orders/:id  - single order detail
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    // Ensure user can only see their own orders
    if (order.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    return res.json(order);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load order' });
  }
});

// POST /api/orders/:id/cancel  - customer cancels order
router.post('/:id/cancel', authenticateUser, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.user_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
    const cancellableStatuses = ['pending', 'confirmed'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({ message: `Cannot cancel an order with status '${order.status}'` });
    }
    const { reason } = req.body;
    await updateOrderStatus(order.id, 'cancelled', reason || 'Cancelled by customer');
    return res.json({ message: 'Order cancelled successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to cancel order' });
  }
});

// POST /api/orders/:id/return  - customer requests return
router.post('/:id/return', authenticateUser, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.user_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
    if (order.status !== 'delivered') {
      return res.status(400).json({ message: 'Only delivered orders can be returned' });
    }
    const { reason } = req.body;
    await updateOrderStatus(order.id, 'returned', reason || 'Return requested by customer');
    return res.json({ message: 'Return request submitted successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to submit return request' });
  }
});

module.exports = router;
