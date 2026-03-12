// backend/routes/adminUserRoutes.js
// Admin: full CRUD for users + view/update orders
const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/authMiddleware');
const { getAllUsers, getUserById, updateUserStatus, deleteUser } = require('../models/userModel');
const { getAllOrders, updateOrderStatus, getOrderById } = require('../models/orderModel');

// ─── USERS ─────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();
    return res.json(users);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load users' });
  }
});

// GET /api/admin/users/:id
router.get('/users/:id', authenticateAdmin, async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load user' });
  }
});

// PUT /api/admin/users/:id/status  { is_active: 0|1 }
router.put('/users/:id/status', authenticateAdmin, async (req, res) => {
  try {
    await updateUserStatus(req.params.id, req.body.is_active);
    return res.json({ message: 'User status updated' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update user status' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', authenticateAdmin, async (req, res) => {
  try {
    await deleteUser(req.params.id);
    return res.json({ message: 'User deleted' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete user' });
  }
});

// ─── ORDERS ────────────────────────────────────────────

// GET /api/admin/orders
router.get('/orders', authenticateAdmin, async (req, res) => {
  try {
    const orders = await getAllOrders();
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load orders' });
  }
});

// GET /api/admin/orders/:id
router.get('/orders/:id', authenticateAdmin, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    return res.json(order);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load order' });
  }
});

// PUT /api/admin/orders/:id/status  { status: 'shipped' }
router.put('/orders/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const validStatuses = ['pending','confirmed','shipped','delivered','cancelled'];
    if (!validStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    await updateOrderStatus(req.params.id, req.body.status);
    return res.json({ message: 'Order status updated' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update order status' });
  }
});

module.exports = router;
