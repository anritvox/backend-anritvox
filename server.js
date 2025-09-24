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
const serialRoutes = require("./routes/serialRoutes");

const app = express();
app.use(express.json());

// ✅ Secure CORS setup
// const corsOptions = {
//   origin: "https://www.anritvox.com",
//   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"],
// };
// app.use(cors(corsOptions));
app.use(cors());

// ✅ Keep-alive DB ping
setInterval(() => {
  pool
    .query("SELECT 1")
    .catch((err) => console.error("DB keep-alive error:", err));
}, 4 * 60 * 1000);

// // ✅ Health-check route
// app.get("/api/health", async (req, res) => {
//   try {
//     const [rows] = await pool.query("SELECT 1 + 1 AS result");
//     res.json({ status: "ok", dbTest: rows[0].result });
//   } catch (err) {
//     console.error("DB connection error:", err);
//     res.status(500).json({ status: "error", message: err.message });
//   }
// });

// ✅ API routes
app.use("/api/categories", categoryRoutes);
app.use("/api/subcategories", subcategoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/warranty", warrantyRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/serials", serialRoutes);

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
