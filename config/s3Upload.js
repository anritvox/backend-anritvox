// backend/config/s3Upload.js
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const multer = require("multer");

// 1) R2 (S3-Compatible) Client Setup
const s3 = new S3Client({
  region: process.env.R2_REGION || "auto",
  endpoint: process.env.R2_ENDPOINT, 
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

// 2) Generate Pre-Signed URL
async function presign(key, expiresIn = 3600) {
  const cmd = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: "inline",
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

// 3) Bulletproof Multer In-Memory Storage
const upload = multer({
  storage: multer.memoryStorage(), // Bypass multer-s3 entirely
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  }
});

// 4) Manual Cloudflare R2 Uploader
const uploadToR2 = async (file) => {
  // Clean filename to prevent spaces/characters from breaking URLs
  const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '-');
  const filename = `products/${Date.now()}-${cleanName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: filename,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await s3.send(command);
  return filename;
};

module.exports = { s3, upload, uploadToR2, presign };
