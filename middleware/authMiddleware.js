// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

// Admin auth middleware (used by existing admin routes)
const authenticateAdmin = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid token' });
  }
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Default export (backward compat for existing routes)
module.exports = authenticateAdmin;

// Named export for new routes
module.exports.authenticateAdmin = authenticateAdmin;
