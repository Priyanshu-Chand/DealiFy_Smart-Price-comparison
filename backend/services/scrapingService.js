const amazonScraper = require("../scrapers/amazonScraper");
const flipkartScraper = require("../scrapers/flipkartScraper");

const db = require("../config/db");
const { getCache, setCache } = require("./cacheService");

/**
 * Main function called by controller / worker
 */
async function scrapeAllPlatforms(query, productId) {
  try {
    if (!productId) {
      console.error("scrapeAllPlatforms called without productId");
      return [];
    }

    const cacheKey = `search:${query.toLowerCase()}`;

    // 1️⃣ Check Redis Cache
    const cached = await getCache(cacheKey);

    if (cached) {
      console.log("Returning cached results");
      return JSON.parse(cached);
    }

    console.log("Starting scraping for:", query);

    // 2️⃣ Run all platform scrapers in parallel
    const results = await Promise.allSettled([
      amazonScraper(query),
      flipkartScraper(query),
    ]);

    let products = [];

    // 3️⃣ Collect successful results
    results.forEach((result) => {
      if (result.status === "fulfilled" && Array.isArray(result.value)) {
        products.push(...result.value);
      }

      if (result.status === "rejected") {
        console.error("Scraper failed:", result.reason);
      }
    });

    // 4️⃣ Normalize scraped data
    const normalizedProducts = normalizeProducts(products);

    // 5️⃣ Save prices to DB
    await saveProducts(normalizedProducts, productId);

    // 6️⃣ Cache results
    await setCache(cacheKey, normalizedProducts);

    return normalizedProducts;
  } catch (error) {
    console.error("Scraping service error:", error);
    throw error;
  }
}

/**
 * Normalize scraped product format
 */
function normalizeProducts(products) {
  return products.map((p) => {
    return {
      title: p.title?.trim(),
      price: parsePrice(p.price),
      product_url: p.link || null,
      image_url: p.image || null,
      platform: p.platform,
    };
  });
}

/**
 * Convert price string → number
 */
function parsePrice(price) {
  if (!price) return null;

  const numeric = price.replace(/[^0-9]/g, "");
  return Number(numeric);
}

/**
 * Save scraped prices into MySQL
 */
async function saveProducts(products, productId) {
  try {
    if (!productId) {
      console.error("saveProducts called without productId");
      return;
    }

    // Get platform ids once (optimization)
    const [platformRows] = await db.query(
      "SELECT platform_id, LOWER(platform_name) AS name FROM platforms",
    );

    const platformMap = {};

    platformRows.forEach((p) => {
      platformMap[p.name] = p.platform_id;
    });

    for (const product of products) {
      const platform = product.platform.toLowerCase();
      const platformId = platformMap[platform];

      if (!platformId) continue;

      await db.query(
        `
        INSERT INTO product_prices
        (product_id, platform_id, price, product_url, last_updated)
        VALUES (?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
        price = VALUES(price),
        last_updated = NOW()
        `,
        [productId, platformId, product.price, product.product_url],
      );
    }
  } catch (error) {
    console.error("Database insert error:", error);
  }
}

module.exports = {
  scrapeAllPlatforms,
};
