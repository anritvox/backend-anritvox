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

// Enhanced CORS setup
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://anritvox.vercel.app",
  "https://anritvox-frontend.vercel.app",
  "https://www.anritvox.com",
  "https://anritvox.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// ─── TEMPORARY MIGRATION ROUTE ───
// Visit https://your-api-url.com/api/migrate-db to fix your database
app.get("/api/migrate-db", async (req, res) => {
  try {
    console.log("Starting Database Migration...");

    // Step 0: Ensure target tables exist
    await createSerialTable();

    // Step 1: Add new columns to warranty_registrations
    await pool.query(`
      ALTER TABLE warranty_registrations
      ADD COLUMN IF NOT EXISTS purchase_date DATE DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS registered_serial VARCHAR(50) DEFAULT NULL
    `);

    // Step 2: Move old data from serial_numbers to product_serials
    // Note: We check if serial_numbers exists first
    const [tables] = await pool.query("SHOW TABLES LIKE 'serial_numbers'");
    if (tables.length > 0) {
      await pool.query(`
        INSERT IGNORE INTO product_serials (product_id, serial_number, status)
        SELECT product_id, serial, IF(is_used = 1, 'registered', 'available')
        FROM serial_numbers
      `);

      // Step 3: Link registrations to serial strings
      await pool.query(`
        UPDATE warranty_registrations wr
        JOIN serial_numbers sn ON wr.serial_number_id = sn.id
        SET wr.registered_serial = sn.serial
        WHERE wr.registered_serial IS NULL
      `);
    }

    res.json({ message: "Database migrated successfully! All old users are now active in the new system." });
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
app.get("/", (req, res) => res.json({ status: "ok", message: "Anritvox API running", version: "3.2" }));

// Initialize DB tables
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
  } catch (err) {
    console.error("DB init error:", err.message);
  }
};

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initDB();
});
