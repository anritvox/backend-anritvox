const jwt = require('jsonwebtoken');

// authenticateAdmin: Verifies JWT and confirms role is 'admin'.
const authenticateAdmin = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });

  try {
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admin privileges required.' });
    }

    req.admin = { id: payload.id, email: payload.email, role: 'admin' };
    next();
  } catch (err) {
    console.error("[Admin Auth Error]:", err.message);
    return res.status(401).json({ message: 'Invalid or expired admin token' });
  }
};

const authenticateUser = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });

  try {
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.role === 'admin') {
      req.user = payload;
      return next();
    }

    const pool = require('../config/db');
    
    try {
      // Isolate the DB check to prevent SQL errors from triggering a 401
      const [userData] = await pool.query('SELECT is_active FROM users WHERE id = ?', [payload.id]);
      if (!userData || userData.length === 0 || userData[0].is_active === 0) {
        return res.status(401).json({ message: 'Account is disabled or deleted.' });
      }
    } catch (dbErr) {
      if (dbErr.code === 'ER_BAD_FIELD_ERROR') {
        console.warn("⚠️ Column 'is_active' not found in users table. Bypassing active check.");
      } else {
        throw dbErr; // Let the main catch block handle real connection failures
      }
    }

    req.user = payload;
    next();
  } catch (err) {
    console.error("[User Auth Error]:", err.message);
    return res.status(401).json({ message: 'Invalid or expired user token' });
  }
};

module.exports = { authenticateAdmin, authenticateUser };
