require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./config/db");

const categoryRoutes = require("./routes/categoryRoutes");
const subcategoryRoutes = require("./routes/subcategoryRoutes");
const productRoutes = require("./routes/productRoutes");
const warrantyRoutes = require("./routes/warrantyRoutes");
const contactRoutes = require("./routes/contactRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();
app.use(express.json());

// CORS setup
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// ── Keep-alive ping to prevent idle DB disconnects ──
setInterval(() => {
  pool
    .query("SELECT 1")
    .then(() => {
      // console.log("DB keep-alive ping successful");
    })
    .catch((err) => {
      console.error("DB keep-alive error:", err);
    });
}, 4 * 60 * 1000); // every 4 minutes

// Health-check to verify DB connectivity
app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 + 1 AS result");
    res.json({ status: "ok", dbTest: rows[0].result });
  } catch (err) {
    console.error("DB connection error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// API routes
app.use("/api/categories", categoryRoutes);
app.use("/api/subcategories", subcategoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/warranty", warrantyRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
