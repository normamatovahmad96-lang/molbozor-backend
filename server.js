const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// ✅ EMAIL OTP uchun kerak
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Resend } = require("resend");

const app = express();

// =======================
// SECURITY MIDDLEWARES
// =======================
app.use(helmet());

// ⚠️ CORS: hozircha ochiq qoldiramiz (test uchun)
// Bozorga chiqishda admin panel domain va app domain bilan cheklanadi
app.use(cors());

app.use(express.json({ limit: "2mb" }));

// =======================
// RATE LIMIT (GLOBAL)
// =======================
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 daqiqa
  max: 120, // 1 daqiqada 120 request
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// =======================
// CONFIG
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

// =======================
// HELPERS
// =======================
function normalizeEmail(email) {
  return String(email || "").toLowerCase().trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// =======================
// AUTH MIDDLEWARE (USER)
// =======================
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

// =======================
// AUTH MIDDLEWARE (ADMIN)
// =======================
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
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

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
    favorites: { type: Number, default: 0 },
    phoneClicks: { type: Number, default: 0 },
    chatClicks: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ElonSchema.index({ title: "text", description: "text" });

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

// SAVED ELONS (Variant A)
const SavedElonSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    elonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Elon",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

SavedElonSchema.index({ userId: 1, elonId: 1 }, { unique: true });

const SavedElon = mongoose.model("SavedElon", SavedElonSchema);

// CHAT
const ChatSchema = new mongoose.Schema(
  {
    elonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Elon",
      required: true,
      index: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ChatSchema.index({ buyerId: 1, updatedAt: -1 });
ChatSchema.index({ sellerId: 1, updatedAt: -1 });
ChatSchema.index({ elonId: 1 });

const Chat = mongoose.model("Chat", ChatSchema);

// MESSAGE
const MessageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
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

// =======================
// HEALTH
// =======================
app.get("/health", (req, res) => {
  res.send("ok");
});

// =======================
// RATE LIMIT (OTP)
// =======================
const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// =======================
// ADMIN: LOGIN
// =======================
app.post("/api/admin/login", otpLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "Email va parol kerak" });
    }

    if (!isAdminEmail(email)) {
      return res.status(403).json({ message: "Admin emas" });
    }

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return res.status(500).json({ message: "ADMIN_PASSWORD yo‘q" });
    }

    if (String(password) !== String(adminPassword)) {
      return res.status(401).json({ message: "Parol noto‘g‘ri" });
    }

    const token = signAdminToken({
      role: "admin",
      email: normalizeEmail(email),
    });

    return res.json({
      message: "Admin login bo‘ldi",
      adminToken: token,
      admin: { email: normalizeEmail(email), role: "admin" },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

app.get("/api/admin/me", adminAuth, async (req, res) => {
  return res.json({
    admin: {
      email: req.admin.email,
      role: req.admin.role,
    },
  });
});

// =======================
// AUTH: SEND EMAIL OTP
// =======================
app.post("/api/auth/email/send-otp", otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "Email noto‘g‘ri" });
    }

    const normalizedEmail = normalizeEmail(email);
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

    // Rate limit: 60 sec
    if (otpDoc.lastSentAt && now - otpDoc.lastSentAt < 60 * 1000) {
      return res.status(429).json({ message: "1 daqiqa kuting" });
    }

    // Hourly limit: 3
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

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ message: "RESEND_API_KEY yo‘q" });
    }

    if (!fromEmail) {
      return res.status(500).json({ message: "RESEND_FROM_EMAIL yo‘q" });
    }

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
// AUTH: VERIFY EMAIL OTP
// =======================
app.post("/api/auth/email/verify-otp", otpLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "Ma’lumot yetarli emas" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Email noto‘g‘ri" });
    }

    const normalizedEmail = normalizeEmail(email);
    const otpDoc = await OtpCode.findOne({ email: normalizedEmail });

    if (!otpDoc) {
      return res.status(400).json({ message: "Kod topilmadi" });
    }

    const now = new Date();

    if (otpDoc.expiresAt < now) {
      return res.status(400).json({ message: "Kod eskirgan" });
    }

    if (otpDoc.attempts >= 5) {
      return res.status(429).json({ message: "Ko‘p urinish" });
    }

    const ok = await bcrypt.compare(String(code), otpDoc.otpHash);

    if (!ok) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      return res.status(400).json({ message: "Kod noto‘g‘ri" });
    }

    let user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      user = await User.create({ email: normalizedEmail });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ message: "JWT_SECRET yo‘q" });
    }

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      jwtSecret,
      { expiresIn: "30d" }
    );

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
// USER: ME (PROFILE)
// =======================
app.get("/api/me", userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("email name");
    if (!user) return res.status(404).json({ message: "User topilmadi" });

    return res.json({ user });
  } catch (e) {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// =======================
// ELONS: LIST (PAGINATION + SEARCH + FILTER)
// =======================
app.get("/api/elons", async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
    const skip = (page - 1) * limit;

    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();
    const region = String(req.query.region || "").trim();

    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;

    const filter = {};

    if (category) filter.category = category;
    if (region) filter.region = region;

    if (minPrice !== null || maxPrice !== null) {
      filter.price = {};
      if (minPrice !== null && !Number.isNaN(minPrice)) filter.price.$gte = minPrice;
      if (maxPrice !== null && !Number.isNaN(maxPrice)) filter.price.$lte = maxPrice;
    }

    if (q) {
      filter.$text = { $search: q };
    }

    const [items, total] = await Promise.all([
      Elon.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Elon.countDocuments(filter),
    ]);

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to load elons" });
  }
});

// =======================
// ELON: DETAIL
// =======================
app.get("/api/elons/:id", async (req, res) => {
  try {
    const elon = await Elon.findById(req.params.id);
    if (!elon) return res.status(404).json({ message: "E'lon topilmadi" });
    return res.json(elon);
  } catch {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// =======================
// ELON: CREATE (TOKEN SHART)
// =======================
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
      description: String(data.description || "").trim().slice(0, 2000),
      phone: String(data.phone || "").trim().slice(0, 30),

      region: String(data.region || "").trim().slice(0, 40),
      district: String(data.district || "").trim().slice(0, 40),

      category: String(data.category || "").trim().slice(0, 40),
      gender: String(data.gender || "").trim().slice(0, 20),
      purpose: String(data.purpose || "").trim().slice(0, 40),
      unit: String(data.unit || "").trim().slice(0, 20),
      quantity: Number(data.quantity || 0),

      images: Array.isArray(data.images) ? data.images.slice(0, 4) : [],
    });

    res.status(201).json(newElon);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// =======================
// ELON: UPDATE (FAQAT EGASI)
// =======================
app.put("/api/elons/:id", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const elon = await Elon.findById(req.params.id);
    if (!elon) return res.status(404).json({ message: "E'lon topilmadi" });

    if (String(elon.userId) !== String(userId)) {
      return res.status(403).json({ message: "Bu e'lon sizniki emas" });
    }

    const data = req.body || {};

    if (data.title !== undefined) elon.title = String(data.title).trim().slice(0, 80);
    if (data.price !== undefined) elon.price = Number(data.price);
    if (data.description !== undefined) elon.description = String(data.description || "").trim().slice(0, 2000);
    if (data.phone !== undefined) elon.phone = String(data.phone || "").trim().slice(0, 30);
    if (data.region !== undefined) elon.region = String(data.region || "").trim().slice(0, 40);
    if (data.district !== undefined) elon.district = String(data.district || "").trim().slice(0, 40);
    if (data.category !== undefined) elon.category = String(data.category || "").trim().slice(0, 40);
    if (data.gender !== undefined) elon.gender = String(data.gender || "").trim().slice(0, 20);
    if (data.purpose !== undefined) elon.purpose = String(data.purpose || "").trim().slice(0, 40);
    if (data.unit !== undefined) elon.unit = String(data.unit || "").trim().slice(0, 20);
    if (data.quantity !== undefined) elon.quantity = Number(data.quantity || 0);

    if (data.images !== undefined) {
      elon.images = Array.isArray(data.images) ? data.images.slice(0, 4) : [];
    }

    await elon.save();
    return res.json(elon);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// =======================
// ELON: DELETE (FAQAT EGASI)
// =======================
app.delete("/api/elons/:id", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const elon = await Elon.findById(req.params.id);
    if (!elon) return res.status(404).json({ message: "E'lon topilmadi" });

    if (String(elon.userId) !== String(userId)) {
      return res.status(403).json({ message: "Bu e'lon sizniki emas" });
    }

    await Elon.deleteOne({ _id: elon._id });

    // tozalash
    await Chat.deleteMany({ elonId: elon._id });
    await Message.deleteMany({ chatId: { $in: [] } });
    await SavedElon.deleteMany({ elonId: elon._id });

    return res.json({ message: "E'lon o'chirildi" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// =======================
// MY ELONS
// =======================
app.get("/api/my/elons", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const elons = await Elon.find({ userId }).sort({ createdAt: -1 }).limit(200);
    return res.json(elons);
  } catch {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// =======================
// SAVED ELONS (SAVE / UNSAVE / LIST)
// =======================
app.post("/api/saved/:elonId", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const elonId = req.params.elonId;

    const elon = await Elon.findById(elonId);
    if (!elon) return res.status(404).json({ message: "E'lon topilmadi" });

    const existing = await SavedElon.findOne({ userId, elonId });
    if (existing) {
      return res.json({ message: "Already saved" });
    }

    await SavedElon.create({ userId, elonId });
    await Elon.findByIdAndUpdate(elonId, { $inc: { favorites: 1 } });

    return res.json({ message: "Saved" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

app.delete("/api/saved/:elonId", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const elonId = req.params.elonId;

    const existing = await SavedElon.findOne({ userId, elonId });
    if (!existing) return res.json({ message: "Not saved" });

    await SavedElon.deleteOne({ _id: existing._id });
    await Elon.findByIdAndUpdate(elonId, { $inc: { favorites: -1 } });

    return res.json({ message: "Unsaved" });
  } catch {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

app.get("/api/saved", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const saved = await SavedElon.find({ userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("elonId");

    const items = saved.map((x) => x.elonId).filter(Boolean);
    return res.json(items);
  } catch {
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// ======================================================
// CHAT: START
// ======================================================
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
      chat = await Chat.create({
        elonId,
        buyerId,
        sellerId,
        lastMessage: "",
        lastMessageAt: null,
      });
    }

    return res.json({ message: "Chat tayyor", chat });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// CHAT LIST (POPULATE)
app.get("/api/chats", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const chats = await Chat.find({
      $or: [{ buyerId: userId }, { sellerId: userId }],
    })
      .sort({ updatedAt: -1 })
      .limit(100)
      .populate("elonId", "title price images")
      .populate("buyerId", "email name")
      .populate("sellerId", "email name");

    return res.json(chats);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// CHAT MESSAGES (POPULATE senderId)
app.get("/api/chats/:id/messages", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const chatId = req.params.id;

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: "Chat topilmadi" });

    if (
      String(chat.buyerId) !== String(userId) &&
      String(chat.sellerId) !== String(userId)
    ) {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }

    const messages = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("senderId", "email name");

    return res.json(messages.reverse());
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// SEND MESSAGE
app.post("/api/chats/:id/messages", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const chatId = req.params.id;
    const { text } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({ message: "Text bo'sh bo'lmasin" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: "Chat topilmadi" });

    if (
      String(chat.buyerId) !== String(userId) &&
      String(chat.sellerId) !== String(userId)
    ) {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }

    const msg = await Message.create({
      chatId,
      senderId: userId,
      text: String(text).trim().slice(0, 1000),
    });

    chat.lastMessage = msg.text;
    chat.lastMessageAt = new Date();
    await chat.save();

    return res.status(201).json(msg);
  } catch (e) {
    console.error(e);
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
        .upload_stream(
          { folder: "molbozor", resource_type: "image" },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        )
        .end(req.file.buffer);
    });

    res.json({ url: uploadResult.secure_url });
  } catch (err) {
    console.error("❌ CLOUDINARY UPLOAD ERROR:", err);
    res.status(500).json({ error: "Image upload failed" });
  }
});

// =======================
// STATISTICS
// =======================
app.post("/api/elons/:id/view", async (req, res) => {
  const elon = await Elon.findByIdAndUpdate(
    req.params.id,
    { $inc: { views: 1 } },
    { new: true }
  );
  res.json(elon);
});

app.post("/api/elons/:id/phone-click", async (req, res) => {
  const elon = await Elon.findByIdAndUpdate(
    req.params.id,
    { $inc: { phoneClicks: 1 } },
    { new: true }
  );
  res.json(elon);
});

app.post("/api/elons/:id/chat-click", async (req, res) => {
  const elon = await Elon.findByIdAndUpdate(
    req.params.id,
    { $inc: { chatClicks: 1 } },
    { new: true }
  );
  res.json(elon);
});

// =======================
// START SERVER
// =======================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server ${PORT} portda ishlayapti`);
});
