// backend/routes/adminUserRoutes.js
// Admin: full CRUD for users + view/update orders + reset user password
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/authMiddleware');
const {
  getAllUsers,
  getUserById,
  getUserByEmail,
  updateUserStatus,
  updateUserPassword,
  deleteUser,
} = require('../models/userModel');
const { getAllOrders, updateOrderStatus, getOrderById } = require('../models/orderModel');
const { sendMail } = require('../utils/mail');

// ─── USERS ───────────────────────────────────────────────────────────

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

// PUT /api/admin/users/:id/status { is_active: 0|1 }
router.put('/users/:id/status', authenticateAdmin, async (req, res) => {
  try {
    await updateUserStatus(req.params.id, req.body.is_active);
    return res.json({ message: 'User status updated' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update user status' });
  }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', authenticateAdmin, async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const { newPassword } = req.body;
    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      const hash = await bcrypt.hash(newPassword, 10);
      await updateUserPassword(user.id, hash);
      return res.json({ message: `Password for ${user.email} has been reset.` });
    }
    const { saveResetOtp } = require('../models/userModel');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    await saveResetOtp(user.id, otp, expiresAt);
    await sendMail({
      to: user.email,
      subject: 'Your Anritvox Password Reset OTP',
      html: `<p>An administrator has triggered a password reset for your account.</p><p>Your OTP is: <strong>${otp}</strong></p><p>It expires in 15 minutes.</p>`,
      text: `Admin triggered reset. OTP: ${otp}. Expires in 15 minutes.`,
    });
    return res.json({ message: `Password reset OTP sent to ${user.email}.` });
  } catch (err) {
    console.error('Admin reset-password error:', err);
    return res.status(500).json({ message: 'Failed to reset password' });
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

// ─── ORDERS ───────────────────────────────────────────────────────────

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

// PUT /api/admin/orders/:id/status { status: 'shipped' }
router.put('/orders/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const validStatuses = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned'];
    if (!validStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    await updateOrderStatus(req.params.id, req.body.status);
    return res.json({ message: 'Order status updated' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update order status' });
  }
});

// GET /api/admin/orders/export/csv - Export orders as CSV
router.get('/orders/export/csv', authenticateAdmin, async (req, res) => {
  try {
    const orders = await getAllOrders();
    const headers = ['ID', 'Status', 'Total', 'Customer Email', 'Created'];
    const rows = orders.map(o => [
      o.id, o.status, o.total_amount || 0, o.email || '', o.created_at || ''
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ message: 'Export failed' });
  }
});

// GET /api/admin/dashboard - Dashboard summary stats
router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    const pool = require('../config/db');
    const [[{ totalOrders }]] = await pool.query('SELECT COUNT(*) as totalOrders FROM orders');
    const [[{ totalRevenue }]] = await pool.query('SELECT COALESCE(SUM(total_amount), 0) as totalRevenue FROM orders WHERE status != "cancelled"');
    const [[{ totalUsers }]] = await pool.query('SELECT COUNT(*) as totalUsers FROM users');
    const [[{ totalProducts }]] = await pool.query('SELECT COUNT(*) as totalProducts FROM products WHERE status = "active"');
    const [[{ pendingOrders }]] = await pool.query('SELECT COUNT(*) as pendingOrders FROM orders WHERE status = "pending"');
    return res.json({ totalOrders, totalRevenue: parseFloat(totalRevenue), totalUsers, totalProducts, pendingOrders });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return res.status(500).json({ message: 'Failed to load stats' });
  }
});

// POST /api/admin/orders/bulk-status - Bulk update order status
router.post('/orders/bulk-status', authenticateAdmin, async (req, res) => {
  try {
    const { orderIds, status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: 'Invalid status' });
    if (!Array.isArray(orderIds) || orderIds.length === 0) return res.status(400).json({ message: 'No order IDs provided' });
    const pool = require('../config/db');
    await pool.query('UPDATE orders SET status = ?, updated_at = NOW() WHERE id IN (?)', [status, orderIds]);
    return res.json({ message: `${orderIds.length} orders updated to ${status}` });
  } catch (err) {
    return res.status(500).json({ message: 'Bulk update failed' });
  }
});

// GET /api/admin/customers/segments - Customer segmentation
router.get('/customers/segments', authenticateAdmin, async (req, res) => {
  try {
    const pool = require('../config/db');
    const [vip] = await pool.query('SELECT u.id, u.name, u.email, COUNT(o.id) as order_count, SUM(o.total_amount) as total_spent FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id HAVING order_count >= 5 ORDER BY total_spent DESC LIMIT 50');
    const [newCustomers] = await pool.query('SELECT u.id, u.name, u.email, u.created_at FROM users u WHERE u.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) ORDER BY u.created_at DESC LIMIT 50');
    return res.json({ vip, newCustomers });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load segments' });
  }
});

module.exports = router;
