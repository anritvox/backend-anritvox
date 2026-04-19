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
const { createCartTable } = require("./models/cartModel");
const { createOrdersTables } = require("./models/orderModel");
const { createAddressTable } = require("./models/addressModel");
const { initProductsTable } = require("./models/productModel");
const { initCategoriesTable } = require("./models/categoryModel");

const app = express();

app.set("trust proxy", 1);

app.use(express.json({ limit: '10mb' }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const allowedOrigins = [
  "https://www.anritvox.com",
  "https://anritvox.com",
  "https://anritvox-frontend.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000"
];

const corsOptions = {
  origin: function (origin, callback) {
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
    console.log("[DB] Initializing tables...");
    await initCategoriesTable();
    await initProductsTable();
    await createAddressTable();
    await createCartTable();
    await createOrdersTables();
    await createBannerTable();
    console.log("[DB] All tables verified/created successfully.");
  } catch (err) {
    console.error("[DB] Initialization error:", err.message);
  }
}

app.use('/api', (req, res, next) => {
  res.status(405).json({
    success: false,
    error: "Method Not Allowed",
    message: `The ${req.method} method is not supported for ${req.originalUrl}`
  });
});

app.use((req, res, next) => {
  res.status(404).json({ success: false, message: "API Endpoint Not Found" });
});

app.use((err, req, res, next) => {
  if (err.message !== 'Not allowed by CORS restrictions') {
    console.error(`[CRITICAL] ${err.name}: ${err.message}`);
    console.error(err.stack);
  }

  if (err.code === 'ER_LOCK_DEADLOCK') {
    return res.status(409).json({ 
      success: false, 
      message: "High traffic detected. Please try your request again." 
    });
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: "Session invalid or expired" });
  }

  const statusCode = err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    error: (process.env.NODE_ENV === 'development' || statusCode !== 500) ? err.message : "Our team has been notified."
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initDB();
});

module.exports = app;
