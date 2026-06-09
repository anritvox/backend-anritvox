// routes/searchRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * Performs a 100% Traditional Relational Database Search (AI-Free, Zero External APIs)
 */
router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    const limit = parseInt(req.query.limit, 10) || 10;

    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const searchPattern = `%${q.trim()}%`;

    // Query active products matching the search phrase across titles, descriptions, and tags
    const [products] = await pool.query(
      `SELECT p.*, 
       (SELECT JSON_ARRAYAGG(file_path) FROM product_images WHERE product_id = p.id) as images
       FROM products p 
       WHERE p.status = 'active' AND (
         p.name LIKE ? OR 
         p.description LIKE ? OR 
         p.tags LIKE ?
       )
       LIMIT ?`,
      [searchPattern, searchPattern, searchPattern, limit]
    );

    res.json(products);
  } catch (error) {
    console.error("[Search Error]: Database execution failed:", error);
    next(error);
  }
});

module.exports = router;
