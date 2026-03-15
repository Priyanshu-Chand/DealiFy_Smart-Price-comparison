const express = require("express");
const db = require("./config/db");
const dotenv = require("dotenv");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const searchRoutes = require("./routes/searchRoutes");
const cartRoutes = require("./routes/cartRoutes");
const scrapeProduct = require("./services/scrapingService");
const compareRoutes = require("./routes/compareRoutes");




dotenv.config();

const app = express();

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api", productRoutes);
app.use("/api", searchRoutes);
app.use("/api", cartRoutes);
app.use("/api/compare", compareRoutes);


app.get("/", (req, res) => {
  res.send("DealiFy API Is Running");
});

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log("server is running on port- " + port);
  console.log("open server-: " + "http://localhost:" + port);
});


app.get("/api/scrape", async (req, res) => {
  const product = req.query.q;

  const results = await scrapeProduct(product);

  res.json(results);
});


const initBrowserPool = require("./services/browserPool");

async function startServer() {
  await initBrowserPool();

  app.listen(5000, () => {
    console.log("Server running");
  });
}

startServer();
