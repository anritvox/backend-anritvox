// backend/routes/warrantyRoutes.js
const express = require("express");
const router = express.Router();
const {
  validateSerial,
  registerWarranty,
  getAllRegistrations,
  updateRegistrationStatus,
  deleteRegistration,
} = require("../models/warrantyModel");
const authMiddleware = require("../middleware/authMiddleware");

// GET /api/warranty/validate/:serial
router.get("/validate/:serial", async (req, res) => {
  try {
    const info = await validateSerial(req.params.serial);
    res.json({
      product_id: info.product_id,
      product_name: info.product_name,
      category_id: info.category_id,
      category_name: info.category_name,
    });
  } catch (err) {
    console.error("Warranty validation error:", err);
    res
      .status(err.status || 500)
      .json({ message: err.message || "Server error" });
  }
});

// POST /api/warranty/register
router.post("/register", async (req, res) => {
  try {
    const { serial, product_id, user_name, user_email, user_phone } = req.body;

    // Validate presence of exactly these fields
    if (!serial || !product_id || !user_name || !user_email || !user_phone) {
      return res.status(400).json({
        message:
          "serial, product_id, user_name, user_email, and user_phone are required",
      });
    }

    const result = await registerWarranty({
      serial,
      product_id,
      user_name,
      user_email,
      user_phone,
    });
    res.status(201).json({ message: "Warranty registered", ...result });
  } catch (err) {
    console.error("Warranty registration error:", err);
    res
      .status(err.status || 500)
      .json({ message: err.message || "Server error" });
  }
});

// Admin: list all registrations
router.get("/admin", authMiddleware, async (req, res) => {
  try {
    const list = await getAllRegistrations();
    res.json(list);
  } catch (err) {
    console.error("Error listing registrations:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin: accept/reject
router.put("/admin/:id", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body; // 'accepted' or 'rejected'
    const updated = await updateRegistrationStatus(req.params.id, status);
    res.json({ message: "Updated", ...updated });
  } catch (err) {
    console.error("Error updating status:", err);
    res
      .status(err.status || 500)
      .json({ message: err.message || "Server error" });
  }
});

// Admin: delete registration
router.delete("/admin/:id", authMiddleware, async (req, res) => {
  try {
    await deleteRegistration(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error("Error deleting registration:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
