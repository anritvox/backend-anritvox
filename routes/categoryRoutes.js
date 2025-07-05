// backend/routes/categoryRoutes.js
const express = require("express");
const router = express.Router();
const model = require("../models/categoryModel");
const authMiddleware = require("../middleware/authMiddleware");

const {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} = model;

// GET /api/categories
router.get("/", async (req, res) => {
  try {
    const categories = await getAllCategories();
    res.json(categories);
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/categories/:id
router.get("/:id", async (req, res) => {
  try {
    const category = await getCategoryById(req.params.id);
    if (!category) return res.status(404).json({ message: "Not found" });
    res.json(category);
  } catch (err) {
    console.error("Error fetching category:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/categories
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });
    const newCat = await createCategory(name);
    res.status(201).json(newCat);
  } catch (err) {
    console.error("Error creating category:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/categories/:id
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });
    const updated = await updateCategory(req.params.id, name);
    res.json(updated);
  } catch (err) {
    console.error("Error updating category:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/categories/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await deleteCategory(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error("Error deleting category:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
