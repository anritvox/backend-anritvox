require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./config/db");
const path = require("path");

// Routes
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

// Models for table initialization
const { createUsersTable } = require("./models/userModel");
const { createCartTable } = require("./models/cartModel");
const { createOrdersTables } = require("./models/orderModel");
const { createAddressTable } = require("./models/addressModel");
const { createWishlistTable } = require("./models/wishlistModel");
const { createCouponTable } = require("./models/couponModel");
const { createReviewTable } = require("./models/reviewModel");
const { createNotificationTable } = require("./models/notificationModel");
const { createSettingsTable } = require("./models/settingsModel");
const { createShippingTable } = require("./models/shippingModel");
const { createReturnTable } = require("./models/returnModel");
const { createBannerTable } = require("./models/bannerModel");
const { createSerialTable } = require("./models/serialModel");

const app = express();
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Enhanced & Vercel-Optimized CORS setup
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://anritvox-frontend.vercel.app",
  "https://www.anritvox.com",
  "https://anritvox.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Dynamically allow any .vercel.app domain OR explicit domains from the list
      if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }

      // If it doesn't match, block it
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Initialize DB tables function
const initDB = async () => {
  try {
    await createUsersTable();
    await createCartTable();
    await createOrdersTables();
    await createAddressTable();
    await createWishlistTable();
    await createCouponTable();
    await createReviewTable();
    await createNotificationTable();
    await createSettingsTable();
    await createShippingTable();
    await createReturnTable();
    await createBannerTable();
    await createSerialTable();
    console.log("All tables initialized successfully");
    return true;
  } catch (err) {
    console.error("DB init error:", err.message);
    return false;
  }
};

// Helper: safely add a column if it doesn't exist (compatible with all MySQL versions)
const safeAddColumn = async (table, column, definition) => {
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      // Column already exists - that's fine
    } else {
      throw err;
    }
  }
};

// SECURE DATABASE MIGRATION & INITIALIZATION ROUTE
app.get("/api/migrate-db", async (req, res) => {
  try {
    const secret = req.query.secret;
    if (secret !== (process.env.MIGRATION_SECRET || "anritvox-admin-migrate")) {
      return res.status(403).json({ error: "Forbidden. Please provide the correct ?secret query parameter." });
    }
    console.log("Starting Database Migration/Initialization...");
    // Step 0: Ensure all target tables exist (Run initDB)
    await initDB();
    // Step 1: Add new columns to warranty_registrations (one at a time for compatibility)
    await safeAddColumn("warranty_registrations", "purchase_date", "DATE DEFAULT NULL");
    await safeAddColumn("warranty_registrations", "invoice_number", "VARCHAR(100) DEFAULT NULL");
    await safeAddColumn("warranty_registrations", "registered_serial", "VARCHAR(50) DEFAULT NULL");
    // Step 1.5: Ensure Banner table has description column
    await safeAddColumn("banners", "description", "TEXT DEFAULT NULL");
    // Step 2: Move old data from serial_numbers to product_serials if it exists
    const [tables] = await pool.query("SHOW TABLES LIKE 'serial_numbers'");
    let migratedCount = 0;
    if (tables.length > 0) {
      const [migrationRes] = await pool.query(`
        INSERT IGNORE INTO product_serials (product_id, serial_number, status)
        SELECT product_id, serial, IF(is_used = 1, 'registered', 'available')
        FROM serial_numbers
      `);
      migratedCount = migrationRes.affectedRows;
      
      // Step 3: Map old registrations to the actual string serial
      await pool.query(`
        UPDATE warranty_registrations wr
        JOIN serial_numbers sn ON wr.serial_number_id = sn.id
        SET wr.registered_serial = sn.serial
        WHERE wr.registered_serial IS NULL
      `);
    }
    res.json({
      status: "success",
      message: "Database migrated and tables initialized successfully!",
      details: { migrated_serials: migratedCount, unified_system: "active" }
    });
  } catch (err) {
    console.error("Migration Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Register all routes
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

// Health check
app.get("/", (req, res) => res.json({
  status: "ok",
  message: "Anritvox API running",
  version: "3.2.1",
  environment: process.env.NODE_ENV || "development"
}));

// Start server - works for Railway (persistent server) and local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, async () => {
    console.log(`Server running locally on port ${PORT}`);
    await initDB(); 
  });
}

// Critical for Vercel:
module.exports = app;
