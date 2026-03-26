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

const allowedOrigins = [
  "http://localhost:5173",
  "https://anritvox-frontend.vercel.app",
  "https://www.anritvox.com",
  "https://anritvox.com",
  "https://backend-anritvox-production.up.railway.app",
  "https://service.anritvox.com",
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
}));

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

// Auto-create tables on startup (safe - uses IF NOT EXISTS)
async function initDB() {
  try {
    await createBannerTable();
    console.log("DB tables verified/created.");
  } catch (err) {
    console.error("DB init error:", err.message);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initDB();
});

module.exports = app;
