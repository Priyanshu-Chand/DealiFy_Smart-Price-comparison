const {
  getAllProducts,
  getProductById,
} = require("../models/productModel");
const Product = require("../models/mongo/Product");
const scrapingService = require("../services/scrapingService");

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function normalizeQueryTerm(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

const ACCESSORY_KEYWORDS = new Set([
  "cover",
  "case",
  "guard",
  "protector",
  "screen",
  "tempered",
  "glass",
  "charger",
  "cable",
  "adapter",
  "backcover",
  "back",
  "skin",
  "pouch",
  "temperedglass",
  "accessory",
  "accessories",
  "strap",
  "band",
  "mount",
  "holder",
  "tripod",
  "stand",
  "headset",
  "earbuds",
  "earphones",
  "buds",
  "watch",
  "smartwatch",
  "powerbank",
]);

const PARTS_KEYWORDS = new Set([
  "board",
  "motherboard",
  "pcb",
  "flex",
  "connector",
  "port",
  "chargingport",
  "dock",
  "mic",
  "microphone",
  "speaker",
  "buzzer",
  "replacement",
  "replace",
  "spare",
  "part",
  "parts",
  "lcd",
  "displaycombo",
  "touch",
  "digitizer",
  "module",
  "assembly",
  "ribbon",
  "ic",
  "chip",
]);

const MAIN_DEVICE_KEYWORDS = new Set([
  "phone",
  "mobile",
  "smartphone",
  "iphone",
  "laptop",
  "notebook",
  "macbook",
  "tablet",
  "watch",
  "smartwatch",
  "earbuds",
  "earphones",
  "headphones",
]);

function isAccessoryLike(text) {
  const tokens = tokenize(text);
  return tokens.some((token) => ACCESSORY_KEYWORDS.has(token));
}

function isPartsLike(text) {
  const tokens = tokenize(text);
  const hasPartSignal = tokens.some((token) => PARTS_KEYWORDS.has(token));
  if (!hasPartSignal) return false;

  const hasMainDeviceSignal = tokens.some((token) => MAIN_DEVICE_KEYWORDS.has(token));
  // If listing looks like only a component/spare and lacks device intent, treat as irrelevant.
  return !hasMainDeviceSignal || tokens.length <= 5;
}

function isAccessoryMismatch(baseDoc, candidateDoc) {
  const baseCategory = String(baseDoc?.category || "").toLowerCase().trim();
  const candidateCategory = String(candidateDoc?.category || "").toLowerCase().trim();

  const baseLooksAccessory = baseCategory.includes("accessories") || isAccessoryLike(baseDoc?.product_name);
  const candidateLooksAccessory =
    candidateCategory.includes("accessories") ||
    isAccessoryLike(candidateDoc?.product_name) ||
    isPartsLike(candidateDoc?.product_name);

  // If base product is a main product and candidate looks like accessory, skip it.
  return !baseLooksAccessory && candidateLooksAccessory;
}

function getSearchTermOverlap(baseDoc, candidateDoc) {
  const baseTerms = new Set(
    (Array.isArray(baseDoc?.search_terms) ? baseDoc.search_terms : [])
      .map((term) => normalizeQueryTerm(term))
      .filter(Boolean),
  );
  const candidateTerms = new Set(
    (Array.isArray(candidateDoc?.search_terms) ? candidateDoc.search_terms : [])
      .map((term) => normalizeQueryTerm(term))
      .filter(Boolean),
  );

  let overlap = 0;
  for (const term of candidateTerms) {
    if (baseTerms.has(term)) overlap += 1;
  }
  return overlap;
}

function isStronglyRelevant(baseDoc, candidateDoc, score) {
  const baseBrand = String(baseDoc?.brand || "").toLowerCase().trim();
  const candidateBrand = String(candidateDoc?.brand || "").toLowerCase().trim();
  const sameBrand = Boolean(baseBrand && candidateBrand && baseBrand === candidateBrand);
  const sameCategory =
    String(baseDoc?.category || "").toLowerCase().trim() &&
    String(baseDoc?.category || "").toLowerCase().trim() === String(candidateDoc?.category || "").toLowerCase().trim();
  const exactKeyMatch = candidateDoc?.normalized_key === baseDoc?.normalized_key;
  const searchTermOverlap = getSearchTermOverlap(baseDoc, candidateDoc);

  if (exactKeyMatch) return true;
  if (isAccessoryMismatch(baseDoc, candidateDoc)) return false;

  // If products came from same search intent/query, allow moderate token mismatch.
  if (searchTermOverlap > 0) {
    if (sameCategory) return score >= 1;
    if (sameBrand) return score >= 1;
    return score >= 2;
  }

  // Brand-aligned products can pass with moderate overlap; otherwise require stricter overlap.
  if (sameBrand) return score >= 2;
  return score >= 3;
}

function overlapScore(baseTokens, candidateTokens) {
  const base = new Set(baseTokens);
  let score = 0;
  for (const token of candidateTokens) {
    if (base.has(token)) score += 1;
  }
  return score;
}

function buildRefreshQueries(baseDoc) {
  const queries = new Set();
  const name = String(baseDoc?.product_name || "").trim();
  const brand = String(baseDoc?.brand || "").trim();
  const searchTerms = Array.isArray(baseDoc?.search_terms) ? baseDoc.search_terms : [];

  if (name) queries.add(name);
  searchTerms.slice(0, 3).forEach((term) => term && queries.add(String(term)));

  const tokens = tokenize(name);
  const stop = new Set(["with", "and", "for", "the", "inch", "inches", "gb", "tb", "ram", "ssd"]);
  const coreTokens = tokens.filter((t) => !stop.has(t)).slice(0, 5);
  if (coreTokens.length) queries.add(coreTokens.join(" "));

  if (brand && coreTokens.length) queries.add(`${brand} ${coreTokens.slice(0, 3).join(" ")}`.trim());
  if (brand && !coreTokens.length) queries.add(brand);

  return Array.from(queries).slice(0, 4);
}

function buildFallbackBuyUrl(platformName, productName) {
  const platform = String(platformName || "").toLowerCase().trim();
  const q = encodeURIComponent(String(productName || "").trim());
  if (!q) return null;

  if (platform === "amazon") return `https://www.amazon.in/s?k=${q}`;
  if (platform === "flipkart") return `https://www.flipkart.com/search?q=${q}`;
  if (platform === "ebay") return `https://www.ebay.com/sch/i.html?_nkw=${q}`;
  if (platform === "snapdeal") return `https://www.snapdeal.com/search?keyword=${q}`;
  return null;
}

function pickValidUrl(...candidates) {
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (/^https?:\/\//i.test(value)) return value;
  }
  return null;
}

function resolveBuyUrl(platform, productName, baseProductName) {
  const direct = pickValidUrl(
    platform?.product_url,
    platform?.link,
    platform?.url,
    platform?.buy_link,
    platform?.product_link,
    platform?.itemWebUrl,
    platform?.item_web_url,
  );
  if (direct) return direct;

  return (
    buildFallbackBuyUrl(platform?.platform_name, productName) ||
    buildFallbackBuyUrl(platform?.platform_name, baseProductName)
  );
}

function extractRowsFromAnchorPlatforms(anchor) {
  return (anchor?.platforms || [])
    .map((platform) => {
      const price =
        Number(platform.price) ||
        Number(String(platform.price || "").replace(/[^\d.]/g, ""));
      if (!Number.isFinite(price) || price <= 0) return null;
      return {
        platform_name: String(platform.platform_name || "").toLowerCase().trim(),
        price,
        product_url: resolveBuyUrl(platform, anchor.product_name, anchor.product_name),
        rating: platform.rating ?? null,
        last_updated: platform.last_updated || null,
        image_url: platform.image_url || null,
        source: platform.source || platform.specs?.source || null,
        specs: platform.specs || {},
        matched_product_name: anchor.product_name,
      };
    })
    .filter(Boolean);
}

function buildComparisonRows(baseDoc, candidateDocs) {
  const baseTokens = tokenize(baseDoc.product_name).slice(0, 10);
  const baseBrand = String(baseDoc.brand || "").toLowerCase().trim();
  const baseCategory = String(baseDoc.category || "").toLowerCase().trim();
  const perPlatform = new Map();

  for (const doc of candidateDocs) {
    const docBrand = String(doc.brand || "").toLowerCase().trim();
    const docCategory = String(doc.category || "").toLowerCase().trim();
    const sameBrand = baseBrand && docBrand === baseBrand;
    const sameCategory = baseCategory && docCategory === baseCategory;
    const score =
      doc.normalized_key === baseDoc.normalized_key
        ? 100
        : overlapScore(baseTokens, tokenize(doc.product_name).slice(0, 10));

    if (doc.normalized_key !== baseDoc.normalized_key && !sameBrand && !sameCategory && score < 2) continue;
    if (doc.normalized_key !== baseDoc.normalized_key && (sameBrand || sameCategory) && score < 1) continue;
    if (!isStronglyRelevant(baseDoc, doc, score)) continue;

    for (const platform of doc.platforms || []) {
      const platformName = String(platform.platform_name || "").toLowerCase().trim();
      const price =
        Number(platform.price) ||
        Number(String(platform.price || "").replace(/[^\d.]/g, ""));
      if (!platformName || !Number.isFinite(price) || price <= 0) continue;

      const current = perPlatform.get(platformName);
      const payload = {
        platform_name: platformName,
        price,
        product_url: resolveBuyUrl(platform, doc.product_name, baseDoc.product_name),
        rating: platform.rating ?? null,
        last_updated: platform.last_updated || null,
        matched_product_name: doc.product_name,
        image_url: platform.image_url || null,
        source: platform.source || platform.specs?.source || null,
        specs: platform.specs || {},
        _score: score,
      };

      if (!current) {
        perPlatform.set(platformName, payload);
        continue;
      }

      if (payload._score > current._score || (payload._score === current._score && payload.price < current.price)) {
        perPlatform.set(platformName, payload);
      }
    }
  }

  return Array.from(perPlatform.values())
    .map(({ _score, ...row }) => row)
    .sort((a, b) => a.price - b.price);
}

async function getComparisonCandidates(baseDoc) {
  const searchTerms = Array.isArray(baseDoc.search_terms) ? baseDoc.search_terms.slice(0, 10) : [];
  const nameTokens = tokenize(baseDoc.product_name).slice(0, 6);
  const conditions = [
    { _id: baseDoc._id },
    { normalized_key: baseDoc.normalized_key },
    { category: baseDoc.category },
  ];

  if (baseDoc.brand && baseDoc.brand !== "UNKNOWN") {
    conditions.push({ brand: new RegExp(`^${escapeRegExp(baseDoc.brand)}`, "i") });
  }

  if (searchTerms.length) {
    conditions.push({ search_terms: { $in: searchTerms } });
  }

  if (nameTokens.length) {
    const tokenRegex = nameTokens.map((token) => new RegExp(escapeRegExp(token), "i"));
    conditions.push({ product_name: { $in: tokenRegex } });
  }

  const docs = await Product.find({ $or: conditions })
    .sort({ updated_at: -1 })
    .limit(250)
    .lean();

  return docs;
}

const listProducts = async (req, res) => {
  try {
    const [products] = await getAllProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const productDetails = async (req, res) => {
  try {
    const id = req.params.id;
    const [product] = await getProductById(id);

    if (product.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const productComparison = async (req, res) => {
  try {
    const id = req.params.id;
    const baseDoc = await Product.findById(id).lean();

    if (!baseDoc) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Real-time refresh attempts with multiple variants for better cross-platform coverage.
    const refreshQueries = buildRefreshQueries(baseDoc);
    for (const q of refreshQueries) {
      try {
        await scrapingService.scrapeAndStoreProduct(q);
      } catch (error) {
        console.warn(`Comparison refresh failed for '${q}': ${error.message}`);
      }
    }

    const refreshedBase = await Product.findById(id).lean();
    const anchor = refreshedBase || baseDoc;
    const candidates = await getComparisonCandidates(anchor);
    let prices = buildComparisonRows(anchor, candidates);

    // Always merge platform rows present on anchor product to avoid missing platforms in UI.
    const anchorRows = extractRowsFromAnchorPlatforms(anchor);
    if (anchorRows.length) {
      const byPlatform = new Map(
        prices.map((row) => [String(row.platform_name || "").toLowerCase().trim(), row]),
      );
      anchorRows.forEach((row) => {
        const key = String(row.platform_name || "").toLowerCase().trim();
        if (!key) return;
        if (!byPlatform.has(key)) byPlatform.set(key, row);
      });
      prices = Array.from(byPlatform.values()).sort((a, b) => a.price - b.price);
    }

    // Fallback: at least show prices already present on current product.
    if (!prices.length) {
      prices = extractRowsFromAnchorPlatforms(anchor).sort((a, b) => a.price - b.price);
    }

    if (prices.length === 0) {
      return res.status(404).json({ message: "No prices found" });
    }

    const cheapest = prices[0];

    res.json({
      cheapest_platform: cheapest.platform_name,
      cheapest_price: cheapest.price,
      all_prices: prices,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  listProducts,
  productDetails,
  productComparison,
};
