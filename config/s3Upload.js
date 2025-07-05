// backend/config/s3Upload.js
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const multer = require("multer");
const multerS3 = require("multer-s3");

// 1) S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 2) Presign helper now forcing inline display
async function presign(key, expiresIn = 900) {
  const cmd = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    // ensure browser treats it as inline
    ResponseContentDisposition: "inline",
    // optional: explicitly set content type override
    // ResponseContentType: "image/jpeg" // or derive from key/file
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

// 3) Multer‐S3 upload middleware with proper Content-Type
const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.S3_BUCKET_NAME,
    // Automatically set Content-Type based on the file’s mimetype
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => cb(null, { fieldName: file.fieldname }),
    key: (req, file, cb) => {
      const filename = `${Date.now()}-${file.originalname}`;
      cb(null, `products/${filename}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith("image/")
      ? cb(null, true)
      : cb(new Error("Only image files are allowed")),
});

module.exports = { upload, presign };
