const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateAdmin } = require('../middleware/authMiddleware');
// FIX: Use R2/S3 cloud storage via multer-s3 instead of local diskStorage
const { upload } = require('../config/s3Upload');

// 1. GET ALL ACTIVE PRODUCTS (Public)
router.get('/active', async (req, res) => {
  try {
    const { category, subcategory, search, sort, min_price, max_price } = req.query;
    let query = 'SELECT * FROM products WHERE status = "active"';
    const params = [];
    if (category) { query += ' AND category_id = ?'; params.push(category); }
    if (subcategory) { query += ' AND subcategory_id = ?'; params.push(subcategory); }
    if (search) { query += ' AND name LIKE ?'; params.push(`%${search}%`); }
    if (min_price) { query += ' AND price >= ?'; params.push(min_price); }
    if (max_price) { query += ' AND price <= ?'; params.push(max_price); }
    if (sort === 'price_asc') query += ' ORDER BY price ASC';
    else if (sort === 'price_desc') query += ' ORDER BY price DESC';
    else if (sort === 'newest') query += ' ORDER BY created_at DESC';
    else if (sort === 'rating') query += ' ORDER BY rating DESC';
    else query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Fetch Active Products Error:', error);
    res.status(500).json({ success: false, message: 'Database query failed' });
  }
});

// 2. GET ALL PRODUCTS ADMIN (Protected)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Admin Fetch Products Error:', error);
    res.status(500).json({ success: false, message: 'Database query failed' });
  }
});

// 3. GET PRODUCT BY SLUG (Public)
router.get('/slug/:slug', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE slug = ? AND status = "active"', [req.params.slug]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product node not found by slug' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Fetch By Slug Error:', error);
    res.status(500).json({ success: false, message: 'Database query failed' });
  }
});

// 4. CREATE PRODUCT (Admin)
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { name, slug, description, price, discount_price, category_id, subcategory_id, quantity, status, sku, brand, warranty_period, meta_title, meta_description, tags, is_featured, is_trending, is_new_arrival, model_3d_url, video_urls, product_links } = req.body;
    if (!name || !price) return res.status(400).json({ success: false, message: 'Name and price are required' });
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const [result] = await pool.query(
      `INSERT INTO products (name, slug, description, price, discount_price, category_id, subcategory_id, quantity, status, sku, brand, warranty_period, meta_title, meta_description, tags, is_featured, is_trending, is_new_arrival, model_3d_url, video_urls, product_links) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name, finalSlug, description || '', price, discount_price || null, category_id || null, subcategory_id || null, quantity || 0, status || 'active', sku || null, brand || null, warranty_period || null, meta_title || null, meta_description || null, tags || null, is_featured || 0, is_trending || 0, is_new_arrival || 0, model_3d_url || null, video_urls || null, product_links || null]
    );
    const [newProduct] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, message: 'Product created', data: newProduct[0] });
  } catch (error) {
    console.error('Create Product Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create product' });
  }
});

// 5. UPDATE PRODUCT (Admin)
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId)) return res.status(400).json({ success: false, message: 'Invalid ID format' });
    const fields = req.body;
    const allowedFields = ['name','slug','description','price','discount_price','category_id','subcategory_id','quantity','status','sku','brand','warranty_period','meta_title','meta_description','tags','is_featured','is_trending','is_new_arrival','model_3d_url','video_urls','product_links'];
    const updates = [];
    const values = [];
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ success: false, message: 'No valid fields to update' });
    values.push(productId);
    await pool.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, values);
    const [updated] = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);
    res.json({ success: true, message: 'Product updated', data: updated[0] });
  } catch (error) {
    console.error('Update Product Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
});

// 6. TOGGLE PRODUCT STATUS (Admin)
router.patch('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive', 'draft'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
    await pool.query('UPDATE products SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true, message: `Product status set to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// 7. UPLOAD PRODUCT IMAGES (Admin) - Uses Cloudflare R2 via multer-s3
// FIX: Replaced local diskStorage with R2 upload middleware from config/s3Upload.js
// Axios natively sets multipart boundary; multer reads file.location (R2 public URL)
router.post('/:id/images', authenticateAdmin, upload.array('images', 10), async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'No images uploaded' });
    // multer-s3 sets file.location to the full R2/S3 URL
    const imageUrls = req.files.map(f => f.location);
    const [existing] = await pool.query('SELECT video_urls FROM products WHERE id = ?', [productId]);
    let currentImages = [];
    try {
      currentImages = existing[0]?.video_urls ? JSON.parse(existing[0].video_urls) : [];
    } catch (e) {
      currentImages = [];
    }
    const allImages = [...currentImages, ...imageUrls];
    await pool.query('UPDATE products SET video_urls = ? WHERE id = ?', [JSON.stringify(allImages), productId]);
    res.json({ success: true, message: 'Images uploaded to R2', images: allImages });
  } catch (error) {
    console.error('Upload Images Error:', error);
    res.status(500).json({ success: false, message: 'Image upload failed' });
  }
});

// 8. DELETE PRODUCT IMAGE (Admin)
router.delete('/:id/images', authenticateAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const { imageUrl } = req.body;
    const [existing] = await pool.query('SELECT video_urls FROM products WHERE id = ?', [productId]);
    let currentImages = [];
    try {
      currentImages = existing[0]?.video_urls ? JSON.parse(existing[0].video_urls) : [];
    } catch (e) {
      currentImages = [];
    }
    const updated = currentImages.filter(img => img !== imageUrl);
    await pool.query('UPDATE products SET video_urls = ? WHERE id = ?', [JSON.stringify(updated), productId]);
    res.json({ success: true, message: 'Image removed', images: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete image' });
  }
});

// 9. ADD SERIAL NUMBERS TO PRODUCT (Admin)
router.post('/:id/serials', authenticateAdmin, async (req, res) => {
  try {
    const { serials } = req.body;
    if (!serials || !Array.isArray(serials)) return res.status(400).json({ success: false, message: 'Serials array required' });
    const values = serials.map(s => [req.params.id, s, 'available']);
    await pool.query('INSERT IGNORE INTO product_serials (product_id, serial_number, status) VALUES ?', [values]);
    res.json({ success: true, message: `${serials.length} serial(s) added` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add serials' });
  }
});

// 10. DELETE PRODUCT (Admin)
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId)) return res.status(400).json({ success: false, message: 'Invalid ID format' });
    await pool.query('DELETE FROM products WHERE id = ?', [productId]);
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    console.error('Delete Product Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

// 11. GET PRODUCT BY ID (Public)
router.get('/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId)) return res.status(400).json({ success: false, message: 'Invalid ID format' });
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product node not found by ID' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Fetch By ID Error:', error);
    res.status(500).json({ success: false, message: 'Database query failed' });
  }
});

module.exports = router;
