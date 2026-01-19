const express = require("express");

const app = express();

app.use(express.json());
const ADMINS = ["971802104"];
const PORT = process.env.PORT || 3000;
console.log("PORT:", PORT);
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
// Fake in-memory listings (vaqtincha test uchun)
let listings = [];

// GET /listings va /api/listings
app.get(["/listings", "/api/listings"], (req, res) => {
  res.json(listings);
});

// POST /listings va /api/listings
app.post(["/listings", "/api/listings"], (req, res) => {
  const newListing = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date().toISOString(),
  };
  listings.unshift(newListing);
  res.status(201).json(newListing);
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] started on port ${PORT}`);
});
