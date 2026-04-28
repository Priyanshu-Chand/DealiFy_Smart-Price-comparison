const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const searchRoutes = require("./routes/searchRoutes");
const cartRoutes = require("./routes/cartRoutes");
const compareRoutes = require("./routes/compareRoutes");
const { connectDB } = require("./config/db");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = express();

app.use(cors());
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

async function startServer() {
  try {
    await connectDB();
    const runInlineWorker = String(process.env.ENABLE_INLINE_WORKER || "true").toLowerCase() === "true";
    if (runInlineWorker) {
      require("./workers/scrapeWorker");
      console.log("Inline scrape worker started");
    }

    app.listen(port, () => {
      console.log(`server is running on port- ${port}`);
      console.log(`open server-: http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();
