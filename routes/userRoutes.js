// backend/routes/userRoutes.js
// Customer auth: register + login + profile + password management
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const {
  createUser,
  getUserByEmail,
  getUserById,
  verifyPassword,
  updateUser,
  updateUserPassword,
  saveResetOtp,
  clearResetOtp,
} = require('../models/userModel');
const { authenticateUser } = require('../middleware/authMiddleware');
const { sendMail } = require('../utils/mail');

// ─── REGISTER ────────────────────────────────────────────
// POST /api/users/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    const jwt = require('jsonwebtoken');
    const id = await createUser({ name, email, password, phone });
    const token = jwt.sign({ id, email, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ token, user: { id, name, email, phone, role: 'customer' } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Registration failed' });
  }
});

// ─── LOGIN ───────────────────────────────────────────────
// POST /api/users/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    if (!user.is_active) return res.status(403).json({ message: 'Account is disabled' });
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Login failed' });
  }
});

// ─── PROFILE ─────────────────────────────────────────────
// GET /api/users/me
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch user' });
  }
});

// PUT /api/users/me
router.put('/me', authenticateUser, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });
    await updateUser(req.user.id, { name, phone });
    const user = await getUserById(req.user.id);
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: 'Update failed' });
  }
});

// ─── CHANGE PASSWORD (logged in) ─────────────────────────
// POST /api/users/change-password
router.post('/change-password', authenticateUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Both current and new passwords are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    const user = await getUserByEmail(req.user.email);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ message: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(user.id, hash);
    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('change-password error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── FORGOT PASSWORD ──────────────────────────────────────
// POST /api/users/forgot-password  { email }
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const user = await getUserByEmail(email);
    // Always return success to avoid user enumeration
    if (!user) return res.json({ message: 'If that email exists, an OTP has been sent.' });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
    await saveResetOtp(user.id, otp, expiresAt);
    await sendMail({
      to: email,
      subject: 'Your Anritvox Password Reset OTP',
      html: `<p>Your OTP to reset your password is: <strong>${otp}</strong></p><p>This OTP expires in 15 minutes.</p>`,
      text: `Your OTP to reset your password is: ${otp}. It expires in 15 minutes.`,
    });
    return res.json({ message: 'If that email exists, an OTP has been sent.' });
  } catch (err) {
    console.error('forgot-password error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ─── RESET PASSWORD ───────────────────────────────────────
// POST /api/users/reset-password  { email, otp, newPassword }
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const user = await getUserByEmail(email);
    if (!user) return res.status(400).json({ message: 'Invalid OTP or email' });
    if (!user.reset_otp || user.reset_otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    if (Date.now() > Number(user.reset_otp_expires)) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(user.id, hash);
    await clearResetOtp(user.id);
    return res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('reset-password error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = { router, userAuth: authenticateUser };
