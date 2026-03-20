// backend-anritvox/models/serialModel.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const Product = require('./productModel');

// ============= DATABASE SCHEMA (Mongoose) =============
const serialSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  serial_number: { type: String, unique: true, required: true, index: true },
  status: { 
    type: String, 
    enum: ['available', 'sold', 'registered', 'blocked'], 
    default: 'available',
    index: true 
  },
  batch_number: { type: String, index: true },
  notes: { type: String },
  is_new_format: { type: Boolean, default: false }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

const Serial = mongoose.model('ProductSerial', serialSchema);

// ============= SERIAL NUMBER GENERATOR =============
const generateEnhancedSerial = (prefix = 'ANRI') => {
  const cleanPrefix = prefix.toString().substring(0, 4).toUpperCase().padEnd(4, 'X');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 

  const date = new Date();
  const yearMonth = (date.getFullYear() % 100).toString().padStart(2, '0') +
                    (date.getMonth() + 1).toString().padStart(2, '0');

  let unique = '';
  for (let i = 0; i < 6; i++) {
    unique += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const baseSerial = `${cleanPrefix}-${yearMonth}-${unique}`;
  const checksum = generateChecksum(baseSerial);

  return `${baseSerial}-${checksum}`;
};

const generateChecksum = (serial) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const hash = crypto.createHash('md5').update(serial).digest('hex');
  return (chars.charAt(parseInt(hash[0], 16) % chars.length) +
          chars.charAt(parseInt(hash[1], 16) % chars.length));
};

const validateSerialChecksum = (serial) => {
  if (!serial || typeof serial !== 'string') return false;
  const parts = serial.split('-');
  if (parts.length !== 4) return false;

  const baseSerial = parts.slice(0, 3).join('-');
  const providedChecksum = parts[3];
  const calculatedChecksum = generateChecksum(baseSerial);

  return providedChecksum === calculatedChecksum;
};

const isNewFormatSerial = (serial) => {
  if (!serial || typeof serial !== 'string') return false;
  const parts = serial.split('-');
  return parts.length === 4;
};

// ============= BULK SERIAL GENERATION =============
const addSerials = async (productId, count, batchNumber, prefix) => {
  const totalCount = parseInt(count, 10);

  if (totalCount > 100000) {
    throw new Error('Cannot generate more than 100,000 serials in one batch.');
  }

  const serialSet = new Set();
  while (serialSet.size < totalCount) {
    const sn = generateEnhancedSerial(prefix);
    serialSet.add(sn);
  }

  const serialDocs = Array.from(serialSet).map(sn => ({
    product_id: productId,
    serial_number: sn,
    status: 'available',
    batch_number: batchNumber,
    is_new_format: true
  }));

  // Insert Many is highly optimized in Mongoose
  await Serial.insertMany(serialDocs, { ordered: false }); 
  return Array.from(serialSet);
};

// ============= ADVANCED QUERYING WITH PAGINATION =============
const getSerialsByProduct = async (productId, options = {}) => {
  const { page = 1, limit = 100, status, sortBy = 'created_at', sortOrder = 'DESC' } = options;
  const skip = (page - 1) * limit;
  const query = { product_id: productId };
  
  if (status) query.status = status;

  const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 1 : -1;
  const sortQuery = {};
  sortQuery[sortBy] = sortDirection;

  const serials = await Serial.find(query)
    .sort(sortQuery)
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Serial.countDocuments(query);

  const formattedSerials = serials.map(serial => ({
    ...serial,
    id: serial._id, // Map _id to id for frontend compatibility
    serial_type: serial.is_new_format ? 'NEW' : 'OLD'
  }));

  return {
    serials: formattedSerials,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

const getAllSerials = async (options = {}) => {
  const { page = 1, limit = 100, status, productId, batchNumber, searchTerm, sortBy = 'created_at', sortOrder = 'DESC' } = options;
  const skip = (page - 1) * limit;
  const query = {};

  if (status) query.status = status;
  if (productId) query.product_id = productId;
  if (batchNumber) query.batch_number = batchNumber;
  if (searchTerm) {
    query.serial_number = { $regex: searchTerm, $options: 'i' };
  }

  const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 1 : -1;
  const sortQuery = {};
  sortQuery[sortBy] = sortDirection;

  const serials = await Serial.find(query)
    .populate('product_id', 'name')
    .sort(sortQuery)
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Serial.countDocuments(query);

  const formattedSerials = serials.map(serial => ({
    ...serial,
    id: serial._id,
    product_name: serial.product_id ? serial.product_id.name : 'Unknown Product',
    product_id: serial.product_id ? serial.product_id._id : null,
    serial_type: serial.is_new_format ? 'NEW' : 'OLD'
  }));

  return {
    serials: formattedSerials,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

// ============= SERIAL VALIDATION =============
const checkSerial = async (serialNumber) => {
  const s = serialNumber.trim().toUpperCase();

  if (isNewFormatSerial(s) && !validateSerialChecksum(s)) {
    throw new Error('Invalid serial number format or checksum');
  }

  const serialRecord = await Serial.findOne({ serial_number: s })
    .populate('product_id', 'name images brand warranty_period')
    .lean();

  if (!serialRecord) return null;

  return {
    ...serialRecord,
    id: serialRecord._id,
    product_name: serialRecord.product_id?.name,
    images: serialRecord.product_id?.images,
    brand: serialRecord.product_id?.brand,
    warranty_period: serialRecord.product_id?.warranty_period
  };
};

// ============= SERIAL MANAGEMENT =============
const updateSerialStatus = async (id, status, notes = null) => {
  const updateData = { status };
  if (notes !== null) updateData.notes = notes;
  
  await Serial.findByIdAndUpdate(id, updateData);
};

const deleteSerial = async (id) => {
  await Serial.findByIdAndDelete(id);
};

const deleteBatch = async (batchNumber) => {
  const result = await Serial.deleteMany({ batch_number: batchNumber });
  return result.deletedCount;
};

const getSerialStatistics = async (productId = null) => {
  const matchStage = productId ? { $match: { product_id: new mongoose.Types.ObjectId(productId) } } : { $match: {} };

  const stats = await Serial.aggregate([
    matchStage,
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        available: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
        sold: { $sum: { $cond: [{ $eq: ["$status", "sold"] }, 1, 0] } },
        registered: { $sum: { $cond: [{ $eq: ["$status", "registered"] }, 1, 0] } },
        blocked: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } }
      }
    }
  ]);

  return stats.length > 0 ? stats[0] : { total: 0, available: 0, sold: 0, registered: 0, blocked: 0 };
};

// Empty function to keep route compatibility if it was called in other files
const createSerialTable = async () => {};

module.exports = {
  createSerialTable,
  addSerials,
  checkSerial,
  getSerialsByProduct,
  getAllSerials,
  updateSerialStatus,
  deleteSerial,
  deleteBatch,
  getSerialStatistics,
  generateEnhancedSerial,
  validateSerialChecksum,
  isNewFormatSerial,
  Serial // Export the model itself just in case
};
