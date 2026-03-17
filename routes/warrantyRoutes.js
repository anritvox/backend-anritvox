const express = require("express");
const router = express.Router();
const { 
  validateSerial, 
  registerWarranty, 
  getAllRegistrations, 
  updateWarrantyStatus, 
  deleteWarranty 
} = require("../models/warrantyModel");
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

// ADMIN: Update warranty status (FIX FOR THE HTML PARSE ERROR)
router.put("/admin/:id", authenticateAdmin, async (req, res) => {
  try {
    await updateWarrantyStatus(req.params.id, req.body.status);
    res.json({ message: "Status updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error updating status" });
  }
});

// ADMIN: Delete warranty (FIX FOR THE HTML PARSE ERROR)
router.delete("/admin/:id", authenticateAdmin, async (req, res) => {
  try {
    await deleteWarranty(req.params.id);
    res.json({ message: "Warranty deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error deleting warranty" });
  }
});

module.exports = router;
