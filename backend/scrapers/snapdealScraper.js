const axios = require("axios");
const cheerio = require("cheerio");

function parseRating(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const numeric = Number(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 5) return null;
  return Number(numeric.toFixed(1));
}

async function snapdealScraper(query) {
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 12000);
  const maxResults = Number(process.env.MAX_RESULTS_PER_SOURCE || 6);
  const userAgent =
    process.env.SCRAPER_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  const url = `https://www.snapdeal.com/search?keyword=${encodeURIComponent(query)}`;

  const { data: html } = await axios.get(url, {
    timeout: timeoutMs,
    headers: {
      "User-Agent": userAgent,
    },
  });

  const $ = cheerio.load(html);
  const products = [];

  $(".product-tuple-listing").each((_, el) => {
    const title =
      $(el).find(".product-title").attr("title") ||
      $(el).find(".product-title").text().trim();

    const price =
      $(el).find(".product-price").attr("display-price") ||
      $(el).find(".product-price").text().trim();

    const linkPath = $(el).find("a.dp-widget-link").attr("href");
    const link = linkPath
      ? linkPath.startsWith("http")
        ? linkPath
        : `https:${linkPath}`
      : null;

    const image =
      $(el).find("img.product-image").attr("src") ||
      $(el).find("img.product-image").attr("data-src") ||
      null;

    const ratingRaw =
      $(el).find(".filled-stars").attr("style") ||
      $(el).find(".rating-stars .filled-stars").attr("style") ||
      $(el).find(".product-rating-count").text().trim() ||
      $(el).find(".avrg-rating").text().trim() ||
      $(el).find(".product-rating").text().trim();

    // Style value often comes like "width:86%"; convert to 5-point scale.
    let rating = parseRating(ratingRaw);
    if (!rating && /%/.test(String(ratingRaw || ""))) {
      const pct = Number(String(ratingRaw).replace(/[^\d.]/g, ""));
      if (Number.isFinite(pct) && pct > 0 && pct <= 100) {
        rating = Number((pct / 20).toFixed(1));
      }
    }

    if (!title || !price || !link) return;

    products.push({
      title,
      price,
      link,
      image,
      platform: "snapdeal",
      brand: title.split(" ")[0] || "UNKNOWN",
      rating,
      specs: {
        source: "snapdeal_scraping",
      },
    });
  });

  return products.slice(0, maxResults);
}

module.exports = snapdealScraper;
