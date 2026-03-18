const jwt = require('jsonwebtoken');
const pool = require('../config/db'); // Imported for real-time validation

// Admin auth middleware - verifies JWT AND checks real-time database status
const authenticateAdmin = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid token' });
  }
  
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    // Ensure this is an admin token, not a customer token
    if (payload.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: admin only' });
    }

    // SECURITY FIX: Prevent "Zombie" Tokens
    // Ensure the admin account hasn't been deleted or disabled since the JWT was issued
    const [adminData] = await pool.query('SELECT id FROM admin_users WHERE id = ?', [payload.id]);
    if (!adminData || adminData.length === 0) {
      return res.status(401).json({ message: 'Admin account no longer exists.' });
    }

    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// User auth middleware - verifies JWT and checks if customer is banned
const authenticateUser = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid token' });
  }
  
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    // SECURITY FIX: Prevent "Zombie" Tokens
    // Ensure the user hasn't been banned (is_active = 0) or deleted
    const [userData] = await pool.query('SELECT is_active FROM users WHERE id = ?', [payload.id]);
    if (!userData || userData.length === 0 || userData[0].is_active === 0) {
      return res.status(401).json({ message: 'Account is disabled or deleted. Please contact support.' });
    }

    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Default export (backward compat for existing routes)
module.exports = authenticateAdmin;

// Named exports
module.exports.authenticateAdmin = authenticateAdmin;
module.exports.authenticateUser = authenticateUser;
