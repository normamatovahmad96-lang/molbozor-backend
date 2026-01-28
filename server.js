const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL;

console.log("PORT:", PORT);

// =======================
// MONGODB CONNECT
// =======================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// =======================
// SCHEMA & MODEL
// =======================
const ElonSchema = new mongoose.Schema(
  {
    title: String,
    price: Number,
    description: String,
    phone: String,
  },
  { timestamps: true }
);

const Elon = mongoose.model("Elon", ElonSchema);

// =======================
// HEALTH & TEST
// =======================
app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

// =======================
// GET ELONS
// =======================
app.get("/api/elons", async (req, res) => {
  const elons = await Elon.find().sort({ createdAt: -1 });
  res.json(elons);
});

// =======================
// POST ELON
// =======================
app.post("/api/elons", async (req, res) => {
  try {
    const newElon = await Elon.create(req.body);
    res.status(201).json(newElon);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// =======================
// START SERVER
// =======================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] started on port ${PORT}`);
});
