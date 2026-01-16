const express = require("express");

const app = express();

app.use(express.json());

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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] started on port ${PORT}`);
});
