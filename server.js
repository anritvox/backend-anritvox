require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./config/db");

// Existing routes
const categoryRoutes = require("./routes/categoryRoutes");
const subcategoryRoutes = require("./routes/subcategoryRoutes");
const productRoutes = require("./routes/productRoutes");
const warrantyRoutes = require("./routes/warrantyRoutes");
const contactRoutes = require("./routes/contactRoutes");
const authRoutes = require("./routes/authRoutes");
const serialRoutes = require("./routes/serialRoutes");

// New routes
const { router: userRoutes } = require("./routes/userRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const addressRoutes = require("./routes/addressRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");

// Models for table initialization
const { createUsersTables } = require("./models/userModel");
const { createCartTable } = require("./models/cartModel");
const { createOrdersTables } = require("./models/orderModel");
const { createAddressTable } = require("./models/addressModel");

const app = express();
app.use(express.json());

// Enhanced CORS setup for Vercel & Live Site
const allowedOrigins = [
  "https://anritvox-frontend.vercel.app",
  "https://www.anritvox.com",
  "http://localhost:5173"
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Keep-alive DB ping
setInterval(() => {
  pool
    .query("SELECT 1")
    .catch((err) => console.error("DB keep-alive error:", err));
}, 4 * 60 * 1000);

// Existing routes
app.use("/api/categories", categoryRoutes);
app.use("/api/subcategories", subcategoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/warranty", warrantyRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/serials", serialRoutes);

// New routes
app.use("/api/users", userRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/admin", adminUserRoutes);

// Health check
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// Initialize DB tables then start server
async function startServer() {
  try {
    await createUsersTables();
    await createCartTable();
    await createOrdersTables();
    await createAddressTable();
    console.log("All tables initialized.");
  } catch (err) {
    console.error("Table initialization error (non-fatal):", err.message);
  }

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
