const redis = require("../config/redis");
const scrapeQueue = require("../queues/scrapeQueue");
const scrapingService = require("../services/scrapingService");

const { searchProducts, logSearch } = require("../models/searchModel");

function isTransientDbError(error) {
  const text = String(error?.message || "").toLowerCase();
  return (
    text.includes("econnreset") ||
    text.includes("mongonetworkerror") ||
    text.includes("connection pool") ||
    text.includes("server selection timed out") ||
    text.includes("topology is closed")
  );
}

function formatResults(rows) {
  const map = {};

  rows.forEach((row) => {
    if (!map[row.product_id]) {
      map[row.product_id] = {
        product_id: row.product_id,
        product_name: row.product_name,
        brand: row.brand,
        image_url: row.image_url,
        prices: [],
      };
    }

    map[row.product_id].prices.push({
      platform: row.platform_name,
      price: row.price,
    });
  });

  return Object.values(map).map((product) => {
    const prices = product.prices.map((p) => p.price);
    const bestPrice = Math.min(...prices);

    const bestPlatform = product.prices.find((p) => p.price === bestPrice)?.platform;

    return {
      ...product,
      best_price: bestPrice,
      best_platform: bestPlatform,
    };
  });
}

const normalizeQuery = (query) => query.toLowerCase().replace(/\s+/g, " ").trim();

const search = async (req, res) => {
  try {
    let query = req.query.q;

    if (!query) {
      return res.status(400).json({ message: "Search query required" });
    }

    query = normalizeQuery(query);
    const cacheKey = `search:${query}`;
    let liveListings = [];
    let persistedLive = false;

    try {
      liveListings = await scrapingService.fetchLiveListings(query);
      if (liveListings.length > 0) {
        await scrapingService.persistListings(liveListings, query);
        persistedLive = true;
      }
    } catch (liveErr) {
      console.warn("Live source fetch failed; proceeding with DB results:", liveErr.message);
    }

    const [dbRows] = await searchProducts(query);
    const dbResults = formatResults(dbRows);
    await logSearch(null, query, dbResults.length);

    if (dbResults.length > 0) {
      await redis.set(cacheKey, JSON.stringify(dbResults), "EX", 3600);

      return res.json({
        source: persistedLive ? "live_persisted_plus_db" : "db_only",
        query,
        results: dbResults,
      });
    }

    const existingJob = await scrapeQueue.getJob(query);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === "completed" || state === "failed") {
        await existingJob.remove();
      }
    }

    const jobAfterCleanup = await scrapeQueue.getJob(query);
    if (!jobAfterCleanup) {
      await scrapeQueue.add(
        "scrape-product",
        { query },
        {
          jobId: query,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } else {
      console.log("Scraping already in progress...");
    }

    return res.json({
      status: "scraping_started",
      message: "Fetching latest product data...",
      query,
    });
  } catch (error) {
    console.error(error);
    if (isTransientDbError(error)) {
      return res.status(503).json({
        error: "Temporary database connectivity issue. Please retry in a few seconds.",
      });
    }
    return res.status(500).json({ error: "Something went wrong while searching. Please try again." });
  }
};

module.exports = { search };
