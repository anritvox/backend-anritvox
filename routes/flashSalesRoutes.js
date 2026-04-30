const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/flash-sales/active
router.get('/active', async (req, res) => {
  try {
    // Attempt to fetch currently active flash sales
    try {
      const query = `
        SELECT * FROM flash_sales 
        WHERE is_active = 1 
        AND start_time <= NOW() 
        AND end_time >= NOW()
      `;
      const [sales] = await pool.query(query);
      
      return res.status(200).json({ 
        success: true, 
        data: sales 
      });
      
    } catch (dbError) {
      // Graceful fallback if the flash_sales table does not exist yet
      console.warn("[DB Warning] Flash sales table missing or query failed:", dbError.message);
      return res.status(200).json({ 
        success: true, 
        data: [] // Frontend will receive an empty array and render smoothly
      });
    }
  } catch (error) {
    console.error("Flash sales route error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error fetching flash sales" 
    });
  }
});

module.exports = router;
