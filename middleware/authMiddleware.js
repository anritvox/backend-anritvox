const jwt = require('jsonwebtoken');

// authenticateAdmin: Verifies JWT and confirms role is 'admin'.
// Uses JWT payload directly - no extra DB lookup needed (JWT is signed and trusted).
const authenticateAdmin = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });

  try {
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Trust the role embedded in the signed JWT
    if (payload.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admin privileges required.' });
    }

    req.admin = { id: payload.id, email: payload.email, role: 'admin' };
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

module.exports = { authenticateAdmin, authenticateUser };
