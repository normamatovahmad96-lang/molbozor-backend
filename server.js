const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

// ✅ EMAIL OTP uchun kerak
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Resend } = require("resend");

const app = express();
app.use(cors());
app.use(express.json());

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
// CLOUDINARY INIT ✅
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

// ELON (seller userId qo‘shildi)
const ElonSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    description: { type: String, default: "" },
    phone: { type: String, default: "" },

    region: { type: String, default: "" },
    district: { type: String, default: "" },

    category: { type: String, default: "" },
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

// CHAT
const ChatSchema = new mongoose.Schema(
  {
    elonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Elon",
      required: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =======================
// HEALTH
// =======================
app.get("/health", (req, res) => {
  res.send("ok");
});

// =======================
// ADMIN: LOGIN
// =======================
app.post("/admin/login", async (req, res) => {
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

app.get("/admin/me", adminAuth, async (req, res) => {
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
app.post("/auth/email/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: "Email noto‘g‘ri" });
    }

    const normalizedEmail = email.toLowerCase().trim();
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

    if (otpDoc.lastSentAt && now - otpDoc.lastSentAt < 60 * 1000) {
      return res.status(429).json({ message: "1 daqiqa kuting" });
    }

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
app.post("/auth/email/verify-otp", async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "Ma’lumot yetarli emas" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Email noto‘g‘ri" });
    }

    const normalizedEmail = email.toLowerCase().trim();
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

// CHAT LIST
app.get("/api/chats", userAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const chats = await Chat.find({
      $or: [{ buyerId: userId }, { sellerId: userId }],
    })
      .sort({ updatedAt: -1 })
      .limit(100);

    return res.json(chats);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server xatosi" });
  }
});

// CHAT MESSAGES
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
      .limit(50);

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
// IMAGE UPLOAD → CLOUDINARY ⭐
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
// GET ELONS
// =======================
app.get("/api/elons", async (req, res) => {
  try {
    const elons = await Elon.find().sort({ createdAt: -1 });
    res.json(elons);
  } catch {
    res.status(500).json({ error: "Failed to load elons" });
  }
});

// =======================
// POST ELON (TOKEN SHART) ⭐
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

      title: data.title,
      price: Number(data.price),
      description: data.description || "",
      phone: data.phone || "",
      region: data.region || "",
      district: data.district || "",
      category: data.category || "",
      gender: data.gender || "",
      purpose: data.purpose || "",
      unit: data.unit || "",
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

app.post("/api/elons/:id/favorite", async (req, res) => {
  const inc = req.body?.action === "remove" ? -1 : 1;
  const elon = await Elon.findByIdAndUpdate(
    req.params.id,
    { $inc: { favorites: inc } },
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
