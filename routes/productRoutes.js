const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. Get All Active Products
router.get('/active', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products WHERE status = "active"');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("Fetch Active Products Error:", error);
        res.status(500).json({ success: false, message: "Database query failed" });
    }
});

// 2. Get Product by Slug
router.get('/slug/:slug', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products WHERE slug = ? AND status = "active"', [req.params.slug]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product node not found by slug' });
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error("Fetch By Slug Error:", error);
        res.status(500).json({ success: false, message: "Database query failed" });
    }
});

// 3. Get Product by ID (MySQL Integer)
router.get('/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id, 10);
        if (isNaN(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }

        const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Product node not found by ID' });
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error("Fetch By ID Error:", error);
        res.status(500).json({ success: false, message: "Database query failed" });
    }
});

module.exports = router;
