const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateAdmin } = require('../middleware/authMiddleware');
const { generateUploadUrl } = require('../config/s3Upload');

// Helper to safely parse JSON arrays from MySQL
const parseImages = (rows) => {
  return rows.map(row => {
    let parsedImages = [];
    if (row.images) {
      try {
        parsedImages = typeof row.images === 'string' ? JSON.parse(row.images) : row.images;
      } catch (e) { parsedImages = []; }
    }
    return { ...row, images: parsedImages };
  });
};

// 1. GET ALL ACTIVE PRODUCTS (Public)
router.get('/active', async (req, res) => {
  try {
    const { category, subcategory, search, sort, min_price, max_price } = req.query;
    let query = `
      SELECT p.*, 
      (SELECT JSON_ARRAYAGG(file_path) FROM product_images WHERE product_id = p.id) as images 
      FROM products p WHERE p.status = "active"
    `;
    const params = [];
    
    if (category) { query += ' AND p.category_id = ?'; params.push(category); }
    if (subcategory) { query += ' AND p.subcategory_id = ?'; params.push(subcategory); }
    if (search) { query += ' AND p.name LIKE ?'; params.push(`%${search}%`); }
    if (min_price) { query += ' AND p.price >= ?'; params.push(min_price); }
    if (max_price) { query += ' AND p.price <= ?'; params.push(max_price); }
    
    if (sort === 'price_asc') query += ' ORDER BY p.price ASC';
    else if (sort === 'price_desc') query += ' ORDER BY p.price DESC';
    else if (sort === 'newest') query += ' ORDER BY p.created_at DESC';
    else if (sort === 'rating') query += ' ORDER BY p.rating DESC';
    else query += ' ORDER BY p.created_at DESC';
    
    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: parseImages(rows) });
  } catch (error) {
    console.error('Fetch Active Products Error:', error);
    res.status(500).json({ success: false, message: 'Database query failed' });
  }
});

// 2. GET ALL PRODUCTS ADMIN (Protected)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, c.name as category_name,
      (SELECT JSON_ARRAYAGG(file_path) FROM product_images WHERE product_id = p.id) as images
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, data: parseImages(rows) });
  } catch (error) {
    console.error('Admin Fetch Products Error:', error);
    res.status(500).json({ success: false, message: 'Database query failed' });
  }
});

// 3. GET PRODUCT BY SLUG (Public)
router.get('/slug/:slug', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, 
      (SELECT JSON_ARRAYAGG(file_path) FROM product_images WHERE product_id = p.id) as images
      FROM products p WHERE p.slug = ? AND p.status = "active"
    `, [req.params.slug]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product node not found by slug' });
    res.json({ success: true, data: parseImages(rows)[0] });
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

// 7. GET PRE-SIGNED UPLOAD URL (Admin)
router.post('/presign', authenticateAdmin, async (req, res) => {
  try {
    const { filename, fileType } = req.body;
    if (!filename || !fileType) return res.status(400).json({ success: false, message: 'Filename and type required' });
    
    const { uploadUrl, key } = await generateUploadUrl(filename, fileType);
    res.json({ success: true, uploadUrl, key });
  } catch (error) {
    console.error('Presign Error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate secure upload link' });
  }
});

// 8. SAVE IMAGE KEYS TO DATABASE (Admin)
router.post('/:id/images/save', authenticateAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const { imageKeys } = req.body; 
    
    if (!imageKeys || imageKeys.length === 0) return res.status(400).json({ success: false, message: 'No image keys provided' });
    
    const values = imageKeys.map(key => [productId, key, 'image']);
    await pool.query('INSERT INTO product_images (product_id, file_path, media_type) VALUES ?', [values]);
    
    res.json({ success: true, message: 'Images linked to product' });
  } catch (error) {
    console.error('Save Image Error:', error);
    res.status(500).json({ success: false, message: 'Failed to link images to database' });
  }
});

// 9. DELETE ALL PRODUCT IMAGES (Admin)
router.delete('/:id/images/all', authenticateAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    await pool.query('DELETE FROM product_images WHERE product_id = ?', [productId]);
    res.json({ success: true, message: 'All images purged from database' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to purge images' });
  }
});

// 10. DELETE SINGLE PRODUCT IMAGE (Admin)
router.delete('/:id/images', authenticateAdmin, async (req, res) => {
  try {
    const { imageId } = req.body;
    await pool.query('DELETE FROM product_images WHERE id = ? AND product_id = ?', [imageId, req.params.id]);
    res.json({ success: true, message: 'Image removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete image' });
  }
});

// 11. ADD SERIAL NUMBERS TO PRODUCT (Admin)
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

// 12. DELETE PRODUCT (Admin)
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

// 13. GET PRODUCT BY ID (Public)
router.get('/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId)) return res.status(400).json({ success: false, message: 'Invalid ID format' });
    const [rows] = await pool.query(`
      SELECT p.*, 
      (SELECT JSON_ARRAYAGG(file_path) FROM product_images WHERE product_id = p.id) as images
      FROM products p WHERE p.id = ?
    `, [productId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product node not found by ID' });
    res.json({ success: true, data: parseImages(rows)[0] });
  } catch (error) {
    console.error('Fetch By ID Error:', error);
    res.status(500).json({ success: false, message: 'Database query failed' });
  }
});

module.exports = router;
