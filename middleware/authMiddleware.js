// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

// Admin auth middleware - verifies JWT AND checks role === 'admin'
const authenticateAdmin = (req, res, next) => {
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
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// User auth middleware - verifies JWT for customer routes
const authenticateUser = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid token' });
  }
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
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
