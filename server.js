import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.send("Server running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Running on", PORT);
});
