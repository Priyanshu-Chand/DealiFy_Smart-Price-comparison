const Product = require("../models/mongo/Product");
const scrapingService = require("../services/scrapingService");

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

function resolveBuyUrl(platform, productName) {
  const direct = [
    platform?.product_url,
    platform?.link,
    platform?.url,
    platform?.buy_link,
    platform?.product_link,
    platform?.itemWebUrl,
    platform?.item_web_url,
  ].find((value) => /^https?:\/\//i.test(String(value || "").trim()));

  return direct || buildFallbackBuyUrl(platform?.platform_name, productName);
}

const compare = async (req, res) => {
  try {
    const productId = req.params.productId;

    const existing = await Product.findById(productId).lean();

    if (!existing) {
      return res.status(404).json({ message: "Product not found" });
    }

    await scrapingService.scrapeAndStoreProduct(existing.product_name);

    const refreshed = await Product.findById(productId).lean();
    const prices = (refreshed?.platforms || [])
      .map((platform) => ({
        platform_name: platform.platform_name,
        price: platform.price,
        product_url: resolveBuyUrl(platform, refreshed?.product_name || existing.product_name),
      }))
      .sort((a, b) => a.price - b.price);

    res.json({
      product: existing.product_name,
      prices,
      best_price: prices[0] || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { compare };
