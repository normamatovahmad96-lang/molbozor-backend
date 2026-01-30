const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

// kerak bo'lsa keyin CORS ni cheklab qo'yamiz, hozir ochiq
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Render -> Environment Variables ichida aynan shu nom bilan bo‘lishi shart:
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing. Add it in Render -> Environment Variables.");
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
// SCHEMA & MODEL
// =======================
// ✅ Qo'shildi: region, image + statistikalar
const ElonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    price: { type: Number, required: true },

    description: { type: String, default: "" },
    phone: { type: String, default: "" },

    // 🔥 Frontend uchun
    region: { type: String, default: "" },
    image: { type: String, default: "" }, // hozircha 1 ta rasm url

    // 🔥 Statistikalar
    views: { type: Number, default: 0 }, // elon ko'rildi
    favorites: { type: Number, default: 0 }, // sevimlilar soni
    phoneClicks: { type: Number, default: 0 }, // telefon bosildi
    chatClicks: { type: Number, default: 0 }, // chat bosildi
  },
  { timestamps: true }
);

const Elon = mongoose.model("Elon", ElonSchema);

// =======================
// HEALTH
// =======================
app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

// =======================
// GET ELONS
// =======================
app.get("/api/elons", async (req, res) => {
  try {
    const elons = await Elon.find().sort({ createdAt: -1 });
    res.json(elons);
  } catch (err) {
    res.status(500).json({ error: "Failed to load elons" });
  }
});

// =======================
// POST ELON
// =======================
app.post("/api/elons", async (req, res) => {
  try {
    const {
      title,
      price,
      description = "",
      phone = "",
      region = "",
      image = "",
    } = req.body || {};

    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "title is required" });
    }
    const numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      return res.status(400).json({ error: "price must be a valid number" });
    }

    const newElon = await Elon.create({
      title: title.trim(),
      price: numPrice,
      description: typeof description === "string" ? description : "",
      phone: typeof phone === "string" ? phone : "",
      region: typeof region === "string" ? region : "",
      image: typeof image === "string" ? image : "",
    });

    res.status(201).json(newElon);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// =======================
// STATISTICS ENDPOINTS (bosilganda +1 qiladi)
// =======================

// elon ko'rildi
app.post("/api/elons/:id/view", async (req, res) => {
  try {
    const updated = await Elon.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Elon not found" });
    res.json({ ok: true, views: updated.views });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// sevimlilar (+1 yoki -1)
app.post("/api/elons/:id/favorite", async (req, res) => {
  try {
    // body: { action: "add" } yoki { action: "remove" }
    const action = req.body?.action;
    const inc = action === "remove" ? -1 : 1;

    const updated = await Elon.findByIdAndUpdate(
      req.params.id,
      { $inc: { favorites: inc } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Elon not found" });

    // minus bo'lib ketmasin
    if (updated.favorites < 0) {
      updated.favorites = 0;
      await updated.save();
    }

    res.json({ ok: true, favorites: updated.favorites });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// telefon bosildi
app.post("/api/elons/:id/phone-click", async (req, res) => {
  try {
    const updated = await Elon.findByIdAndUpdate(
      req.params.id,
      { $inc: { phoneClicks: 1 } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Elon not found" });
    res.json({ ok: true, phoneClicks: updated.phoneClicks });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// chat bosildi
app.post("/api/elons/:id/chat-click", async (req, res) => {
  try {
    const updated = await Elon.findByIdAndUpdate(
      req.params.id,
      { $inc: { chatClicks: 1 } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Elon not found" });
    res.json({ ok: true, chatClicks: updated.chatClicks });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// =======================
// START SERVER
// =======================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] started on port ${PORT}`);
});
