// backend/routes/contactRoutes.js
const express = require("express");
const router = express.Router();
const { getAllMessages, createMessage } = require("../models/contactModel");
const { authenticateAdmin } = require("../middleware/authMiddleware"); // FIX: Destructured import

// POST /api/contact
// Public: create a new message
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;
    if (!name || !email || !phone || !message) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const result = await createMessage({ name, email, phone, message });
    res
      .status(201)
      .json({ message: "Contact message received", id: result.id });
  } catch (err) {
    console.error("Error saving contact message:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/contact
// Admin: list all messages
router.get("/", authenticateAdmin, async (req, res) => { // FIX: Use destructured function
  try {
    const messages = await getAllMessages();
    res.json(messages);
  } catch (err) {
    console.error("Error fetching contact messages:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
