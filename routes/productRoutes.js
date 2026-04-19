const express = require('express');
const router = express.Router();
const productModel = require('../models/productModel');
const { authenticateAdmin, authenticateUser } = require('../middleware/authMiddleware');
const pool = require('../config/db');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// ─── SPECIFIC NAMED ROUTES (must be before /:identifier) ───

// GET /api/products/active - all active products (Public)
router.get('/active', async (req, res) => {
  try {
    const products = await productModel.getActiveProducts(req.query);
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/products/new-arrivals
router.get('/new-arrivals', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 8;
    const [rows] = await pool.query(
      `SELECT p.*, (SELECT file_path FROM product_images WHERE product_id = p.id LIMIT 1) AS image
       FROM products p WHERE p.status = 'active' ORDER BY p.created_at DESC LIMIT ?`,
      [limit]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/recommendations - personalized (auth optional)
router.get('/recommendations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 8;
    const [rows] = await pool.query(
      `SELECT p.*, (SELECT file_path FROM product_images WHERE product_id = p.id LIMIT 1) AS image
       FROM products p WHERE p.status = 'active' ORDER BY RAND() LIMIT ?`,
      [limit]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/search/suggestions
router.get('/search/suggestions', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q.trim()) return res.json([]);
    const [rows] = await pool.query(
      `SELECT id, name, slug, discount_price, price,
        (SELECT file_path FROM product_images WHERE product_id = p.id LIMIT 1) AS image
       FROM products p WHERE p.status = 'active' AND p.name LIKE ? LIMIT 10`,
      [`%${q}%`]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET all products (Admin)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const products = await productModel.getAllProducts();
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PARAMETRIC ROUTES ───

// GET /api/products/:id/reviews - get reviews for a product
router.get('/:id/reviews', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const [reviews] = await pool.query(
      `SELECT r.*, u.name AS user_name FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.product_id = ? AND r.is_approved = 1
       ORDER BY r.created_at DESC`,
      [productId]
    );
    const total = reviews.length;
    const avg = total ? (reviews.reduce((s, r) => s + r.rating, 0) / total).toFixed(1) : 0;
    const dist = reviews.reduce((acc, r) => { acc[r.rating] = (acc[r.rating] || 0) + 1; return acc; }, {});
    res.json({ reviews, summary: { average: avg, total, distribution: dist } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/products/:productId/reviews - submit review (alias)
router.post('/:productId/reviews', authenticateUser, async (req, res) => {
  try {
    const { rating, comment, title } = req.body;
    if (!rating) return res.status(400).json({ message: 'Rating required' });
    const [result] = await pool.query(
      `INSERT INTO reviews (product_id, user_id, rating, title, body, is_approved) VALUES (?, ?, ?, ?, ?, 0)`,
      [req.params.productId, req.user.id, rating, title || null, comment || null]
    );
    res.status(201).json({ message: 'Review submitted and pending approval', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'You already reviewed this product' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/:id/qa - product Q&A
router.get('/:id/qa', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT q.*, u.name AS user_name FROM product_qa q
       LEFT JOIN users u ON q.user_id = u.id
       WHERE q.product_id = ? AND q.is_approved = 1
       ORDER BY q.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    // Table may not exist yet - return empty array
    res.json([]);
  }
});

// POST /api/products/:productId/qa - submit question
router.post('/:productId/qa', authenticateUser, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ message: 'Question is required' });
    const [result] = await pool.query(
      `INSERT INTO product_qa (product_id, user_id, question, is_approved) VALUES (?, ?, ?, 0)`,
      [req.params.productId, req.user.id, question]
    );
    res.status(201).json({ message: 'Question submitted', id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/products/:productId/qa/:questionId/answer - answer question (admin)
router.post('/:productId/qa/:questionId/answer', authenticateAdmin, async (req, res) => {
  try {
    const { answer } = req.body;
    await pool.query(
      `UPDATE product_qa SET answer = ?, is_approved = 1, answered_at = NOW() WHERE id = ? AND product_id = ?`,
      [answer, req.params.questionId, req.params.productId]
    );
    res.json({ message: 'Answer posted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/:id/related
router.get('/:id/related', async (req, res) => {
  try {
    const [product] = await pool.query('SELECT category_id FROM products WHERE id = ?', [req.params.id]);
    if (!product.length) return res.json([]);
    const [rows] = await pool.query(
      `SELECT p.*, (SELECT file_path FROM product_images WHERE product_id = p.id LIMIT 1) AS image
       FROM products p
       WHERE p.category_id = ? AND p.id != ? AND p.status = 'active'
       ORDER BY RAND() LIMIT 8`,
      [product[0].category_id, req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/:id/frequently-bought
router.get('/:id/frequently-bought', async (req, res) => {
  try {
    // Return random active products as a fallback for frequently bought together
    const [rows] = await pool.query(
      `SELECT p.*, (SELECT file_path FROM product_images WHERE product_id = p.id LIMIT 1) AS image
       FROM products p WHERE p.id != ? AND p.status = 'active' ORDER BY RAND() LIMIT 4`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/products/:id/attachments
router.get('/:id/attachments', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM product_attachments WHERE product_id = ?`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    // Table may not exist
    res.json([]);
  }
});

// PUT /api/products/:id/seo - update product SEO (Admin)
router.put('/:id/seo', authenticateAdmin, async (req, res) => {
  try {
    const { meta_title, meta_description, meta_keywords } = req.body;
    await pool.query(
      `UPDATE products SET meta_title = ?, meta_description = ?, meta_keywords = ? WHERE id = ?`,
      [meta_title || null, meta_description || null, meta_keywords || null, req.params.id]
    );
    res.json({ success: true, message: 'SEO updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single product by ID or Slug (Public) - must be after named routes
router.get('/:identifier', async (req, res) => {
  try {
    const isNumeric = /^\d+$/.test(req.params.identifier);
    const product = isNumeric
      ? await productModel.getProductById(req.params.identifier)
      : await productModel.getProductBySlug(req.params.identifier);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST create product (Admin)
router.post('/', authenticateAdmin, upload.array('images'), async (req, res) => {
  try {
    const productId = await productModel.createProduct(req.body);
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await productModel.addProductImage(productId, file.path, 'image');
      }
    }
    if (req.body.serials) {
      const { bulkAddProductSerials } = require('../models/serialModel');
      const serials = JSON.parse(req.body.serials);
      if (serials.length > 0) await bulkAddProductSerials(productId, serials);
    }
    res.status(201).json({ success: true, message: 'Product created', id: productId });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update product (Admin)
router.put('/:id', authenticateAdmin, upload.array('images'), async (req, res) => {
  try {
    await productModel.updateProduct(req.params.id, req.body);
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await productModel.addProductImage(req.params.id, file.path, 'image');
      }
    }
    res.json({ success: true, message: 'Product updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE product (Admin)
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const result = await productModel.deleteProduct(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

// POST adjust stock
router.post('/:id/stock', authenticateAdmin, async (req, res) => {
  try {
    const newQty = await productModel.updateProductStock(req.params.id, req.body.adjustment, 'add');
    res.json({ success: true, quantity: newQty });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
