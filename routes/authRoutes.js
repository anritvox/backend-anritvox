const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require('../config/db');
const { sendMail } = require('../utils/mail');

// Import Rate Limiters
const { registerLimiter, loginLimiter, otpLimiter } = require('../middleware/rateLimiter');

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

// Disposable email domains to block
const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'tempmail.com', 'guerrillamail.com',
  '10minutemail.com', 'throwaway.email', 'getnada.com',
  'trashmail.com', 'maildrop.cc', 'sharklasers.com'
];

/**
 * @route POST /api/auth/register
 * @desc Step 1: Request OTP for registration (with Turnstile + input validation)
 */
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, password, phone, turnstileToken } = req.body;

    // 1. Basic input validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    // 2. Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // 3. Block disposable email domains
    const emailDomain = email.split('@')[1].toLowerCase();
    if (DISPOSABLE_DOMAINS.includes(emailDomain)) {
      return res.status(400).json({ message: "Disposable email addresses are not allowed" });
    }

    // 4. Password strength check
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    // 5. Verify Cloudflare Turnstile token (if enabled)
    if (process.env.TURNSTILE_SECRET_KEY && turnstileToken) {
      const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: turnstileToken
        })
      });
      const turnstileData = await turnstileRes.json();
      if (!turnstileData.success) {
        return res.status(400).json({ message: "Bot verification failed. Please try again." });
      }
    }

    // 6. Check if email already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    // 7. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPassword = await bcrypt.hash(password, 10);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // 8. Save to pending_registrations table (upsert)
    await pool.query(
      `INSERT INTO pending_registrations (name, email, password, phone, otp, otp_expiry)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE otp=?, otp_expiry=?, created_at=NOW()`,
      [name, email, hashedPassword, phone, otp, otpExpiry, otp, otpExpiry]
    );

    // 9. Send OTP email
    await sendMail({
      to: email,
      subject: 'Verify your Anritvox account',
      html: `<h3>Welcome to Anritvox!</h3><p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
      text: `Your verification code is: ${otp}. Valid for 10 minutes.`
    });

    res.json({ success: true, message: "OTP sent to your email. Please verify to complete registration." });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
});

/**
 * @route POST /api/auth/verify-email
 * @desc Step 2: Verify OTP and create user account
 */
router.post("/verify-email", otpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    // 1. Get pending registration
    const [rows] = await pool.query('SELECT * FROM pending_registrations WHERE email = ?', [email]);
    const pending = rows[0];

    if (!pending) {
      return res.status(404).json({ message: "No pending registration found for this email" });
    }

    // 2. Check OTP validity
    if (pending.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (new Date() > new Date(pending.otp_expiry)) {
      return res.status(400).json({ message: "OTP has expired. Please register again." });
    }

    // 3. Create the actual user
    const insertId = await createUser({
      name: pending.name,
      email: pending.email,
      password: pending.password, // Already hashed
      phone: pending.phone
    });

    // 4. Delete pending registration
    await pool.query('DELETE FROM pending_registrations WHERE email = ?', [email]);

    // 5. Get user and generate token
    const user = await getUserById(insertId);
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ message: "Server error during email verification" });
  }
});

/**
 * @route POST /api/auth/login
 * @desc Smart Login (Customer/Admin) with Brute-Force Protection
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
 * @route GET /api/auth/me
 * @desc Verify admin token + return profile
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
 * @route PUT /api/auth/me
 * @desc Update admin profile (Email)
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
 * @route POST /api/auth/change-password
 * @desc Secure Admin password update
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
