const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require('../config/db');
const { sendMail } = require('../utils/mail');
const { registerLimiter, loginLimiter, otpLimiter } = require('../middleware/rateLimiter');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com', 'throwaway.email'
];

router.post("/admin/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const [adminRows] = await pool.query('SELECT * FROM admins WHERE email = ?', [email]);
    const admin = adminRows[0];
    
    if (!admin) return res.status(401).json({ message: "Invalid admin credentials." });

    // Verify Password
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) return res.status(401).json({ message: "Invalid admin credentials." });

    // Sign Token
    const token = jwt.sign({ id: admin.id, email: admin.email, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "7d" });
    
    return res.json({ 
      token, 
      admin: { id: admin.id, name: admin.name, email: admin.email, role: "admin" } 
    });
  } catch (err) {
    console.error("ADMIN LOGIN FATAL ERROR:", err);
    res.status(500).json({ message: "Backend crash. Check server console." });
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const [userRows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const customer = userRows[0];
    
    if (!customer) return res.status(401).json({ message: "Invalid credentials" });

    const validCustomer = await bcrypt.compare(password, customer.password_hash);
    if (!validCustomer) return res.status(401).json({ message: "Invalid credentials" });

    if (customer.two_factor_enabled) {
      return res.status(202).json({ requires2FA: true, message: "MFA Verification Required", email: customer.email });
    }

    const token = jwt.sign({ id: customer.id, email: customer.email, role: customer.role || 'customer' }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.json({ 
      token, 
      user: { id: customer.id, name: customer.name, email: customer.email, role: customer.role || 'customer' } 
    });
  } catch (err) {
    console.error("USER LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.get("/profile", authenticateToken, async (req, res) => {
  try {
    // req.user is set by the authenticateToken middleware
    if (req.user.role === 'admin') {
      const [adminRows] = await pool.query('SELECT id, name, email, role FROM admins WHERE id = ?', [req.user.id]);
      if (!adminRows[0]) return res.status(404).json({ message: "Admin not found" });
      return res.json(adminRows[0]);
    } else {
      const [userRows] = await pool.query('SELECT id, name, email, phone, role FROM users WHERE id = ?', [req.user.id]);
      if (!userRows[0]) return res.status(404).json({ message: "User not found" });
      return res.json(userRows[0]);
    }
  } catch (err) {
    console.error("PROFILE SYNC ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/setup-admin", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const hash = await bcrypt.hash("Admin@123", 10);
    
    // Check if admin already exists
    const [existing] = await pool.query("SELECT * FROM admins WHERE email = 'admin@anritvox.com'");
    if (existing.length === 0) {
      await pool.query("INSERT INTO admins (name, email, password_hash) VALUES ('System Admin', 'admin@anritvox.com', ?)", [hash]);
    }

    res.json({ success: true, message: "Admin Node Ready.", email: "admin@anritvox.com", password: "Admin@123" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
