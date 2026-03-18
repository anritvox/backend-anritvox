// Admin auth: login + change-password + profile
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require('../config/db');
const { getAdminByEmail, getAdminById, verifyPassword, updateAdminPassword } = require("../models/adminModel");
const { authenticateAdmin } = require('../middleware/authMiddleware');
const router = express.Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }
    const admin = await getAdminByEmail(email);
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const valid = await verifyPassword(password, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, admin: { id: admin.id, email: admin.email, role: "admin" } });
  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/auth/me  (verify admin token + return full profile)
router.get("/me", authenticateAdmin, async (req, res) => {
  try {
    const admin = await getAdminById(req.admin.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    return res.json({ id: admin.id, email: admin.email, role: "admin" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/auth/me  (update admin profile - email)
router.put("/me", authenticateAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    
    // SECURITY FIX: Check for duplicate email to prevent database crash
    const [existing] = await pool.query('SELECT id FROM admin_users WHERE email = ? AND id != ?', [email, req.admin.id]);
    if (existing.length > 0) {
      return res.status(409).json({ message: "This email is already registered to another admin." });
    }

    await pool.query('UPDATE admin_users SET email=? WHERE id=?', [email, req.admin.id]);
    return res.json({ message: "Profile updated", email });
  } catch (err) {
    console.error("Update admin profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/auth/change-password  (admin must be logged in)
router.post("/change-password", authenticateAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Both current and new passwords are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }
    const admin = await getAdminByEmail(req.admin.email);
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    
    const valid = await verifyPassword(currentPassword, admin.password_hash);
    if (!valid) return res.status(401).json({ message: "Current password is incorrect" });
    
    const hash = await bcrypt.hash(newPassword, 10);
    await updateAdminPassword(admin.id, hash);
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
