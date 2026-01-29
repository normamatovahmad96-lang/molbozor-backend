const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

console.log("PORT:", PORT);

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing (Render Environment Variables)");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB error:", err);
    process.exit(1);
  });

const ElonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, default: "" },
    phone: { type: String, default: "" },
  },
  { timestamps: true }
);

const Elon = mongoose.model("Elon", ElonSchema);

app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

app.get("/api/elons", async (req, res) => {
  try {
    const elons = await Elon.find().sort({ createdAt: -1 });
    res.status(200).json(elons);
  } catch (err) {
    res.status(500).json({ error: "Failed to load elons" });
  }
});

app.post("/api/elons", async (req, res) => {
  try {
    const newElon = await Elon.create(req.body);
    res.status(201).json(newElon);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] started on port ${PORT}`);
});
