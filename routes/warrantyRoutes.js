const express = require("express");
const router = express.Router();
const { validateSerial, registerWarranty, getAllRegistrations } = require("../models/warrantyModel");
const { authenticateAdmin } = require("../middleware/authMiddleware");

// PUBLIC: Check serial for the E-Warranty form
router.get("/validate/:serial", async (req, res) => {
  try {
    const info = await validateSerial(req.params.serial);
    res.json(info);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// PUBLIC: Register the warranty
router.post("/register", async (req, res) => {
  try {
    const result = await registerWarranty(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ADMIN: View all registrations
router.get("/admin", authenticateAdmin, async (req, res) => {
  try {
    const list = await getAllRegistrations();
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
