const rateLimit = require('express-rate-limit');

// Helper to standardise proxy IP extraction behind Railway/Vercel edge routers
const keyGenerator = (req) => {
  // Read true client IP forwarded by edge gateways, fallback to socket remote address
  return req.headers['x-forwarded-for'] 
    ? req.headers['x-forwarded-for'].split(',')[0].trim() 
    : req.ip || req.socket.remoteAddress;
};

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 100, // Limit each true IP to 100 registrations per window
  standardHeaders: true, 
  legacyHeaders: false,
  keyGenerator: keyGenerator,
  handler: (req, res, next, options) => {
    res.status(429).json({
      success: false,
      message: options.message.message || options.message
    });
  },
  message: { message: 'Too many accounts created from this network. Please try again later.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 30, // Limit each true IP to 30 login attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator,
  handler: (req, res, next, options) => {
    res.status(429).json({
      success: false,
      message: options.message.message || options.message
    });
  },
  message: { message: 'Too many login attempts from this IP. Security protocol active. Try again in 15 minutes.' }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 30, // Limit each true IP to 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator,
  handler: (req, res, next, options) => {
    res.status(429).json({
      success: false,
      message: options.message.message || options.message
    });
  },
  message: { message: 'Too many OTP requests. System locked for 15 minutes to prevent brute-force attacks.' }
});

module.exports = {
  registerLimiter,
  loginLimiter,
  otpLimiter
};
