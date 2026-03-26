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

// Trust Railway's reverse proxy to correctly handle HTTPS protocols and IPs
app.set("trust proxy", 1);

app.use(express.json({ limit: '10mb' }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Allowed origins for CORS
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://anritvox-frontend.vercel.app",
  "https://www.anritvox.com",
  "https://anritvox.com",
  "https://backend-anritvox-production.up.railway.app",
  "https://service.anritvox.com",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    
    // Log blocked origins instead of throwing an error that could bubble up and cause 500s
    console.warn(`CORS Blocked: Origin not allowed - ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Disposition'],
  optionsSuccessStatus: 200,
};

// Apply CORS middleware
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

const PORT = process.env.PORT || 5000;

// CRITICAL FIX: Explicitly bind to '0.0.0.0' so Railway's proxy can route traffic successfully
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server successfully bound to 0.0.0.0 and running on port ${PORT}`);
  await initDB();
});

module.exports = app;
