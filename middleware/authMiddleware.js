const jwt = require('jsonwebtoken');
// 1. Import your Mongoose models instead of SQL 'pool'
const Admin = require('../models/adminModel');
const User = require('../models/userModel');

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

    // SECURITY FIX: Using Mongoose correctly
    // Fallback to _id just in case your token signs using the default Mongo ID
    const adminData = await Admin.findById(payload.id || payload._id);
    if (!adminData) {
      return res.status(401).json({ message: 'Admin account no longer exists.' });
    }

    req.admin = payload;
    next();
  } catch (err) {
    // ADDED LOGGING: If this fails again, check Railway Logs to see EXACTLY why
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
    
    // SECURITY FIX: Using Mongoose correctly
    const userData = await User.findById(payload.id || payload._id);
    // Adjusted check for your typical Mongoose boolean structure
    if (!userData || userData.is_active === 0 || userData.is_active === false) {
      return res.status(401).json({ message: 'Account is disabled or deleted. Please contact support.' });
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
