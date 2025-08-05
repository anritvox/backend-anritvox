// backend/config/s3Upload.js
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const multer = require("multer");
const multerS3 = require("multer-s3");

// 1) R2 (S3-Compatible) Client Setup
const s3 = new S3Client({
  region: process.env.R2_REGION || "auto", // usually "auto" for R2
  endpoint: process.env.R2_ENDPOINT, // eg: https://<account_id>.r2.cloudflarestorage.com
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
    ResponseContentDisposition: "inline", // show in browser
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

// 3) Multer Middleware for Upload
const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.R2_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => cb(null, { fieldName: file.fieldname }),
    key: (req, file, cb) => {
      const filename = `${Date.now()}-${file.originalname}`;
      cb(null, `products/${filename}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith("image/")
      ? cb(null, true)
      : cb(new Error("Only image files are allowed")),
});

module.exports = { upload, presign };
