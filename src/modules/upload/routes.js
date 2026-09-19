import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v2 as cloudinary } from "cloudinary";

export const uploadRouter = Router();

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "ifgkvgea";
const apiKey = process.env.CLOUDINARY_API_KEY || "191247671482994";
const apiSecret = process.env.CLOUDINARY_API_SECRET || "mE8r_XIvkGT4Y7UWdcYWnI2kF2Q";

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true
});

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch {
    // ignore
  }
}

const ALLOWED_MIMES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf"
];
const ALLOWED_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".pdf"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIMES.includes(file.mimetype) || !ALLOWED_EXTS.includes(ext)) {
      return cb(new Error("Only image files (JPG, PNG, GIF, WebP, SVG) and PDFs are allowed"));
    }
    cb(null, true);
  }
});

const uploadToCloudinary = (fileBuffer, originalname) => {
  return new Promise((resolve, reject) => {
    const isPdf = path.extname(originalname).toLowerCase() === ".pdf";
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "respark_uploads",
        resource_type: isPdf ? "raw" : "auto",
        use_filename: false,
        unique_filename: true
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

uploadRouter.post("/", (req, res) => {
  upload.single("image")(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File too large. Maximum size is 10MB." });
      }
      return res.status(400).json({ message: err.message || "Invalid file type" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    // 1. Primary: Upload to Cloudinary (permanent cloud storage)
    if (cloudName && apiKey && apiSecret) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, req.file.originalname);
        if (result && result.secure_url) {
          return res.json({ url: result.secure_url });
        }
      } catch (cloudErr) {
        console.error("[Upload] Cloudinary upload error, attempting local fallback:", cloudErr);
      }
    }

    // 2. Fallback: Save to local disk if Cloudinary fails or is offline
    try {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const filename = uniqueSuffix + path.extname(req.file.originalname);
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, req.file.buffer);

      const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
      const fileUrl = `${proto}://${req.get("host")}/uploads/${filename}`;
      return res.json({ url: fileUrl });
    } catch (diskErr) {
      console.error("[Upload] Local disk save error:", diskErr);
      return res.status(500).json({ message: "Failed to upload file." });
    }
  });
});
