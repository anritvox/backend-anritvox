const rateLimit = require('express-rate-limit');

// Limits account creation to prevent spam/bots
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, 
  message: { message: 'Too many accounts created from this IP. Please try again after an hour.' }
});

// Standard login brute-force protection
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, 
  message: { message: 'Too many login attempts from this IP. Security protocol active. Try again in 15 minutes.' }
});

// FIXED: OTP Limiter - Generous enough for normal flows, strict enough to stop brute-forcing
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Allows up to 20 requests (enough for ~6 full recovery attempts)
  message: { message: 'Too many OTP requests. System locked for 15 minutes to prevent brute-force attacks.' }
});

module.exports = {
  registerLimiter,
  loginLimiter,
  otpLimiter
};
