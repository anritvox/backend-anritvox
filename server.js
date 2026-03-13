require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./config/db");

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

// Models for table initialization
const { createUsersTable } = require("./models/userModel");
const { createCartTable } = require("./models/cartModel");
const { createOrdersTables } = require("./models/orderModel");
const { createAddressTable } = require("./models/addressModel");
const { createWishlistTable } = require("./models/wishlistModel");
const { createCouponTable } = require("./models/couponModel");

const app = express();
app.use(express.json());

// Enhanced CORS setup for Vercel & Live Site
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://anritvox.vercel.app",
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

// Register routes
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
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/coupons", couponRoutes);

// Health check
app.get("/", (req, res) => res.json({ status: "ok", message: "Anritvox API running" }));

// Initialize DB tables and start server
const initDB = async () => {
  try {
    await createUsersTable();
    await createCartTable();
    await createOrdersTables();
    await createAddressTable();
    await createWishlistTable();
    await createCouponTable();
    console.log("All tables initialized");
  } catch (err) {
    console.error("DB init error:", err.message);
  }
};

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initDB();
});
