const express = require('express');
const router = express.Router();
const productModel = require('../models/productModel');
const { authenticateAdmin } = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// GET all active products (Public
router.get('/active', async (req, res) => {
  try {
    const products = await productModel.getActiveProducts(req.query);
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

// GET single product by ID or Slug (Public)
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
    
    // Handle Images
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await productModel.addProductImage(productId, file.path, 'image');
      }
    }
    
    // Handle Serials Initialization
    if (req.body.serials) {
      const { bulkAddProductSerials } = require('../models/serialModel'); // Assuming serialModel handles this
      const serials = JSON.parse(req.body.serials);
      if (serials.length > 0) {
        await bulkAddProductSerials(productId, serials);
      }
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
