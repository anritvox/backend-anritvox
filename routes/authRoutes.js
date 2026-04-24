const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require('../config/db');
const { sendMail } = require('../utils/mail');
const { registerLimiter, loginLimiter, otpLimiter } = require('../middleware/rateLimiter');
const { authenticateAdmin } = require('../middleware/authMiddleware');

const { getAdminByEmail, getAdminById, verifyPassword: verifyAdminPassword, updateAdminPassword } = require("../models/adminModel");
const { createUser, getUserByEmail, getUserById, verifyPassword: verifyCustomerPassword } = require("../models/userModel");

const router = express.Router();

const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'throwaway.email', 'getnada.com', 'trashmail.com', 'maildrop.cc', 'sharklasers.com'
];

/**
 * @route POST /api/auth/admin/login
 * @desc STRICT ADMIN LOGIN - Only checks admin_users table
 */
router.post("/admin/login", loginLimiter, async (req, res) => {
  try {
    const { email, password, turnstileToken } = req.body;

    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    // Turnstile Validation
    if (process.env.TURNSTILE_SECRET_KEY && turnstileToken) {
      const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: turnstileToken })
      });
      const turnstileData = await turnstileRes.json();
      if (!turnstileData.success) return res.status(400).json({ message: "Security verification failed." });
    }

    const admin = await getAdminByEmail(email);
    if (!admin) return res.status(401).json({ message: "Invalid admin credentials" });

    const validAdmin = await verifyAdminPassword(password, admin.password_hash);
    if (!validAdmin) return res.status(401).json({ message: "Invalid admin credentials" });

    const token = jwt.sign({ id: admin.id, email: admin.email, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.json({ token, admin: { id: admin.id, email: admin.email, role: "admin" } });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route POST /api/auth/login
 * @desc CUSTOMER LOGIN - Only checks users table
 */
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const customer = await getUserByEmail(email);
    if (!customer) return res.status(401).json({ message: "Invalid credentials" });

    const validCustomer = await verifyCustomerPassword(password, customer.password_hash);
    if (!validCustomer) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: customer.id, email: customer.email, role: customer.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.json({ token, user: { id: customer.id, name: customer.name, email: customer.email, role: customer.role } });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Name, email, and password are required" });

    const emailDomain = email.split('@')[1].toLowerCase();
    if (DISPOSABLE_DOMAINS.includes(emailDomain)) return res.status(400).json({ message: "Disposable emails not allowed" });
    if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });

    const existingUser = await getUserByEmail(email);
    if (existingUser) return res.status(409).json({ message: "Email already registered" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPassword = await bcrypt.hash(password, 10);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO pending_registrations (name, email, password, phone, otp, otp_expiry) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE otp=?, otp_expiry=?, created_at=NOW()`,
      [name, email, hashedPassword, phone, otp, otpExpiry, otp, otpExpiry]
    );

    await sendMail({
      to: email, subject: 'Verify your Anritvox account', html: `<h3>Welcome to Anritvox!</h3><p>Your verification code is: <strong>${otp}</strong></p>`
    });

    res.json({ success: true, message: "OTP sent to email." });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

router.post("/verify-email", otpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "Email and OTP required" });

    const [rows] = await pool.query('SELECT * FROM pending_registrations WHERE email = ?', [email]);
    const pending = rows[0];

    if (!pending) return res.status(404).json({ message: "No pending registration found" });
    if (pending.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });
    if (new Date() > new Date(pending.otp_expiry)) return res.status(400).json({ message: "OTP expired." });

    const insertId = await createUser({ name: pending.name, email: pending.email, password: pending.password, phone: pending.phone });
    await pool.query('DELETE FROM pending_registrations WHERE email = ?', [email]);

    const user = await getUserById(insertId);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

router.get("/me", authenticateAdmin, async (req, res) => {
  try {
    const admin = await getAdminById(req.admin.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    return res.json({ id: admin.id, email: admin.email, role: "admin" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

router.put("/me", authenticateAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    const [existing] = await pool.query('SELECT id FROM admin_users WHERE email = ? AND id != ?', [email, req.admin.id]);
    if (existing.length > 0) return res.status(409).json({ message: "Email registered to another admin." });

    await pool.query('UPDATE admin_users SET email=? WHERE id=?', [email, req.admin.id]);
    return res.json({ message: "Profile updated", email });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

router.post("/change-password", authenticateAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Passwords required" });
    if (newPassword.length < 6) return res.status(400).json({ message: "New password min 6 chars" });

    const admin = await getAdminByEmail(req.admin.email);
    const valid = await verifyAdminPassword(currentPassword, admin.password_hash);
    if (!valid) return res.status(401).json({ message: "Current password incorrect" });

    const hash = await bcrypt.hash(newPassword, 10);
    await updateAdminPassword(admin.id, hash);
    res.json({ message: "Password updated successfully" });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

module.exports = router;
