const amazonScraper = require("../scrapers/amazonScraper");
const flipkartScraper = require("../scrapers/flipkartScraper");
const ebayScraper = require("../scrapers/ebayScraper");
const snapdealScraper = require("../scrapers/snapdealScraper");
const Product = require("../models/mongo/Product");
const redis = require("../config/redis");

const CATEGORY_MAP = {
  headphones: ["headphone", "earbud", "earphone", "headset", "airpod"],
  bluetooth_speaker: ["bluetooth speaker", "speaker"],
  smartwatch: ["smartwatch", "watch"],
  mobile: ["phone", "mobile", "smartphone"],
  laptop: ["laptop", "notebook", "chromebook", "macbook"],
  mobile_accessories: [
    "charger",
    "case",
    "cover",
    "screen protector",
    "power bank",
    "cable",
    "adapter",
  ],
  laptop_accessories: ["mouse", "keyboard", "stand", "cooling"],
};

function isEnabled(value, defaultValue = true) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === "true";
}

function normalizeQuery(query) {
  return String(query || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createNormalizedKey(title) {
  return normalizeTitle(title).split(" ").slice(0, 12).join(" ");
}

function detectCategory(text) {
  const q = String(text || "").toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
    for (const keyword of keywords) {
      const k = keyword.toLowerCase();
      if (q.includes(k) || q.includes(`${k}s`) || q.includes(k.replace(/s$/, ""))) {
        return category;
      }
    }
  }

  return "other";
}

function parsePrice(price) {
  if (price === null || price === undefined) return null;

  const numeric = String(price).replace(/[^\d.]/g, "");
  const value = Number(numeric);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseRating(value) {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const numeric = Number(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  // eBay style values can come as percentage (e.g. 97.3%).
  if (numeric > 5 && numeric <= 100) {
    return Number((numeric / 20).toFixed(1));
  }

  // Guard against invalid values like 500 etc.
  if (numeric > 5) return null;
  return Number(numeric.toFixed(1));
}

async function runSource(name, fn, query, timeoutMs) {
  const startedAt = Date.now();
  try {
    const result = await Promise.race([
      fn(query),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${name} timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);

    const items = Array.isArray(result) ? result : [];
    console.log(`[source:${name}] fetched ${items.length} items in ${Date.now() - startedAt}ms`);
    return items;
  } catch (error) {
    console.warn(`[source:${name}] failed: ${error.message}`);
    return [];
  }
}

function normalizeListing(item) {
  const title = item?.title?.trim();
  const platform = String(item?.platform || "").toLowerCase().trim();
  const price = parsePrice(item?.price);
  const resolvedLink =
    item?.link ||
    item?.product_url ||
    item?.url ||
    item?.buy_link ||
    item?.product_link ||
    item?.itemWebUrl ||
    item?.item_web_url ||
    null;

  if (!title || !platform || !price) {
    return null;
  }

  return {
    normalized_key: createNormalizedKey(title),
    title,
    platform,
    price,
    link: resolvedLink,
    image: item.image || null,
    brand: item.brand || title.split(" ")[0] || "UNKNOWN",
    rating: parseRating(item.rating),
    specs: item.specs || {},
    category: detectCategory(title),
  };
}

function formatResultsFromDocs(docs) {
  return docs
    .map((doc) => {
      const prices = (doc.platforms || [])
        .map((platformItem) => ({
          platform: platformItem.platform_name,
          price: platformItem.price,
        }))
        .sort((a, b) => a.price - b.price);

      const best = prices[0] || null;

      return {
        product_id: String(doc._id),
        product_name: doc.product_name,
        brand: doc.brand,
        image_url: doc.platforms?.[0]?.image_url || null,
        specs: doc.specs || {},
        prices,
        best_price: best ? best.price : null,
        best_platform: best ? best.platform : null,
      };
    })
    .sort((a, b) => {
      if (a.best_price === null) return 1;
      if (b.best_price === null) return -1;
      return a.best_price - b.best_price;
    });
}

function formatResultsFromListings(listings) {
  const grouped = new Map();

  for (const listing of listings) {
    if (!grouped.has(listing.normalized_key)) {
      grouped.set(listing.normalized_key, {
        product_id: `live:${listing.normalized_key}`,
        product_name: listing.title,
        brand: listing.brand,
        image_url: listing.image || null,
        specs: listing.specs || {},
        prices: [],
      });
    }

    const product = grouped.get(listing.normalized_key);
    const existingPrice = product.prices.find((p) => p.platform === listing.platform);
    if (!existingPrice) {
      product.prices.push({
        platform: listing.platform,
        price: listing.price,
      });
    } else if (Number(listing.price) < Number(existingPrice.price)) {
      existingPrice.price = listing.price;
    }
  }

  return Array.from(grouped.values())
    .map((item) => {
      item.prices.sort((a, b) => a.price - b.price);
      const best = item.prices[0] || null;
      return {
        ...item,
        best_price: best ? best.price : null,
        best_platform: best ? best.platform : null,
      };
    })
    .sort((a, b) => {
      if (a.best_price === null) return 1;
      if (b.best_price === null) return -1;
      return a.best_price - b.best_price;
    });
}

function getEnabledSources(baseTimeoutMs) {
  const sources = [];

  if (isEnabled(process.env.ENABLE_AMAZON_SOURCE, true)) {
    sources.push({
      name: "amazon_api",
      fn: amazonScraper,
      timeoutMs: Number(process.env.AMAZON_TIMEOUT_MS || Math.max(baseTimeoutMs, 12000)),
    });
  }

  if (isEnabled(process.env.ENABLE_FLIPKART_SOURCE, true)) {
    sources.push({
      name: "flipkart_api",
      fn: flipkartScraper,
      timeoutMs: Number(process.env.FLIPKART_TIMEOUT_MS || Math.max(baseTimeoutMs, 15000)),
    });
  }

  if (isEnabled(process.env.ENABLE_EBAY_SOURCE, true)) {
    sources.push({
      name: "ebay_api",
      fn: ebayScraper,
      timeoutMs: Number(process.env.EBAY_TIMEOUT_MS || Math.max(baseTimeoutMs, 15000)),
    });
  }

  // Only Snapdeal uses scraping.
  if (isEnabled(process.env.ENABLE_SNAPDEAL_SOURCE, true)) {
    sources.push({
      name: "snapdeal_scrape",
      fn: snapdealScraper,
      timeoutMs: Number(process.env.SNAPDEAL_TIMEOUT_MS || baseTimeoutMs),
    });
  }

  return sources;
}

function dedupeListings(normalizedListings) {
  const deduped = new Map();
  for (const listing of normalizedListings) {
    const key = `${listing.normalized_key}__${listing.platform}`;
    const existing = deduped.get(key);

    if (!existing || listing.price < existing.price) {
      deduped.set(key, listing);
    }
  }

  return Array.from(deduped.values());
}

async function fetchLiveListings(query) {
  const baseTimeoutMs = Number(process.env.SOURCE_TIMEOUT_MS || process.env.REQUEST_TIMEOUT_MS || 12000);
  const sources = getEnabledSources(baseTimeoutMs);

  if (!sources.length) {
    throw new Error("No sources are enabled. Check ENABLE_*_SOURCE env flags.");
  }

  const sourceResults = await Promise.all(
    sources.map((source) => runSource(source.name, source.fn, query, source.timeoutMs)),
  );
  const fetched = sourceResults.flat();
  const normalizedListings = fetched.map(normalizeListing).filter(Boolean);

  return dedupeListings(normalizedListings);
}

async function upsertListing(normalizedListing, normalizedQuery) {
  const existing = await Product.findOne({
    normalized_key: normalizedListing.normalized_key,
  });

  const platformPayload = {
    platform_name: normalizedListing.platform,
    price: normalizedListing.price,
    source: normalizedListing.specs?.source || null,
    specs: normalizedListing.specs || {},
    product_url: normalizedListing.link,
    image_url: normalizedListing.image,
    rating: normalizedListing.rating,
    last_updated: new Date(),
    price_history: [{ ts: new Date(), price: normalizedListing.price }],
  };

  if (!existing) {
    const created = await Product.create({
      normalized_key: normalizedListing.normalized_key,
      product_name: normalizedListing.title,
      brand: normalizedListing.brand,
      category: normalizedListing.category,
      specs: normalizedListing.specs,
      search_terms: [normalizedQuery],
      platforms: [platformPayload],
    });

    return created;
  }

  const searchTerms = new Set((existing.search_terms || []).map((term) => normalizeQuery(term)));
  searchTerms.add(normalizedQuery);

  existing.search_terms = Array.from(searchTerms);
  existing.brand = existing.brand || normalizedListing.brand;
  existing.category = existing.category || normalizedListing.category;
  existing.specs = {
    ...(existing.specs || {}),
    ...(normalizedListing.specs || {}),
  };

  const platformIndex = existing.platforms.findIndex(
    (item) => item.platform_name === normalizedListing.platform,
  );

  if (platformIndex === -1) {
    existing.platforms.push(platformPayload);
  } else {
    const current = existing.platforms[platformIndex];
    const oldPrice = Number(current.price);
    const newPrice = Number(normalizedListing.price);
    const priceChanged =
      Number.isFinite(oldPrice) && Number.isFinite(newPrice)
        ? oldPrice !== newPrice
        : true;

    const history = Array.isArray(current.price_history) ? current.price_history.slice(-39) : [];
    if (priceChanged) {
      history.push({ ts: new Date(), price: normalizedListing.price });
    }

    existing.platforms[platformIndex] = {
      ...current,
      ...platformPayload,
      // Update only when price changed; otherwise keep existing value.
      price: priceChanged ? normalizedListing.price : current.price,
      price_history: history,
    };
  }

  await existing.save();
  return existing;
}

async function persistListings(listings, query) {
  const normalizedQuery = normalizeQuery(query);
  const touchedIds = new Set();

  for (const listing of listings) {
    const saved = await upsertListing(listing, normalizedQuery);
    touchedIds.add(String(saved._id));
  }

  const storedProducts = await Product.find({ _id: { $in: Array.from(touchedIds) } })
    .sort({ created_at: -1 })
    .lean();

  const formatted = formatResultsFromDocs(storedProducts);
  await redis.set(`search:${normalizedQuery}`, JSON.stringify(formatted), "EX", 3600);

  return {
    query: normalizedQuery,
    insertedOrUpdated: storedProducts.length,
  };
}

const scrapeAndStoreProduct = async (query) => {
  console.log("Scraping started:", query);
  const normalizedListings = await fetchLiveListings(query);

  if (!normalizedListings.length) {
    throw new Error("No products found from enabled sources");
  }
  const result = await persistListings(normalizedListings, query);

  console.log(`Scraping completed: saved ${result.insertedOrUpdated} products for '${query}'`);

  return result;
};

module.exports = {
  scrapeAndStoreProduct,
  fetchLiveListings,
  formatResultsFromListings,
  persistListings,
};
