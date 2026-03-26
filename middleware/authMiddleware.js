const jwt = require('jsonwebtoken');

// REMOVED top-level require('../config/db') to break circular dependency loops on startup.

const authenticateAdmin = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
  
  try {
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // LAZY LOAD: We require the DB pool here at runtime rather than startup.
    // This completely prevents the empty object `{}` circular dependency crash.
    const pool = require('../config/db');

    // SECURITY UPGRADE: Check email directly. This elevates a 'Customer' token to 'Admin' 
    // instantly if they happen to exist in the Admin table, fixing the 403 Dashboard errors.
    const [adminData] = await pool.query('SELECT id, email FROM admin_users WHERE email = ?', [payload.email]);
    
    if (!adminData || adminData.length === 0) {
      return res.status(403).json({ message: 'Access denied: Admin privileges required.' });
    }

    req.admin = { id: adminData[0].id, email: adminData[0].email, role: 'admin' };
    next();
  } catch (err) {
    console.error("Admin Auth Error:", err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const authenticateUser = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
  
  try {
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    // Allow Admins to safely use customer features (like Wishlist) without triggering a 401
    if (payload.role === 'admin') {
      req.user = payload;
      return next();
    }

    // LAZY LOAD: DB pool required at runtime
    const pool = require('../config/db');

    const [userData] = await pool.query('SELECT is_active FROM users WHERE id = ?', [payload.id]);
    if (!userData || userData.length === 0 || userData[0].is_active === 0) {
      return res.status(401).json({ message: 'Account is disabled or deleted.' });
    }

    req.user = payload;
    next();
  } catch (err) {
    console.error("User Auth Error:", err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Fixed CommonJS Export (prevents undefined route crashes causing CORS errors)
module.exports = {
  authenticateAdmin,
  authenticateUser
};
