require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./config/db");
const path = require("path");
const bcrypt = require("bcrypt");

const categoryRoutes = require("./routes/categoryRoutes");
const fitmentRoutes = require('./routes/fitmentRoutes');
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
const bannerRoutes = require("./routes/bannerRoutes"); const fitmentRoutes = require("./routes/fitmentRoutes");

const { createBannerTable } = require("./models/bannerModel");
const { createCartTable } = require("./models/cartModel");
const { createOrdersTables } = require("./models/orderModel");
const { createAddressTable } = require("./models/addressModel");
const { initProductsTable } = require("./models/productModel");
const { initCategoriesTable } = require("./models/categoryModel");

const app = express();

// 1. PRIMARY CORS CONFIGURATION (Moved to Top)
const allowedOrigins = [
  "https://www.anritvox.com",
  "https://anritvox.com",
  "http://localhost:5173",
  "http://localhost:3000"
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.includes(origin) || 
                      origin.endsWith(".vercel.app") || 
                      process.env.NODE_ENV === "development";
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log("CORS Rejected Origin:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests for all routes - using regex to avoid Express 5 PathError
app.options(/(.*)/,  cors(corsOptions));

// 2. ADDITIONAL SECURITY HEADERS (Manual Fallback)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || (origin && origin.endsWith(".vercel.app"))) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
  
  if (req.method === "OPTIONS") {
    return res.status(204).send();
  }
  next();
});

app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ROUTES
app.use("/api/fitments", fitmentRoutes);
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
app.use("/api/banners", bannerRoutes); app.use("/api/fitment", fitmentRoutes);

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
    
    try {
      const [adminRows] = await pool.query("SELECT * FROM admin_users WHERE email = 'admin@anritvox.com'");
      if (adminRows.length === 0) {
        const hash = await bcrypt.hash('Admin@123', 10);
        await pool.query("INSERT INTO admin_users (email, password_hash) VALUES ('admin@anritvox.com', ?)", [hash]);
        console.log("[DB] Master Admin Generated.");
      }
    } catch (adminErr) {
      console.log("[DB] Note: Admin table check bypassed temporarily.");
    }
    console.log("[DB] All tables verified/created successfully.");
  } catch (err) {
    console.error("[DB] Initialization error:", err.message);
  }
}

// 404 Fallback
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: `API Endpoint Not Found: ${req.originalUrl}` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ success: false, message: "CORS Origin Rejected" });
  }
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({ success: false, message: "Session invalid or expired" });
  }
  const statusCode = err.status || 500;
  res.status(statusCode).json({ success: false, message: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initDB();
});

module.exports = app;
