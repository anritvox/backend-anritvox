const jwt = require('jsonwebtoken');
const pool = require('../config/db'); // Back to your original MySQL setup

const authenticateAdmin = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid token' });
  }
  
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: admin only' });
    }

    const [adminData] = await pool.query('SELECT id FROM admin_users WHERE id = ?', [payload.id]);
    if (!adminData || adminData.length === 0) {
      return res.status(401).json({ message: 'Admin account no longer exists.' });
    }

    req.admin = payload;
    next();
  } catch (err) {
    console.error("Admin Auth Error:", err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const authenticateUser = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid token' });
  }
  
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
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

module.exports = authenticateAdmin;
module.exports.authenticateAdmin = authenticateAdmin;
module.exports.authenticateUser = authenticateUser;
