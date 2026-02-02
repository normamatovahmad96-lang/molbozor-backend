const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const ImageKit = require("imagekit"); // ✅ QO‘SHILDI

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
// IMAGEKIT INIT  ✅ YANGI
// =======================
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

// =======================
// SCHEMA & MODEL
// =======================
const ElonSchema = new mongoose.Schema(
  {
    // asosiy
    title: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    description: { type: String, default: "" },
    phone: { type: String, default: "" },

    // hudud
    region: { type: String, default: "" },
    district: { type: String, default: "" },

    // chorva tafsilotlari
    category: { type: String, default: "" },
    gender: { type: String, default: "" },
    purpose: { type: String, default: "" },
    unit: { type: String, default: "" },
    quantity: { type: Number, default: 0 },

    // rasmlar (1–4 ta)
    images: { type: [String], default: [] },

    // statistikalar
    views: { type: Number, default: 0 },
    favorites: { type: Number, default: 0 },
    phoneClicks: { type: Number, default: 0 },
    chatClicks: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Elon = mongoose.model("Elon", ElonSchema);

// =======================
// HEALTH
// =======================
app.get("/health", (req, res) => {
  res.send("ok");
});

// =======================
// IMAGEKIT AUTH  ✅ YANGI
// =======================
app.get("/api/imagekit/auth", (req, res) => {
  try {
    const authParams = imagekit.getAuthenticationParameters();
    res.json(authParams);
  } catch (err) {
    console.error("ImageKit auth error:", err);
    res.status(500).json({ error: "ImageKit auth failed" });
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
// POST ELON
// =======================
app.post("/api/elons", async (req, res) => {
  try {
    const data = req.body || {};

    if (!data.title || !data.price) {
      return res.status(400).json({ error: "title va price majburiy" });
    }

    const newElon = await Elon.create({
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
// START
// =======================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server ${PORT} portda ishlayapti`);
});
