const rateLimit = require('express-rate-limit');

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 3,
    message: {
        success: false,
        message: "Too many accounts created from this IP. Please try again after an hour."
    },
    standardHeaders: true,
    legacyHeaders: false, 
});


const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5,
    message: {
        success: false,
        message: "Too many login attempts from this IP. Please try again after 15 minutes."
    }
});

module.exports = {
    registerLimiter,
    loginLimiter
};
