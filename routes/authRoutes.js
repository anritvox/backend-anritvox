const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require('../config/db');

// Import Rate Limiters
const { registerLimiter, loginLimiter } = require('../middleware/rateLimiter');

const { 
  getAdminByEmail, 
  getAdminById, 
  verifyPassword: verifyAdminPassword, 
  updateAdminPassword 
} = require("../models/adminModel");

const { 
  createUser, 
  getUserByEmail, 
  getUserById, 
  verifyPassword: verifyCustomerPassword 
} = require("../models/userModel");

const { authenticateAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Standard Customer Registration with Rate Limiting
 */
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    // Check if email already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    // Create the customer
    const insertId = await createUser({ name, email, password, phone });
    const user = await getUserById(insertId);

    // Generate Token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Return unified user object
    res.status(201).json({ 
      token, 
      user: { id: user.id, name: user.name, email: user.email, role: user.role } 
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Smart Login (Customer/Admin) with Brute-Force Protection
 */
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // STEP 1: Attempt Customer Login First
    const customer = await getUserByEmail(email);
    if (customer) {
      const validCustomer = await verifyCustomerPassword(password, customer.password_hash);
      if (validCustomer) {
        const token = jwt.sign(
          { id: customer.id, email: customer.email, role: customer.role },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );
        return res.json({ 
          token, 
          user: { id: customer.id, name: customer.name, email: customer.email, role: customer.role } 
        });
      } else {
        return res.status(401).json({ message: "Invalid credentials" });
      }
    }

    // STEP 2: Fallback - Attempt Admin Login
    const admin = await getAdminByEmail(email);
    if (admin) {
      const validAdmin = await verifyAdminPassword(password, admin.password_hash);
      if (validAdmin) {
        const token = jwt.sign(
          { id: admin.id, email: admin.email, role: "admin" },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );
        return res.json({ 
          token, 
          user: { id: admin.id, email: admin.email, role: "admin" } 
        });
      }
    }

    // STEP 3: If completely not found
    return res.status(401).json({ message: "Invalid credentials" });

  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Verify admin token + return profile
 */
router.get("/me", authenticateAdmin, async (req, res) => {
  try {
    const admin = await getAdminById(req.admin.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    return res.json({ id: admin.id, email: admin.email, role: "admin" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   PUT /api/auth/me
 * @desc    Update admin profile (Email)
 */
router.put("/me", authenticateAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    
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

/**
 * @route   POST /api/auth/change-password
 * @desc    Secure Admin password update
 */
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
    
    const valid = await verifyAdminPassword(currentPassword, admin.password_hash);
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
