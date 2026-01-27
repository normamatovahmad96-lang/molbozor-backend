const express = require("express");

const app = express();

app.use(express.json());

const ADMINS = ["971802104"];
const PORT = process.env.PORT || 3000;

console.log("PORT:", PORT);

// =======================
// HEALTH & TEST
// =======================
app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

app.get("/api/test", (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Molbozor backend is working",
    timestamp: new Date().toISOString(),
  });
});

// =======================
// FAKE IN-MEMORY LISTINGS
// (vaqtincha test uchun)
// =======================
let listings = [];

// =======================
// GET LISTINGS
// =======================

// /listings
// /api/listings
// /api/elons   ✅ FRONTEND SHUNI CHAQIRADI
app.get(
  ["/listings", "/api/listings", "/api/elons"],
  (req, res) => {
    res.json(listings);
  }
);

// =======================
// POST LISTINGS
// =======================

// /listings
// /api/listings
// /api/elons   ✅ FRONTEND SHU YERGA YOZADI
app.post(
  ["/listings", "/api/listings", "/api/elons"],
  (req, res) => {
    const newListing = {
      id: Date.now().toString(),
      ...req.body,
      createdAt: new Date().toISOString(),
    };

    listings.unshift(newListing);
    res.status(201).json(newListing);
  }
);

// =======================
// START SERVER
// =======================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] started on port ${PORT}`);
});
