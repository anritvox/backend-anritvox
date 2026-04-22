const rateLimit = require('express-rate-limit');

// Stricter registration limiter: 2 attempts per IP per hour
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 2,
    message: {
        success: false,
        message: "Too many registration attempts from this IP. Please try again after an hour."
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
});

// OTP request limiter: 3 OTP requests per email per hour (keyed by IP)
const otpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: {
        success: false,
        message: "Too many OTP requests. Please try again after an hour."
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Login limiter: 5 attempts per IP per 15 minutes
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        success: false,
        message: "Too many login attempts from this IP. Please try again after 15 minutes."
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    registerLimiter,
    otpLimiter,
    loginLimiter
};
