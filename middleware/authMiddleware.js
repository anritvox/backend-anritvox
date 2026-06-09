const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_jwt_secret_key';

const authenticateUser = async (req, res, next) => {
  try {
    // 1. Extract Token from Authorization Header or Cookies
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access Denied: No session token provided.' 
      });
    }

    // 2. Cryptographically Verify Token Signature
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({ 
        success: false, 
        message: 'Session expired or token modified. Please log in again.' 
      });
    }

    const userId = decoded.id || decoded.userId;
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Malformed token payload structure.' 
      });
    }

    // Role Bypass Routing: Validate against admin_users if token carries admin role signature
    if (decoded.role === 'admin' || decoded.role === 'superadmin') {
      const [adminRows] = await pool.query('SELECT id, email, role FROM admin_users WHERE id = ?', [userId]);
      if (adminRows.length > 0) {
        req.user = {
          id: adminRows[0].id,
          email: adminRows[0].email,
          role: adminRows[0].role || 'admin'
        };
        return next();
      }
    }

    // 3. Prevent Ghost Sessions: Verify user row exists in the database
    const [userRows] = await pool.query('SELECT id, email, role, is_active FROM users WHERE id = ?', [userId]);
    
    if (userRows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Your active session belongs to an account that no longer exists. Please register a new account.' 
      });
    }

    const activeUser = userRows[0];
    if (activeUser.is_active === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'This account has been suspended or deactivated.' 
      });
    }

    // 4. Attach verified data context to request pipeline
    req.user = {
      id: activeUser.id,
      email: activeUser.email,
      role: activeUser.role || 'user'
    };

    next();
  } catch (error) {
    console.error("Critical Authentication Middleware Failure:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error validating session credentials.' 
    });
  }
};

/**
 * Administrative Access Control Guard
 * Ensures the requesting session possesses valid administrative privileges.
 */
const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.adminToken) {
      token = req.cookies.adminToken;
    }

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access Denied: Missing administrative credentials.' 
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin session expired. Please log back into the dashboard.' 
      });
    }

    const adminId = decoded.id || decoded.adminId;
    const isExplicitAdmin = decoded.role === 'admin' || decoded.isAdmin;

    // Verify administrative identity against the true database schema: admin_users
    const [adminRows] = await pool.query('SELECT id, email, role FROM admin_users WHERE id = ?', [adminId]);
    
    if (adminRows.length === 0 && !isExplicitAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access Denied: Insufficient administrative clearances.' 
      });
    }

    req.user = {
      id: adminRows[0]?.id || adminId,
      username: adminRows[0]?.email || 'SystemAdmin',
      role: adminRows[0]?.role || 'admin'
    };

    next();
  } catch (error) {
    console.error("Critical Admin Authentication Failure:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error validating administrative credentials.' 
    });
  }
};

/**
 * Warehouse Administrator Access Control Guard
 * Verifies that the authenticated request holds valid warehouse operator status.
 */
const isWarehouseAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access Denied: Authentication session state missing.' 
      });
    }

    // Refetch latest role and database active flags to prevent stale runtime cache state bypasses
    const [userRows] = await pool.query('SELECT role, is_active FROM users WHERE id = ?', [req.user.id]);
    if (userRows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access Denied: Associated user record missing.' 
      });
    }

    const systemUser = userRows[0];
    req.user.role = systemUser.role; // Maintain sync with DB state

    // High level administrative flags bypass localized warehouse restriction layers
    if (systemUser.role === 'superadmin' || systemUser.role === 'admin') {
      return next();
    }

    // Evaluate localized micro-warehouse management permissions
    const [accessRows] = await pool.query('SELECT is_active FROM warehouse_access WHERE user_id = ?', [req.user.id]);
    const hasActiveAccess = accessRows.length > 0 && parseInt(accessRows[0].is_active) === 1;

    if (hasActiveAccess) {
      return next();
    }

    return res.status(403).json({ 
      success: false, 
      message: 'Access Denied: Your account does not have authorization clearances to operate this warehouse node.' 
    });
  } catch (error) {
    console.error("Critical Warehouse Authorization Validation Fault:", error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server system error verifying backend warehouse permissions.' 
    });
  }
};

module.exports = {
  authenticateUser,
  authenticateAdmin,
  isWarehouseAdmin,
  authenticate: authenticateUser // Structural compatibility fallback
};
