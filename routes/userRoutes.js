// backend/routes/userRoutes.js
// Customer auth: register + login + profile
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const {
  createUser, getUserByEmail, getUserById, verifyPassword, updateUser
} = require('../models/userModel');

// Middleware: verify user JWT
const userAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

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
    const id = await createUser({ name, email, password, phone });
    const token = jwt.sign({ id, email, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ token, user: { id, name, email, phone, role: 'customer' } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Registration failed' });
  }
});

// POST /api/users/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    if (!user.is_active) return res.status(403).json({ message: 'Account is disabled' });
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Login failed' });
  }
});

// GET /api/users/me  (auth required)
router.get('/me', userAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch user' });
  }
});

// PUT /api/users/me  (auth required)
router.put('/me', userAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    await updateUser(req.user.id, { name, phone });
    const user = await getUserById(req.user.id);
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: 'Update failed' });
  }
});

module.exports = { router, userAuth };
