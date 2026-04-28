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

const allowedOrigins = String(process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = origin.trim().replace(/\/$/, "");
  if (allowedOrigins.length === 0) return true;
  if (allowedOrigins.includes(normalized)) return true;
  if (/^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(normalized)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) return true;
  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);
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
