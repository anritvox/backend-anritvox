const express = require('express');
const router = express.Router();
const db = require('../config/db');

// FIXED: Using the exact exported name from your authMiddleware
const { authenticateAdmin } = require('../middleware/authMiddleware');

router.get('/kpis', authenticateAdmin, async (req, res) => {
  try {
    const period = req.query.period || '30d';
    let days = 30;
    if (period === '7d') days = 7;
    if (period === '90d') days = 90;

    const [salesData] = await db.execute(`
      SELECT DATE(created_at) as period,
        COUNT(*) as orders,
        SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END) as revenue
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY period ASC
    `, [days]);

    const [totalStats] = await db.execute(`
      SELECT 
        COUNT(*) as totalOrders,
        SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END) as totalRevenue
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [days]);

    const [userStats] = await db.execute(`
      SELECT COUNT(*) as newUsers 
      FROM users 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [days]);

    res.json({
      chartData: salesData,
      metrics: {
        revenue: totalStats[0].totalRevenue || 0,
        orders: totalStats[0].totalOrders || 0,
        newCustomers: userStats[0].newUsers || 0,
        avgOrderValue: totalStats[0].totalOrders > 0 
          ? (totalStats[0].totalRevenue / totalStats[0].totalOrders).toFixed(2) 
          : 0
      }
    });
  } catch (error) {
    console.error('Analytics Error:', error);
    res.status(500).json({ message: 'Failed to fetch analytics', error: error.message });
  }
});

module.exports = router;
