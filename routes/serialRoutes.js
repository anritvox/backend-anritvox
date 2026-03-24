const express = require("express");
const router = express.Router();

const {
addProductSerials,
getProductSerials,
getProductSerialStats,
updateProductSerial,
deleteProductSerial,
checkSerialAvailability,
} = require("../models/serialModel");

const addSerials = addProductSerials;

router.get("/:productId", async (req, res) => {
try {
const productId = req.params.productId;
const serials = await getProductSerials(productId);
res.json({ success: true, serials });
} catch (err) {
res.status(err.status || 500).json({ success: false, message: err.message });
}
});

router.get("/:productId/stats", async (req, res) => {
try {
const productId = req.params.productId;
const stats = await getProductSerialStats(productId);
res.json({ success: true, stats });
} catch (err) {
res.status(err.status || 500).json({ success: false, message: err.message });
}
});

router.post("/generate", async (req, res) => {
try {
const { productId, count, prefix } = req.body;

if (!productId || !count || count < 1) {
return res.status(400).json({
success: false,
message: "Product ID and count are required, count must be at least 1",
});
}

const serials = Array.from({ length: count }, (_, i) => {
const numPart = (i + 1).toString().padStart(6, "0");
return (prefix ? prefix.toUpperCase() + "-" : "") + numPart;
});

const result = await addSerials(productId, serials);
res.json({ success: true, result });
} catch (err) {
res.status(err.status || 500).json({ success: false, message: err.message });
}
});

router.post("/:productId/add", async (req, res) => {
try {
const productId = req.params.productId;
const { serials } = req.body;

if (!Array.isArray(serials) || serials.length === 0) {
return res.status(400).json({
success: false,
message: "Serials must be a non‑empty array",
});
}

const result = await addSerials(productId, serials);
res.json({ success: true, result });
} catch (err) {
res.status(err.status || 500).json({ success: false, message: err.message });
}
});

router.put("/:productId/:id", async (req, res) => {
try {
const productId = req.params.productId;
const serialId = req.params.id;
const { serial } = req.body;

if (!serial) {
return res.status(400).json({
success: false,
message: "Serial is required",
});
}

const result = await updateProductSerial(productId, serialId, serial);
res.json({ success: true, result });
} catch (err) {
res.status(err.status || 500).json({ success: false, message: err.message });
}
});

router.delete("/:productId/:id", async (req, res) => {
try {
const productId = req.params.productId;
const serialId = req.params.id;

const result = await deleteProductSerial(productId, serialId);
res.json({ success: true, result });
} catch (err) {
res.status(err.status || 500).json({ success: false, message: err.message });
}
});

router.post("/check", async (req, res) => {
try {
const { serial } = req.body;

if (!serial) {
return res.status(400).json({
success: false,
message: "Serial is required",
});
}

const result = await checkSerialAvailability(serial);
res.json({ success: true, result });
} catch (err) {
res.status(err.status || 500).json({ success: false, message: err.message });
}
});

module.exports = router;