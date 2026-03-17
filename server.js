const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// --- SECRET DATABASE MIGRATION ROUTE ---
// RUN THIS ONCE BY VISITING: http://your-backend-url.com/api/migrate-database
app.get('/api/migrate-database', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    console.log("Starting migration...");

    // 1. Add missing columns to warranty_registrations
    await conn.query(`
      ALTER TABLE warranty_registrations 
      ADD COLUMN IF NOT EXISTS purchase_date DATE DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS registered_serial VARCHAR(50) DEFAULT NULL
    `);

    // 2. Ensure product_serials table exists (unified table)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS product_serials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        serial_number VARCHAR(50) UNIQUE NOT NULL,
        status ENUM('available', 'sold', 'registered', 'blocked') DEFAULT 'available',
        batch_number VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    // 3. Move old serials to the unified table
    // We check if serial_numbers table exists first to avoid errors
    const [tables] = await conn.query("SHOW TABLES LIKE 'serial_numbers'");
    if (tables.length > 0) {
      await conn.query(`
        INSERT IGNORE INTO product_serials (product_id, serial_number, status)
        SELECT product_id, serial, IF(is_used = 1, 'registered', 'available')
        FROM serial_numbers
      `);

      // 4. Map existing registrations to their serial strings
      await conn.query(`
        UPDATE warranty_registrations wr
        JOIN serial_numbers sn ON wr.serial_number_id = sn.id
        SET wr.registered_serial = sn.serial
        WHERE wr.registered_serial IS NULL
      `);
    }

    await conn.commit();
    res.status(200).json({ 
      message: "Migration Successful! Database is now unified and old data is preserved.",
      details: "Added columns, created unified table, and migrated records."
    });
  } catch (err) {
    await conn.rollback();
    console.error("Migration Failed:", err);
    res.status(500).json({ error: "Migration failed", details: err.message });
  } finally {
    conn.release();
  }
});

// Import Routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const subcategoryRoutes = require('./routes/subcategoryRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const userRoutes = require('./routes/userRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const contactRoutes = require('./routes/contactRoutes');
const orderRoutes = require('./routes/orderRoutes');
const cartRoutes = require('./routes/cartRoutes');
const addressRoutes = require('./routes/addressRoutes');
const couponRoutes = require('./routes/couponRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const shippingRoutes = require('./routes/shippingRoutes');
const returnRoutes = require('./routes/returnRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const serialRoutes = require('./routes/serialRoutes');
const warrantyRoutes = require('./routes/warrantyRoutes');

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/serials', serialRoutes);
app.use('/api/warranty', warrantyRoutes);

// Root Route
app.get('/', (req, res) => {
  res.send('Anritvox Backend is running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
