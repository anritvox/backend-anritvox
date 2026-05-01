const jwt = require("jsonwebtoken");

const authenticateToken = (req, res, next) => {
  // 1. Get the auth header
  const authHeader = req.headers['authorization'];
  
  // 2. Extract the token (Bearer <token>)
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Access Denied. No token provided." });
  }

  // 3. Verify the token
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }
    
    // 4. Attach decoded payload to request
    req.user = decoded;
    next();
  });
};

const authenticateAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      res.status(403).json({ message: "Forbidden. Requires Administrator privileges." });
    }
  });
};

module.exports = { authenticateToken, authenticateAdmin };
