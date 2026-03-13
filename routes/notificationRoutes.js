// backend/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateUser } = require('./userRoutes');
const { authenticateAdmin } = require('../middleware/authMiddleware');
const { createNotification, getNotificationsForUser, markAsRead, countUnread, getAllNotifications, deleteNotification } = require('../models/notificationModel');

// GET /api/notifications - user: get own + global notifications
router.get('/', authenticateUser, async (req, res) => {
  try {
    const notifications = await getNotificationsForUser(req.user.id);
    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get notifications' });
  }
});

// GET /api/notifications/unread-count - user: unread count
router.get('/unread-count', authenticateUser, async (req, res) => {
  try {
    const count = await countUnread(req.user.id);
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get unread count' });
  }
});

// PUT /api/notifications/mark-read - user: mark all as read
router.put('/mark-read', authenticateUser, async (req, res) => {
  try {
    await markAsRead(req.user.id);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to mark as read' });
  }
});

// PUT /api/notifications/:id/mark-read - user: mark one as read
router.put('/:id/mark-read', authenticateUser, async (req, res) => {
  try {
    await markAsRead(req.user.id, req.params.id);
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to mark as read' });
  }
});

// GET /api/notifications/admin/all - admin: all notifications
router.get('/admin/all', authenticateAdmin, async (req, res) => {
  try {
    const notifications = await getAllNotifications();
    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get notifications' });
  }
});

// POST /api/notifications/admin - admin: create notification (specific user or global)
router.post('/admin', authenticateAdmin, async (req, res) => {
  try {
    const { user_id, title, message, type, is_global } = req.body;
    if (!title || !message) return res.status(400).json({ message: 'title and message are required' });
    const id = await createNotification({ user_id, title, message, type, is_global });
    res.status(201).json({ message: 'Notification created', id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create notification' });
  }
});

// DELETE /api/notifications/admin/:id - admin: delete notification
router.delete('/admin/:id', authenticateAdmin, async (req, res) => {
  try {
    await deleteNotification(req.params.id);
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

module.exports = router;
