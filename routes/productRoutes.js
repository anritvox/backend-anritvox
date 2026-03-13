// backend/routes/productRoutes.js
// Products: customer browsing + admin full control
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

// GET /api/products/:id  - product detail by ID
router.get('/:id', async (req, res) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    product.images = await toSignedUrls(product.images);
    return res.json(product);
  } catch (err) {
    console.error('Error fetching product:', err);
    return res.status(500).json({ error: 'Unable to load product.' });
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
    const { name, slug, sku, brand, description, price, discount_price, category_id, subcategory_id, meta_title, meta_description, tags, status } = req.body;
    productId = await createProduct({
      name, slug, sku, brand, description, price,
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
    const { name, slug, sku, brand, description, price, discount_price, category_id, subcategory_id, meta_title, meta_description, tags } = req.body;
    await updateProduct(productId, {
      name, slug, sku, brand, description, price,
      discount_price: discount_price || null,
      category_id, subcategory_id: subcategory_id || null,
      meta_title, meta_description, tags,
    });
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

module.exports = router;
