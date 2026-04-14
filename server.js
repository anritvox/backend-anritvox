require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./config/db");
const path = require("path");
const categoryRoutes = require("./routes/categoryRoutes");
const subcategoryRoutes = require("./routes/subcategoryRoutes");
const productRoutes = require("./routes/productRoutes");
const warrantyRoutes = require("./routes/warrantyRoutes");
const contactRoutes = require("./routes/contactRoutes");
const authRoutes = require("./routes/authRoutes");
const serialRoutes = require("./routes/serialRoutes");
const { router: userRoutes } = require("./routes/userRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const addressRoutes = require("./routes/addressRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const couponRoutes = require("./routes/couponRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const shippingRoutes = require("./routes/shippingRoutes");
const returnRoutes = require("./routes/returnRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const bannerRoutes = require("./routes/bannerRoutes");
const { createBannerTable } = require("./models/bannerModel");
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Bulletproof & Secure CORS Configuration
const allowedOrigins = [
  "https://www.anritvox.com",
  "https://anritvox.com",
  "https://anritvox-frontend.vercel.app",
  "http://localhost:5173", // Vite default dev port
  "http://localhost:3000"
];
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS restrictions'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Disposition'],
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
// Routes
app.use("/api/categories", categoryRoutes);
app.use("/api/subcategories", subcategoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/warranty", warrantyRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/serials", serialRoutes);
app.use("/api/users", userRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/admin", adminUserRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/banners", bannerRoutes);
app.get("/", (req, res) => res.json({ status: "ok", message: "Anritvox API running on Railway!" }));
async function initDB() {
  try {
    await createBannerTable();
    console.log("DB tables verified/created.");
  } catch (err) {
    console.error("DB init error:", err.message);
  }
}
// --- GLOBAL STABILIZATION PROTOCOL ---
// 1. 405 Method Not Allowed Handler for existing prefixes
app.use('/api', (req, res, next) => {
  res.status(405).json({
    success: false,
    error: "Method Not Allowed",
    message: `The ${req.method} method is not supported for ${req.originalUrl}`
  });
});
// 2. 404 Route Not Found Catch-All
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: "API Endpoint Not Found" });
});
// 3. Global 500 Internal Server Error & Deadlock Handler
app.use((err, req, res, next) => {
  // Suppress CORS errors from logging massively as crashes
  if (err.message !== 'Not allowed by CORS restrictions') {
    console.error(`[CRITICAL] ${err.name}: ${err.message}`);
    console.error(err.stack);
  }
  // Handle MySQL Deadlocks safely
  if (err.code === 'ER_LOCK_DEADLOCK') {
    return res.status(409).json({ 
      success: false, 
      message: "High traffic detected. Please try your checkout again." 
    });
  }
  // Handle JWT Malformations
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: "Session invalid or expired" });
  }
  res.status(err.status || 500).json({
    success: false,
    message: "Internal Server Error. Our team has been notified.",
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initDB();
});
module.exports = app;
