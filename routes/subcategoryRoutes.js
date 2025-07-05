// backend/routes/subcategoryRoutes.js
const express = require("express");
const router = express.Router();
const {
  getAllSubcategories,
  getSubcategoryById,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} = require("../models/subcategoryModel");

// GET /api/subcategories
router.get("/", async (req, res) => {
  try {
    const subs = await getAllSubcategories();
    res.json(subs);
  } catch (err) {
    console.error("Error fetching subcategories:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/subcategories/:id
router.get("/:id", async (req, res) => {
  try {
    const sub = await getSubcategoryById(req.params.id);
    if (!sub) return res.status(404).json({ message: "Not found" });
    res.json(sub);
  } catch (err) {
    console.error("Error fetching subcategory:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/subcategories
router.post("/", async (req, res) => {
  try {
    const { name, category_id } = req.body;
    if (!name || !category_id) {
      return res
        .status(400)
        .json({ message: "Name and category_id are required" });
    }
    const newSub = await createSubcategory(name, category_id);
    res.status(201).json(newSub);
  } catch (err) {
    console.error("Error creating subcategory:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/subcategories/:id
router.put("/:id", async (req, res) => {
  try {
    const { name, category_id } = req.body;
    if (!name || !category_id) {
      return res
        .status(400)
        .json({ message: "Name and category_id are required" });
    }
    const updatedSub = await updateSubcategory(
      req.params.id,
      name,
      category_id
    );
    res.json(updatedSub);
  } catch (err) {
    console.error("Error updating subcategory:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/subcategories/:id
router.delete("/:id", async (req, res) => {
  try {
    await deleteSubcategory(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error("Error deleting subcategory:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
