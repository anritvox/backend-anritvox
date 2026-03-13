// backend/routes/returnRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateUser } = require('./userRoutes');
const { authenticateAdmin } = require('../middleware/authMiddleware');
const { createReturn, getReturnsByUser, getReturnById, getAllReturns, updateReturnStatus } = require('../models/returnModel');

// GET /api/returns - user: get my returns
router.get('/', authenticateUser, async (req, res) => {
  try {
    const returns = await getReturnsByUser(req.user.id);
    res.json(returns);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get returns' });
  }
});

// POST /api/returns - user: create return request
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { order_id, reason, description, refund_type, items } = req.body;
    if (!order_id || !reason) return res.status(400).json({ message: 'order_id and reason are required' });
    const id = await createReturn({ order_id, user_id: req.user.id, reason, description, refund_type, items });
    res.status(201).json({ message: 'Return request submitted', id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create return request' });
  }
});

// GET /api/returns/:id - user: get specific return
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const ret = await getReturnById(req.params.id);
    if (!ret) return res.status(404).json({ message: 'Return not found' });
    if (ret.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
    res.json(ret);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get return' });
  }
});

// GET /api/returns/admin/all - admin: all returns (optional ?status=requested)
router.get('/admin/all', authenticateAdmin, async (req, res) => {
  try {
    const returns = await getAllReturns(req.query.status || null);
    res.json(returns);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get returns' });
  }
});

// PUT /api/returns/admin/:id - admin: update return status
router.put('/admin/:id', authenticateAdmin, async (req, res) => {
  try {
    const { status, admin_notes, refund_amount } = req.body;
    if (!status) return res.status(400).json({ message: 'status is required' });
    await updateReturnStatus(req.params.id, status, admin_notes, refund_amount);
    res.json({ message: 'Return status updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update return' });
  }
});

module.exports = router;
