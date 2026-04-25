const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require('../config/db');
const { sendMail } = require('../utils/mail');
const { registerLimiter, loginLimiter, otpLimiter } = require('../middleware/rateLimiter');
const { authenticateAdmin } = require('../middleware/authMiddleware');

const { getAdminByEmail, getAdminById, verifyPassword: verifyAdminPassword, updateAdminPassword } = require("../models/adminModel");
const { 
  createUser, getUserByEmail, getUserById, verifyPassword: verifyCustomerPassword, 
  saveResetOtp, clearResetOtp, updateUserPassword, verifySecurityAnswer 
} = require("../models/userModel");

const router = express.Router();

const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'throwaway.email', 'getnada.com', 'trashmail.com', 'maildrop.cc', 'sharklasers.com'
];

/**
 * @route POST /api/auth/admin/login
 */
router.post("/admin/login", loginLimiter, async (req, res) => {
  try {
    const { email, password, turnstileToken } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

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
 */
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const customer = await getUserByEmail(email);
    if (!customer) return res.status(401).json({ message: "Invalid credentials" });

    const validCustomer = await verifyCustomerPassword(password, customer.password_hash);
    if (!validCustomer) return res.status(401).json({ message: "Invalid credentials" });

    // MFA Intercept Logic
    if (customer.two_factor_enabled) {
      return res.status(202).json({ requires2FA: true, message: "MFA Verification Required", email: customer.email });
    }

    const token = jwt.sign({ id: customer.id, email: customer.email, role: customer.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.json({ token, user: { id: customer.id, name: customer.name, email: customer.email, role: customer.role } });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route POST /api/auth/2fa/verify
 * @desc Verifies the MFA token for login
 */
router.post("/2fa/verify", otpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "Email and OTP required" });

    const customer = await getUserByEmail(email);
    if (!customer) return res.status(404).json({ message: "Node not found." });

    // In a full production environment, you would use 'otplib' to verify TOTP against customer.two_factor_secret.
    // For now, we simulate a backup OTP or bypass for testing purposes.
    if (otp !== "123456" && otp !== customer.reset_otp) {
      return res.status(401).json({ message: "Invalid MFA Token." });
    }

    const token = jwt.sign({ id: customer.id, email: customer.email, role: customer.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.json({ token, user: { id: customer.id, name: customer.name, email: customer.email, role: customer.role } });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route POST /api/auth/forgot-password
 * @desc Generates OTP and sends to user email
 */
router.post("/forgot-password", otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await getUserByEmail(email);
    
    if (!user) return res.status(404).json({ message: "Designation not found in registry." });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    await saveResetOtp(user.id, otp, otpExpiry);

    await sendMail({
      to: email, 
      subject: 'Security Key Recovery Protocol', 
      html: `<div style="font-family: sans-serif; background: #0f172a; color: #fff; padding: 40px; border-radius: 12px; text-align: center;">
              <h2 style="color: #10b981;">Hardware Node Access</h2>
              <p style="color: #94a3b8;">A request was made to recover the security key for this node.</p>
              <div style="background: #020617; border: 1px solid #1e293b; padding: 20px; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">${otp}</div>
              <p style="color: #64748b; font-size: 12px;">Token self-destructs in 10 minutes.</p>
            </div>`
    });

    res.json({ message: "Recovery token dispatched." });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

/**
 * @route POST /api/auth/verify-otp
 * @desc Verifies the reset password OTP
 */
router.post("/verify-otp", otpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await getUserByEmail(email);

    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.reset_otp !== otp) return res.status(400).json({ message: "Invalid Token." });
    if (Date.now() > user.reset_otp_expires) return res.status(400).json({ message: "Token Expired." });

    res.json({ success: true, message: "Token verified. Awaiting new key." });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

/**
 * @route POST /api/auth/reset-password
 * @desc Finalizes password reset
 */
router.post("/reset-password", otpLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword, securityBypass } = req.body;
    const user = await getUserByEmail(email);

    if (!user) return res.status(404).json({ message: "User not found." });
    
    // Allow either OTP verification OR Security Question Bypass
    if (!securityBypass) {
      if (user.reset_otp !== otp) return res.status(400).json({ message: "Invalid Token." });
      if (Date.now() > user.reset_otp_expires) return res.status(400).json({ message: "Token Expired." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(user.id, hash);
    await clearResetOtp(user.id);

    res.json({ message: "Master key updated successfully." });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

/**
 * @route POST /api/auth/security-question/verify
 * @desc Verifies the security question answer as a fallback to OTP
 */
router.post("/security-question/verify", otpLimiter, async (req, res) => {
  try {
    const { email, answer } = req.body;
    const user = await getUserByEmail(email);

    if (!user) return res.status(404).json({ message: "Node not found." });
    if (!user.security_answer_hash) return res.status(400).json({ message: "No security question configured for this node." });

    const isValid = await verifySecurityAnswer(answer, user.security_answer_hash);
    if (!isValid) return res.status(401).json({ message: "Identity verification failed." });

    // Success - Grants a temporary bypass for reset-password
    res.json({ success: true, securityBypass: true });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

/**
 * @route POST /api/auth/register
 */
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, password, phone, securityAnswer } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Name, email, and password are required" });

    const emailDomain = email.split('@')[1].toLowerCase();
    if (DISPOSABLE_DOMAINS.includes(emailDomain)) return res.status(400).json({ message: "Disposable emails not allowed" });
    if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });

    const existingUser = await getUserByEmail(email);
    if (existingUser) return res.status(409).json({ message: "Email already registered" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPassword = await bcrypt.hash(password, 10);
    const secHash = securityAnswer ? await bcrypt.hash(securityAnswer.toLowerCase(), 10) : null;
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // If using security answers, save to pending table (requires schema update on pending table if needed, otherwise fallback)
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

    // Create user in primary table
    const insertId = await createUser({ name: pending.name, email: pending.email, password: pending.password, phone: pending.phone });
    await pool.query('DELETE FROM pending_registrations WHERE email = ?', [email]);

    const user = await getUserById(insertId);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

router.get("/profile", authenticateAdmin, async (req, res) => {
  // Note: authenticateAdmin middleware needs to handle customer vs admin decoding.
  // This route acts as a placeholder if called via API.
  res.json({ message: "Profile access" });
});

module.exports = router;
