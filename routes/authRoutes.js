// backend/routes/authRoutes.js
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { getAdminByEmail, verifyPassword, updateAdminPassword } = require("../models/adminModel");
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

// POST /api/auth/change-password  (admin must be logged in)
router.post("/change-password", async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const payload = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
    if (payload.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Both current and new passwords are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }
    const admin = await getAdminByEmail(payload.email);
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

// GET /api/auth/me  (verify current admin token)
router.get("/me", async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const payload = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
    if (payload.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json({ id: payload.id, email: payload.email, role: "admin" });
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
});

module.exports = router;
