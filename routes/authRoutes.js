const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require('../config/db');
const { sendMail } = require('../utils/mail');
const { registerLimiter, loginLimiter, otpLimiter } = require('../middleware/rateLimiter');
const { authenticateAdmin } = require('../middleware/authMiddleware');
const { authenticator } = require('otplib');

authenticator.options = { window: 1 };

const { getAdminByEmail, getAdminById, verifyPassword: verifyAdminPassword, updateAdminPassword } = require("../models/adminModel");
const { 
  createUser, getUserByEmail, getUserById, verifyPassword: verifyCustomerPassword, 
  saveResetOtp, clearResetOtp, updateUserPassword, verifySecurityAnswer 
} = require("../models/userModel");

const router = express.Router();

const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'throwaway.email', 'getnada.com', 'trashmail.com', 'maildrop.cc', 'sharklasers.com'
];

router.post("/admin/login", loginLimiter, async (req, res) => {
  try {
    const { email, password, turnstileToken } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const admin = await getAdminByEmail(email);
    if (!admin) return res.status(401).json({ message: "Invalid admin credentials" });

    const validAdmin = await verifyAdminPassword(password, admin.password_hash);
    if (!validAdmin) return res.status(401).json({ message: "Invalid admin credentials" });

    const token = jwt.sign({ id: admin.id, email: admin.email, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.json({ token, admin: { id: admin.id, email: admin.email, role: "admin" } });
  } catch (err) {
    console.error("Admin Login Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const customer = await getUserByEmail(email);
    if (!customer) return res.status(401).json({ message: "Invalid credentials" });

    const validCustomer = await verifyCustomerPassword(password, customer.password_hash);
    if (!validCustomer) return res.status(401).json({ message: "Invalid credentials" });

    if (customer.two_factor_enabled) {
      return res.status(202).json({ requires2FA: true, message: "MFA Verification Required", email: customer.email });
    }

    const token = jwt.sign({ id: customer.id, email: customer.email, role: customer.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.json({ token, user: { id: customer.id, name: customer.name, email: customer.email, role: customer.role } });
  } catch (err) {
    console.error("User Login Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/2fa/verify", otpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "Email and OTP required" });

    const customer = await getUserByEmail(email);
    if (!customer) return res.status(404).json({ message: "Account not found." });

    if (customer.two_factor_enabled && customer.two_factor_secret) {
    
      const isValid = authenticator.verify({ token: otp, secret: customer.two_factor_secret });
      if (!isValid) return res.status(401).json({ message: "Invalid 2FA Token." });
    } else if (otp !== customer.reset_otp) {
      return res.status(401).json({ message: "Invalid MFA Token." });
    }

    const token = jwt.sign({ id: customer.id, email: customer.email, role: customer.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.json({ token, user: { id: customer.id, name: customer.name, email: customer.email, role: customer.role } });
  } catch (err) {
    console.error("2FA Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/forgot-password", otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await getUserByEmail(email);
    
    if (!user) return res.status(404).json({ message: "Email not found in our records." });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000; 

    await saveResetOtp(user.id, otp, otpExpiry);

    await sendMail({
      to: email, 
      subject: 'Password Recovery Code', 
      html: `<div style="font-family: sans-serif; background: #f8fafc; color: #0f172a; padding: 40px; border-radius: 12px; text-align: center;">
              <h2 style="color: #10b981;">Password Reset</h2>
              <p style="color: #64748b;">A request was made to reset your password.</p>
              <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 20px; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">${otp}</div>
              <p style="color: #64748b; font-size: 12px;">Code expires in 10 minutes.</p>
            </div>`
    });

    res.json({ message: "Recovery email sent." });
  } catch (err) {
    console.error("Forgot Password Fatal Error:", err);
    res.status(500).json({ message: "Server Error." });
  }
});

router.post("/verify-otp", otpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await getUserByEmail(email);

    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.reset_otp !== otp) return res.status(400).json({ message: "Invalid Code." });
    if (Date.now() > user.reset_otp_expires) return res.status(400).json({ message: "Code Expired." });

    res.json({ success: true, message: "Code verified." });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

router.post("/reset-password", otpLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword, securityBypass } = req.body;
    const user = await getUserByEmail(email);

    if (!user) return res.status(404).json({ message: "User not found." });
    
    if (!securityBypass) {
      if (user.reset_otp !== otp) return res.status(400).json({ message: "Invalid Code." });
      if (Date.now() > user.reset_otp_expires) return res.status(400).json({ message: "Code Expired." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(user.id, hash);
    await clearResetOtp(user.id);

    res.json({ message: "Password updated successfully." });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

router.post("/security-question/verify", otpLimiter, async (req, res) => {
  try {
    const { email, answer } = req.body;
    const user = await getUserByEmail(email);

    if (!user) return res.status(404).json({ message: "Account not found." });
    if (!user.security_answer_hash) return res.status(400).json({ message: "No security question configured." });

    const isValid = await verifySecurityAnswer(answer, user.security_answer_hash);
    if (!isValid) return res.status(401).json({ message: "Incorrect answer." });

    res.json({ success: true, securityBypass: true });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body; 
    if (!name || !email || !password) return res.status(400).json({ message: "Name, email, and password are required" });

    const emailDomain = email.split('@')[1].toLowerCase();
    if (DISPOSABLE_DOMAINS.includes(emailDomain)) return res.status(400).json({ message: "Disposable emails not allowed" });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

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
      to: email, subject: 'Verify your Account', html: `<h3>Welcome!</h3><p>Your verification code is: <strong>${otp}</strong></p>`
    });

    res.json({ success: true, message: "OTP sent to email." });
  } catch (err) { 
    res.status(500).json({ message: "Server error" }); 
  }
});

router.post("/verify-email", otpLimiter, async (req, res) => {
  try {
    const { email, otp, securityAnswer } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "Email and OTP required" });

    const [rows] = await pool.query('SELECT * FROM pending_registrations WHERE email = ?', [email]);
    const pending = rows[0];

    if (!pending) return res.status(404).json({ message: "No pending registration found" });
    if (pending.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });
    if (new Date() > new Date(pending.otp_expiry)) return res.status(400).json({ message: "OTP expired." });

    const insertId = await createUser({ name: pending.name, email: pending.email, password: pending.password, phone: pending.phone, securityAnswer: securityAnswer });
    await pool.query('DELETE FROM pending_registrations WHERE email = ?', [email]);

    const user = await getUserById(insertId);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { 
    res.status(500).json({ message: "Server error" }); 
  }
});

router.get("/profile", authenticateAdmin, async (req, res) => {
  res.json({ message: "Profile access" });
});

module.exports = router;
