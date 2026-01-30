const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

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
const ElonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    price: { type: Number, required: true },
    description: String,
    phone: String,
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
    const newElon = await Elon.create(req.body);
    res.status(201).json(newElon);
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
