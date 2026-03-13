// backend/routes/categoryRoutes.js
// Categories: public listing + admin full control
const express = require('express');
const router = express.Router();
const {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../models/categoryModel');
const { authenticateAdmin } = require('../middleware/authMiddleware');

// GET /api/categories  (public)
router.get('/', async (req, res) => {
  try {
    const categories = await getAllCategories();
    return res.json(categories);
  } catch (err) {
    console.error('Error fetching categories:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/categories/:id  (public)
router.get('/:id', async (req, res) => {
  try {
    const category = await getCategoryById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Not found' });
    return res.json(category);
  } catch (err) {
    console.error('Error fetching category:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/categories  (admin)
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, image_url } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });
    const newCat = await createCategory({ name, description, image_url });
    return res.status(201).json(newCat);
  } catch (err) {
    console.error('Error creating category:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/categories/:id  (admin)
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, image_url } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });
    const updated = await updateCategory(req.params.id, { name, description, image_url });
    return res.json(updated);
  } catch (err) {
    console.error('Error updating category:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/categories/:id/status  (admin - activate/deactivate)
router.patch('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { is_active } = req.body;
    if (is_active === undefined) return res.status(400).json({ message: 'is_active is required' });
    const pool = require('../config/db');
    await pool.query('UPDATE categories SET is_active=? WHERE id=?', [is_active ? 1 : 0, req.params.id]);
    return res.json({ message: `Category ${is_active ? 'activated' : 'deactivated'}` });
  } catch (err) {
    console.error('Error updating category status:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/categories/:id  (admin)
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await deleteCategory(req.params.id);
    return res.json({ message: 'Category deleted' });
  } catch (err) {
    console.error('Error deleting category:', err);
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
