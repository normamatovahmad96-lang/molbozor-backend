const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Resend } = require("resend");

// ✅ Security
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
app.set("trust proxy", 1);

// =======================
// SECURITY + BODY LIMIT
// =======================
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

// =======================
// CORS (production friendly)
// Mobile requests ko‘pincha origin yubormaydi — shuning uchun !origin allow
// =======================
const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost:19006",
  "http://localhost:8081",
]);

if (process.env.ADMIN_PANEL_URL) allowedOrigins.add(process.env.ADMIN_PANEL_URL);

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true,
  })
);

// =======================
// ENV
// =======================
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI yo‘q (Render → Environment Variables)");
  process.exit(1);
}

// =======================
// MONGODB CONNECT
// =======================
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB error:", err);
    process.exit(1);
  });

// =======================
// CLOUDINARY INIT
// =======================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// =======================
// MULTER (RAM STORAGE)
// =======================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ======================================================
// ✅ USER AUTH MIDDLEWARE (TOKEN TEKSHIRADI)
// ======================================================
function userAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const parts = header.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ message: "Token yo‘q" });
    }

    const token = parts[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      return res.status(500).json({ message: "JWT_SECRET yo‘q" });
    }

    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded; // { userId, email }
    return next();
  } catch (e) {
    return res.status(401).json({ message: "Token noto‘g‘ri" });
  }
}

// ======================================================
// ✅ ADMIN AUTH
// ======================================================
function normalizeEmail(email) {
  return String(email || "").toLowerCase().trim();
}

function isAdminEmail(email) {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  return adminEmail && normalizeEmail(email) === adminEmail;
}

function signAdminToken(payload) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error("ADMIN_JWT_SECRET yo‘q");
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

function verifyAdminToken(token) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error("ADMIN_JWT_SECRET yo‘q");
  return jwt.verify(token, secret);
}

function adminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const parts = header.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ message: "Admin token yo‘q" });
    }

    const token = parts[1];
    const decoded = verifyAdminToken(token);

    req.admin = decoded;
    return next();
  } catch (e) {
    return res.status(401).json({ message: "Admin token noto‘g‘ri" });
  }
}

// =======================
// MODELS
// =======================

// USER
const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, default: "" },
  },
  { timestamps: true }
);
const User = mongoose.model("User", UserSchema);

// ELON
const ElonSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    title: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    description: { type: String, default: "" },
    phone: { type: String, default: "" },

    region: { type: String, default: "", index: true },
    district: { type: String, default: "" },

    category: { type: String, default: "", index: true },
    gender: { type: String, default: "" },
    purpose: { type: String, default: "" },
    unit: { type: String, default: "" },
    quantity: { type: Number, default: 0 },

    images: { type: [String], default: [] },

    views: { type: Number, default: 0 },
    favorites: { type: Number, default: 0 }, // counter (ixtiyoriy)
    phoneClicks: { type: Number, default: 0 },
    chatClicks: { type: Number, default: 0 },
  },
  { timestamps: true }
);
ElonSchema.index({ createdAt: -1 });
const Elon = mongoose.model("Elon", ElonSchema);

// OTP
const OtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    lastSentAt: { type: Date, default: null },
    sendCountHour: { type: Number, default: 0 },
    sendCountHourResetAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);
const OtpCode = mongoose.model("OtpCode", OtpSchema);

// SAVED ELONS (Real favorites)
const SavedElonSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    elonId: { type: mongoose.Schema.Types.ObjectId, ref: "Elon", required: true, index: true },
  },
  { timestamps: true }
);
SavedElonSchema.index({ userId: 1, elonId: 1 }, { unique: true });
const SavedElon = mongoose.model("SavedElon", SavedElonSchema);

// CHAT
const ChatSchema = new mongoose.Schema(
  {
    elonId: { type: mongoose.Schema.Types.ObjectId, ref: "Elon", required: true, index: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true }
);
ChatSchema.index({ buyerId: 1, updatedAt: -1 });
ChatSchema.index({ sellerId: 1, updatedAt: -1 });
const Chat = mongoose.model("Chat", ChatSchema);

// MESSAGE
const MessageSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);
MessageSchema.index({ chatId: 1, createdAt: -1 });
const Message = mongoose.model("Message", MessageSchema);

// =======================
// RESEND INIT
// =======================
const resend = new Resend(process.env.RESEND_API_KEY);

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =======================
// RATE LIMITERS
// =======================
const otpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { message: "Ko‘p urinish. 10 daqiqa kuting." },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { message: "Ko‘p urinish. 10 daqiqa kuting." },
});

// =======================
// HEALTH
// =======================
app.get("/health", (req, res) => res.send("ok"));

// =======================
// ADMIN: LOGIN + ME
// =======================
app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email va parol kerak" });
    if (!isAdminEmail(email)) return res.status(403).json({ message: "Admin emas" });

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) return res.status(500).json({ message: "ADMIN_PASSWORD yo‘q" });

    if (String(password) !== String(adminPassword)) {
      return res.status(401).json({ message: "Parol noto‘g‘ri" });
    }

    const token = signAdminToken({ role: "admin", email: normalizeEmail(email) });
    return res.json({ message: "Admin login bo‘ldi", adminToken: token, admin: { email: normalizeEmail(email), role: "admin" } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

app.get("/admin/me", adminAuth, async (req, res) => {
  return res.json({ admin: { email: req.admin.email, role: req.admin.role } });
});

// (admin panel uchun) elonlar ro‘yxati
app.get("/admin/elons", adminAuth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Elon.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Elon.countDocuments(),
    ]);

    return res.json({ page, limit, total, totalPages: Math.ceil(total / limit), items });
  } catch (e) {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// admin elonni o‘chirish
app.delete("/admin/elons/:id", adminAuth, async (req, res) => {
  try {
    await Elon.deleteOne({ _id: req.params.id });
    await SavedElon.deleteMany({ elonId: req.params.id });
    await Chat.deleteMany({ elonId: req.params.id });
    return res.json({ message: "Admin o‘chirdi" });
  } catch (e) {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// admin users
app.get("/admin/users", adminAuth, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).limit(200).select("_id email name createdAt");
    return res.json(users);
  } catch (e) {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// =======================
// AUTH: SEND OTP
// =======================
app.post("/auth/email/send-otp", otpSendLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) return res.status(400).json({ message: "Email noto‘g‘ri" });

    const normalizedEmail = String(email).toLowerCase().trim();
    const now = new Date();
    const otpExpireMinutes = Number(process.env.OTP_EXPIRE_MINUTES || 5);
    const expiresAt = new Date(now.getTime() + otpExpireMinutes * 60 * 1000);

    let otpDoc = await OtpCode.findOne({ email: normalizedEmail });

    if (!otpDoc) {
      otpDoc = await OtpCode.create({
        email: normalizedEmail,
        otpHash: "temp",
        expiresAt,
        lastSentAt: null,
        sendCountHour: 0,
        sendCountHourResetAt: now,
        attempts: 0,
      });
    }

    // 60 sec cooldown
    if (otpDoc.lastSentAt && now - otpDoc.lastSentAt < 60 * 1000) {
      return res.status(429).json({ message: "1 daqiqa kuting" });
    }

    // hourly 3 limit
    const resetAt = otpDoc.sendCountHourResetAt || now;
    if (now - resetAt > 60 * 60 * 1000) {
      otpDoc.sendCountHour = 0;
      otpDoc.sendCountHourResetAt = now;
    }
    if (otpDoc.sendCountHour >= 3) {
      return res.status(429).json({ message: "1 soatda limit tugadi" });
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);

    otpDoc.otpHash = otpHash;
    otpDoc.expiresAt = expiresAt;
    otpDoc.lastSentAt = now;
    otpDoc.sendCountHour += 1;
    otpDoc.attempts = 0;
    await otpDoc.save();

    const appName = process.env.APP_NAME || "Molbozor";
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!process.env.RESEND_API_KEY) return res.status(500).json({ message: "RESEND_API_KEY yo‘q" });
    if (!fromEmail) return res.status(500).json({ message: "RESEND_FROM_EMAIL yo‘q" });

    await resend.emails.send({
      from: `${appName} <${fromEmail}>`,
      to: normalizedEmail,
      subject: `${appName} tasdiqlash kodi`,
      text: `Sizning kirish kodingiz: ${otp}\nKod ${otpExpireMinutes} daqiqa amal qiladi.\nAgar siz so‘ramagan bo‘lsangiz, bu xabarni e’tiborsiz qoldiring.`,
    });

    return res.json({ message: "Kod yuborildi" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// =======================
// AUTH: VERIFY OTP
// =======================
app.post("/auth/email/verify-otp", otpVerifyLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: "Ma’lumot yetarli emas" });
    if (!isValidEmail(email)) return res.status(400).json({ message: "Email noto‘g‘ri" });

    const normalizedEmail = String(email).toLowerCase().trim();
    const otpDoc = await OtpCode.findOne({ email: normalizedEmail });
    if (!otpDoc) return res.status(400).json({ message: "Kod topilmadi" });

    const now = new Date();
    if (otpDoc.expiresAt < now) return res.status(400).json({ message: "Kod eskirgan" });

    if (otpDoc.attempts >= 5) return res.status(429).json({ message: "Ko‘p urinish" });

    const ok = await bcrypt.compare(String(code), otpDoc.otpHash);
    if (!ok) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      return res.status(400).json({ message: "Kod noto‘g‘ri" });
    }

    let user = await User.findOne({ email: normalizedEmail });
    if (!user) user = await User.create({ email: normalizedEmail });

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return res.status(500).json({ message: "JWT_SECRET yo‘q" });

    const token = jwt.sign({ userId: user._id.toString(), email: user.email }, jwtSecret, { expiresIn: "30d" });

    await OtpCode.deleteOne({ email: normalizedEmail });

    return res.json({
      message: "Login bo‘ldi",
      token,
      user: { id: user._id, email: user.email, name: user.name || "" },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// =======================
// ME (profil muammolarini hal qiladi)
// =======================
app.get("/api/me", userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("_id email name");
    if (!user) return res.status(404).json({ message: "User topilmadi" });
    return res.json({ user: { id: user._id, email: user.email, name: user.name || "" } });
  } catch (e) {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

app.patch("/api/me", userAuth, async (req, res) => {
  try {
    const { name } = req.body || {};
    const clean = String(name || "").trim().slice(0, 40);

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: { name: clean } },
      { new: true }
    ).select("_id email name");

    return res.json({ user: { id: user._id, email: user.email, name: user.name || "" } });
  } catch (e) {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// =======================
// IMAGE UPLOAD → CLOUDINARY
// =======================
app.post("/api/upload-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Rasm topilmadi" });

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: "molbozor", resource_type: "image" }, (error, result) => {
          if (error) return reject(error);
          resolve(result);
        })
        .end(req.file.buffer);
    });

    res.json({ url: uploadResult.secure_url });
  } catch (err) {
    console.error("❌ CLOUDINARY UPLOAD ERROR:", err);
    res.status(500).json({ error: "Image upload failed" });
  }
});

// =======================
// ELONS: LIST (pagination + search + filter)
// /api/elons?page=1&limit=20&category=...&region=...&district=...&q=...&minPrice=..&maxPrice=..
// =======================
app.get("/api/elons", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);
    const skip = (page - 1) * limit;

    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();
    const region = String(req.query.region || "").trim();
    const district = String(req.query.district || "").trim();

    const minPrice = req.query.minPrice != null ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice != null ? Number(req.query.maxPrice) : null;

    const filter = {};
    if (category) filter.category = category;
    if (region) filter.region = region;
    if (district) filter.district = district;

    if (minPrice != null || maxPrice != null) {
      filter.price = {};
      if (minPrice != null && !Number.isNaN(minPrice)) filter.price.$gte = minPrice;
      if (maxPrice != null && !Number.isNaN(maxPrice)) filter.price.$lte = maxPrice;
    }

    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      Elon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Elon.countDocuments(filter),
    ]);

    return res.json({ items, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (e) {
    return res.status(500).json({ error: "Failed to load elons" });
  }
});

// ELON DETAIL
app.get("/api/elons/:id", async (req, res) => {
  try {
    const elon = await Elon.findById(req.params.id);
    if (!elon) return res.status(404).json({ message: "E'lon topilmadi" });
    return res.json(elon);
  } catch (e) {
    return res.status(400).json({ message: "ID noto'g'ri" });
  }
});

// MY ELONS
app.get("/api/my/elons", userAuth, async (req, res) => {
  try {
    const items = await Elon.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(200);
    return res.json(items);
  } catch (e) {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// CREATE ELON (token required)
app.post("/api/elons", userAuth, async (req, res) => {
  try {
    const data = req.body || {};
    const userId = req.user.userId;

    if (!data.title || !data.price) {
      return res.status(400).json({ error: "title va price majburiy" });
    }

    const newElon = await Elon.create({
      userId,
      title: String(data.title).trim().slice(0, 80),
      price: Number(data.price),
      description: String(data.description || "").slice(0, 2000),
      phone: String(data.phone || "").slice(0, 30),
      region: String(data.region || "").slice(0, 60),
      district: String(data.district || "").slice(0, 60),
      category: String(data.category || "").slice(0, 60),
      gender: String(data.gender || "").slice(0, 30),
      purpose: String(data.purpose || "").slice(0, 30),
      unit: String(data.unit || "").slice(0, 20),
      quantity: Number(data.quantity || 0),
      images: Array.isArray(data.images) ? data.images.slice(0, 4) : [],
    });

    return res.status(201).json(newElon);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

// UPDATE ELON (owner only)
app.patch("/api/elons/:id", userAuth, async (req, res) => {
  try {
    const elon = await Elon.findById(req.params.id);
    if (!elon) return res.status(404).json({ message: "E'lon topilmadi" });

    if (String(elon.userId) !== String(req.user.userId)) {
      return res.status(403).json({ message: "Ruxsat yo'q (owner emas)" });
    }

    const data = req.body || {};
    const update = {};

    if (data.title != null) update.title = String(data.title).trim().slice(0, 80);
    if (data.price != null) update.price = Number(data.price);
    if (data.description != null) update.description = String(data.description || "").slice(0, 2000);
    if (data.phone != null) update.phone = String(data.phone || "").slice(0, 30);

    if (data.region != null) update.region = String(data.region || "").slice(0, 60);
    if (data.district != null) update.district = String(data.district || "").slice(0, 60);

    if (data.category != null) update.category = String(data.category || "").slice(0, 60);
    if (data.gender != null) update.gender = String(data.gender || "").slice(0, 30);
    if (data.purpose != null) update.purpose = String(data.purpose || "").slice(0, 30);
    if (data.unit != null) update.unit = String(data.unit || "").slice(0, 20);
    if (data.quantity != null) update.quantity = Number(data.quantity || 0);

    if (Array.isArray(data.images)) update.images = data.images.slice(0, 4);

    const updated = await Elon.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    return res.json(updated);
  } catch (e) {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// DELETE ELON (owner only)
app.delete("/api/elons/:id", userAuth, async (req, res) => {
  try {
    const elon = await Elon.findById(req.params.id);
    if (!elon) return res.status(404).json({ message: "E'lon topilmadi" });

    if (String(elon.userId) !== String(req.user.userId)) {
      return res.status(403).json({ message: "Ruxsat yo'q (owner emas)" });
    }

    await Elon.deleteOne({ _id: req.params.id });
    await SavedElon.deleteMany({ elonId: req.params.id });
    await Chat.deleteMany({ elonId: req.params.id });

    return res.json({ message: "O'chirildi" });
  } catch (e) {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// =======================
// SAVED ELONS (Favorites real)
// =======================
app.post("/api/saved/:elonId", userAuth, async (req, res) => {
  try {
    const { elonId } = req.params;
    await SavedElon.create({ userId: req.user.userId, elonId });
    return res.status(201).json({ message: "Saved" });
  } catch (e) {
    return res.json({ message: "Already saved" });
  }
});

app.delete("/api/saved/:elonId", userAuth, async (req, res) => {
  try {
    const { elonId } = req.params;
    await SavedElon.deleteOne({ userId: req.user.userId, elonId });
    return res.json({ message: "Unsaved" });
  } catch (e) {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

app.get("/api/saved", userAuth, async (req, res) => {
  try {
    const items = await SavedElon.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("elonId", "title price images region district category createdAt");

    return res.json(items.map((x) => x.elonId).filter(Boolean));
  } catch (e) {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// =======================
// CHAT (professional populate)
// =======================
app.post("/api/chats/start", userAuth, async (req, res) => {
  try {
    const buyerId = req.user.userId;
    const { elonId } = req.body || {};
    if (!elonId) return res.status(400).json({ message: "elonId kerak" });

    const elon = await Elon.findById(elonId);
    if (!elon) return res.status(404).json({ message: "E'lon topilmadi" });

    const sellerId = elon.userId;
    if (String(buyerId) === String(sellerId)) {
      return res.status(400).json({ message: "O'zingiz bilan chat qilib bo'lmaydi" });
    }

    let chat = await Chat.findOne({ elonId, buyerId, sellerId });
    if (!chat) {
      chat = await Chat.create({ elonId, buyerId, sellerId, lastMessage: "", lastMessageAt: null });
    }

    return res.json({ message: "Chat tayyor", chat });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

app.get("/api/chats", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const chats = await Chat.find({
      $or: [{ buyerId: userId }, { sellerId: userId }],
    })
      .sort({ updatedAt: -1 })
      .limit(100)
      .populate("elonId", "title price images createdAt")
      .populate("buyerId", "email name")
      .populate("sellerId", "email name");

    return res.json(chats);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

app.get("/api/chats/:id/messages", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const chatId = req.params.id;
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 100);

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: "Chat topilmadi" });

    if (String(chat.buyerId) !== String(userId) && String(chat.sellerId) !== String(userId)) {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }

    const messages = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("senderId", "email name");

    return res.json(messages.reverse());
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

app.post("/api/chats/:id/messages", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const chatId = req.params.id;
    const { text } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({ message: "Text bo'sh bo'lmasin" });
    }

    const cleanText = String(text).trim().slice(0, 1000);

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: "Chat topilmadi" });

    if (String(chat.buyerId) !== String(userId) && String(chat.sellerId) !== String(userId)) {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }

    const msg = await Message.create({ chatId, senderId: userId, text: cleanText });

    chat.lastMessage = msg.text;
    chat.lastMessageAt = new Date();
    await chat.save();

    const populated = await Message.findById(msg._id).populate("senderId", "email name");
    return res.status(201).json(populated);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// =======================
// STATISTICS
// =======================
app.post("/api/elons/:id/view", async (req, res) => {
  const elon = await Elon.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true });
  res.json(elon);
});

app.post("/api/elons/:id/favorite", async (req, res) => {
  const inc = req.body?.action === "remove" ? -1 : 1;
  const elon = await Elon.findByIdAndUpdate(req.params.id, { $inc: { favorites: inc } }, { new: true });
  res.json(elon);
});

app.post("/api/elons/:id/phone-click", async (req, res) => {
  const elon = await Elon.findByIdAndUpdate(req.params.id, { $inc: { phoneClicks: 1 } }, { new: true });
  res.json(elon);
});

app.post("/api/elons/:id/chat-click", async (req, res) => {
  const elon = await Elon.findByIdAndUpdate(req.params.id, { $inc: { chatClicks: 1 } }, { new: true });
  res.json(elon);
});

// =======================
// GLOBAL ERROR HANDLER
// =======================
app.use((err, req, res, next) => {
  console.error("❌ ERROR:", err.message);
  return res.status(500).json({ message: "Server error" });
});

// =======================
// START SERVER
// =======================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server ${PORT} portda ishlayapti`);
});
