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

// ─── USERS ──────────────────────────────────────────────

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

// POST /api/admin/users/:id/reset-password
// Admin triggers a password reset OTP email for the user
router.post('/users/:id/reset-password', authenticateAdmin, async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Option A: admin sets a temporary password directly (if newPassword provided)
    const { newPassword } = req.body;
    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      const hash = await bcrypt.hash(newPassword, 10);
      await updateUserPassword(user.id, hash);
      return res.json({ message: `Password for ${user.email} has been reset.` });
    }

    // Option B: send OTP reset email to user
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

// ─── ORDERS ──────────────────────────────────────────────

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

module.exports = router;
