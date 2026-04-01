// backend/routes/productRoutes.js

const express = require('express');
const router = express.Router();
const { upload, presign } = require('../config/s3Upload');
const {
  getAllProducts,
  getActiveProducts,
  getProductById,
  getProductBySlug,
  createProduct,
  updateProduct,
  updateProductStatus,
  addProductImage,
  deleteProductImage,
  addSerialNumber,
  deleteProduct,
} = require('../models/productModel');
const { authenticateAdmin } = require('../middleware/authMiddleware');

// Helper: convert stored S3 keys/URLs into pre-signed URLs
const toSignedUrls = async (images) => {
  if (!images || !images.length) return [];
  const keys = images.map((img) => {
    if (img && img.startsWith('http')) {
      try { return new URL(img).pathname.slice(1); } catch { return img; }
    }
    return img;
  });
  return Promise.all(keys.map((key) => presign(key)));
};

// ─── CUSTOMER ROUTES (public) ────────────────────────────────

// GET /api/products  - active products with optional filters
// Query params: category_id, subcategory_id, min_price, max_price, search, sort
router.get('/', async (req, res) => {
  try {
    const { category_id, subcategory_id, min_price, max_price, search, sort } = req.query;
    const products = await getActiveProducts({ category_id, subcategory_id, min_price, max_price, search, sort });
    for (const p of products) {
      p.images = await toSignedUrls(p.images);
    }
    return res.json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    return res.status(500).json({ error: 'Unable to load products.' });
  }
});

// GET /api/products/slug/:slug  - product detail by slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const product = await getProductBySlug(req.params.slug);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    product.images = await toSignedUrls(product.images);
    return res.json(product);
  } catch (err) {
    console.error('Error fetching product by slug:', err);
    return res.status(500).json({ error: 'Unable to load product.' });
  }
});

// GET /api/products/:id - Fetch a single product safely
router.get('/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    
    // 1. Guard against 'undefined' or missing IDs
    if (!productId || productId === 'undefined' || productId === 'null') {
      return res.status(400).json({ message: "Invalid Product ID provided" });
    }

    const pool = require('../config/db'); 
    
    // 2. Fetch the product
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);

    // 3. Handle not found
    if (rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = rows[0];

    // 4. Safely parse the images array (MySQL stores it as a string)
    if (typeof product.images === 'string') {
      try {
        product.images = JSON.parse(product.images);
      } catch (e) {
        // Fallback if it's just a single URL string and not valid JSON
        product.images = [product.images]; 
      }
    } else if (!product.images) {
      product.images = [];
    }

    return res.json(product);
  } catch (err) {
    console.error("Backend Error fetching product by ID:", err);
    return res.status(500).json({ message: "Server error fetching product details" });
  }
});

// ─── ADMIN ROUTES (protected) ───────────────────────────────

// GET /api/products/admin/all  - all products including inactive
router.get('/admin/all', authenticateAdmin, async (req, res) => {
  try {
    const products = await getAllProducts();
    for (const p of products) {
      p.images = await toSignedUrls(p.images);
    }
    return res.json(products);
  } catch (err) {
    console.error('Error fetching all products:', err);
    return res.status(500).json({ error: 'Unable to load products.' });
  }
});

// POST /api/products  - create product (admin)
router.post('/', authenticateAdmin, upload.array('images', 10), async (req, res) => {
  let productId;
  try {
    let serials = [];
    try { serials = JSON.parse(req.body.serials || '[]'); } catch {
      return res.status(400).json({ error: 'Invalid serials format.' });
    }
    const cleaned = serials.map((s) => s.trim().toUpperCase());
    const invalid = cleaned.filter((s) => !/^[A-Z0-9]+$/.test(s));
    const dupes = cleaned.filter((s, i) => cleaned.indexOf(s) !== i);
    if (invalid.length) return res.status(400).json({ error: `Invalid serial(s): ${[...new Set(invalid)].join(', ')}.` });
    if (dupes.length) return res.status(400).json({ error: `Duplicate serial(s): ${[...new Set(dupes)].join(', ')}.` });

    const quantityToStore = cleaned.length > 0 ? cleaned.length : Number(req.body.quantity) || 0;
    const { name, slug, sku, brand, warranty_period, description, price, discount_price, category_id, subcategory_id, meta_title, meta_description, tags, status } = req.body;
    productId = await createProduct({
      name, slug, sku, brand, warranty_period, description, price,
      discount_price: discount_price || null,
      quantity: quantityToStore,
      category_id, subcategory_id: subcategory_id || null,
      meta_title, meta_description, tags,
      status: status || 'active',
    });
    for (const file of req.files) { await addProductImage(productId, file.key); }
    for (const s of cleaned) {
      try { await addSerialNumber(productId, s); } catch (serialErr) {
        if (serialErr.status === 409 && serialErr.duplicateSerial) {
          if (productId) { try { await deleteProduct(productId); } catch {} }
          return res.status(409).json({ error: `Duplicate serial: ${serialErr.duplicateSerial}`, duplicateSerial: serialErr.duplicateSerial });
        }
        throw serialErr;
      }
    }
    return res.status(201).json({ id: productId });
  } catch (err) {
    console.error('Error creating product:', err);
    if (productId) { try { await deleteProduct(productId); } catch {} }
    if (err.code === 'ER_DUP_ENTRY') {
      const match = err.sqlMessage && err.sqlMessage.match(/Duplicate entry '(.+?)'/);
      return res.status(400).json({ error: match ? `Serial '${match[1]}' already exists.` : 'Duplicate entry error.' });
    }
    return res.status(500).json({ error: 'Unable to create product.' });
  }
});

// PUT /api/products/:id  - update product (admin)
router.put('/:id', authenticateAdmin, upload.array('images', 10), async (req, res) => {
  try {
    const productId = req.params.id;
    const pool = require('../config/db');

    // --- FIXED: IMAGE DELETION ENGINE ---
    let retainedImages = [];
    try {
      if (req.body.existing_images) {
        retainedImages = JSON.parse(req.body.existing_images);
      }
    } catch (e) {
      console.error("Failed to parse existing_images");
    }

    // Extract the raw AWS S3 / local keys from the full URLs
    const retainedKeys = retainedImages.map(url => {
      try { return new URL(url).pathname.slice(1); } catch { return url; }
    });

    // Fetch current database images
    const [currentImgs] = await pool.query('SELECT file_path FROM product_images WHERE product_id = ?', [productId]);
    const currentPaths = currentImgs.map(i => i.file_path);
    
    // Cross-reference and delete missing images from DB and Storage
    const toDelete = currentPaths.filter(p => !retainedKeys.includes(p));
    for (const p of toDelete) {
      await deleteProductImage(productId, p);
    }
    // ------------------------------------

    let serials = [];
    if (req.body.serials) {
      try { serials = JSON.parse(req.body.serials); } catch {
        return res.status(400).json({ error: 'Invalid serials format.' });
      }
      const cleaned = serials.map((s) => s.trim().toUpperCase());
      const invalid = cleaned.filter((s) => !/^[A-Z0-9]+$/.test(s));
      const dupes = cleaned.filter((s, i) => cleaned.indexOf(s) !== i);
      if (invalid.length) return res.status(400).json({ error: `Invalid serial(s): ${[...new Set(invalid)].join(', ')}.` });
      if (dupes.length) return res.status(400).json({ error: `Duplicate serial(s): ${[...new Set(dupes)].join(', ')}.` });
      req.body.serials = cleaned;
    }
    
    const { name, slug, sku, brand, warranty_period, description, price, discount_price, category_id, subcategory_id, meta_title, meta_description, tags } = req.body;
    await updateProduct(productId, {
      name, slug, sku, brand, warranty_period, description, price,
      discount_price: discount_price || null,
      category_id, subcategory_id: subcategory_id || null,
      meta_title, meta_description, tags,
    });
    
    // Add new uploads
    for (const file of req.files) { await addProductImage(productId, file.key); }
    return res.json({ id: productId });
  } catch (err) {
    console.error('Error updating product:', err);
    return res.status(500).json({ error: 'Unable to update product.' });
  }
});

// PATCH /api/products/:id/status  - publish/unpublish (admin)
router.patch('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or inactive.' });
    }
    await updateProductStatus(req.params.id, status);
    return res.json({ message: `Product ${status === 'active' ? 'published' : 'unpublished'} successfully.` });
  } catch (err) {
    console.error('Error updating product status:', err);
    return res.status(500).json({ error: 'Unable to update product status.' });
  }
});

// DELETE /api/products/:id  - delete product (admin)
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const result = await deleteProduct(req.params.id);
    return res.json(result);
  } catch (err) {
    console.error('Error deleting product:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Unable to delete product.' });
  }
});

// POST /api/products/:id/stock - adjust stock quantity (admin)
router.post('/:id/stock', authenticateAdmin, async (req, res) => {
  try {
    const pool = require('../config/db');
    const productId = req.params.id;
    const { adjustment, stock } = req.body;
    if (stock !== undefined) {
      // Set absolute stock
      const newStock = Math.max(0, parseInt(stock));
      await pool.query('UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?', [newStock, productId]);
      return res.json({ message: 'Stock updated', stock: newStock });
    } else if (adjustment !== undefined) {
      // Relative adjustment (+/-)
      const adj = parseInt(adjustment);
      await pool.query('UPDATE products SET quantity = GREATEST(0, quantity + ?), updated_at = NOW() WHERE id = ?', [adj, productId]);
      const [rows] = await pool.query('SELECT quantity FROM products WHERE id = ?', [productId]);
      return res.json({ message: 'Stock adjusted', stock: rows[0]?.quantity });
    } else {
      return res.status(400).json({ error: 'Provide stock or adjustment value' });
    }
  } catch (err) {
    console.error('Error adjusting stock:', err);
    return res.status(500).json({ error: 'Unable to adjust stock' });
  }
});

// PUT /api/products/:id/stock - update stock + lowStockThreshold (admin, from InventoryManagement)
router.put('/:id/stock', authenticateAdmin, async (req, res) => {
  try {
    const pool = require('../config/db');
    const productId = req.params.id;
    const { stock, lowStockThreshold } = req.body;
    const updates = [];
    const params = [];
    if (stock !== undefined) { updates.push('quantity = ?'); params.push(Math.max(0, parseInt(stock))); }
    if (lowStockThreshold !== undefined) { updates.push('low_stock_threshold = ?'); params.push(parseInt(lowStockThreshold) || 10); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(productId);
    await pool.query(`UPDATE products SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
    return res.json({ message: 'Stock updated successfully' });
  } catch (err) {
    console.error('Error updating stock:', err);
    return res.status(500).json({ error: 'Unable to update stock' });
  }
});

module.exports = router;
