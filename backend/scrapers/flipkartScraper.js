const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
// Scraper for Flipkart search results, using a combination of axios+cheerio and puppeteer as a fallback.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parsePrice(raw) {
  const amount = Number(String(raw || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? String(amount) : null;
}
// Parses ratings from various Flipkart formats, including text and style-based percentages.
function parseRating(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const rating = Number(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(rating) || rating <= 0) return null;
  if (rating > 5) return null;
  return Number(rating.toFixed(1));
}
// Converts various URL formats to absolute URLs, ensuring they point to Flipkart.
function toAbsUrl(url) {
  const value = String(url || "").trim();
  if (!value) return null;
  if (value.startsWith("http")) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `https://www.flipkart.com${value}`;
  return null;
}
// Extracts image URLs from srcset attributes, which may contain multiple resolutions.
function extractImageFromSrcset(srcset) {
  if (!srcset) return null;
  const first = String(srcset).split(",")[0]?.trim()?.split(" ")[0];
  return toAbsUrl(first);
}
// Normalizes raw scraped items into a consistent product format, validating key fields.
function normalizeItem(item, source) {
  const title = String(item?.title || "").replace(/\s+/g, " ").trim();
  const link = toAbsUrl(item?.link);
  const image =
    toAbsUrl(item?.image) ||
    extractImageFromSrcset(item?.srcset) ||
    (item?.image ? String(item.image).trim() : null);
  const price = parsePrice(item?.price);
  const rating = parseRating(item?.rating);
// Basic validation to ensure we have a title, price, and valid Flipkart URL with product identifiers.
  if (!title || !link || !price || !/flipkart\.com/i.test(link)) return null;
  if (!/\/p\//i.test(link) && !/pid=/i.test(link)) return null;

  return {
    title,
    price,
    link,
    image,
    platform: "flipkart",
    brand: title.split(" ")[0] || "UNKNOWN",
    rating,
    specs: {
      source,
      snippet: item?.snippet || null,
    },
  };
}
// Parses Flipkart search results using Cheerio, targeting common card structures and JSON-LD data.
function parseWithCheerioCards(html, maxResults) {
  const $ = cheerio.load(html);
  const results = [];
// First attempt: look for product cards with known structures and extract data.
  $("a[href*='/p/'], a[href*='pid=']").each((_, el) => {
    const anchor = $(el);
    const href = anchor.attr("href");
    const card = anchor.closest("div[data-id], div.tUxRFH, div.slAVV4, div._1AtVbE");
    const scope = card.length ? card : anchor.parent();

    const title =
      anchor.attr("title") ||
      anchor.find("[title]").first().attr("title") ||
      scope.find("div.KzDlHZ").first().text() ||
      scope.find("a.WKTcLC").first().text() ||
      scope.find("div._4rR01T").first().text() ||
      scope.find("a.s1Q9rs").first().text() ||
      anchor.text();

    const price =
      scope.find("div.Nx9bqj").first().text() ||
      scope.find("div._30jeq3").first().text() ||
      scope.text().match(/₹\s?[\d,]+/)?.[0];

    const image =
      scope.find("img").first().attr("src") ||
      scope.find("img").first().attr("data-src") ||
      scope.find("img").first().attr("srcset");

    const rating = scope.find("div.XQDdHH").first().text();
    const snippet = scope.text().replace(/\s+/g, " ").trim().slice(0, 260);

    const normalized = normalizeItem(
      { title, link: href, price, image, rating, snippet },
      "flipkart_scrape_cheerio_dom",
    );
    if (normalized) results.push(normalized);
  });

  // Deduplicate by URL and keep best (lowest) parsed price.
  const deduped = new Map();
  for (const item of results) {
    const existing = deduped.get(item.link);
    if (!existing || Number(item.price) < Number(existing.price)) {
      deduped.set(item.link, item);
    }
  }

  return Array.from(deduped.values()).slice(0, maxResults);
}

function parseWithJsonLd(html, maxResults) {
  const $ = cheerio.load(html);
  const results = [];

  $("script[type='application/ld+json']").each((_, el) => {
    const text = $(el).text().trim();
    if (!text) return;

    try {
      const data = JSON.parse(text);
      const list =
        Array.isArray(data?.itemListElement) ? data.itemListElement :
        Array.isArray(data) ? data :
        [data];

      list.forEach((entry) => {
        const node = entry?.item || entry;
        const title = node?.name || node?.title;
        const link = node?.url;
        const image = Array.isArray(node?.image) ? node.image[0] : node?.image;
        const offer = Array.isArray(node?.offers) ? node.offers[0] : node?.offers;
        const price = offer?.price || node?.price;
        const rating = node?.aggregateRating?.ratingValue || null;

        const normalized = normalizeItem(
          { title, link, image, price, rating },
          "flipkart_scrape_jsonld",
        );
        if (normalized) results.push(normalized);
      });
    } catch (error) {
      // Ignore malformed script blocks.
    }
  });

  const deduped = new Map();
  for (const item of results) {
    if (!deduped.has(item.link)) deduped.set(item.link, item);
  }
  return Array.from(deduped.values()).slice(0, maxResults);
}

async function parseWithPuppeteer(url, timeoutMs, maxResults, userAgent) {
  const browser = await puppeteer.launch({
    headless: String(process.env.PUPPETEER_HEADLESS || "true").toLowerCase() === "true" ? "new" : false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await sleep(1500);

    const raw = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href*='/p/'], a[href*='pid=']"));
      return anchors.map((anchor) => {
        const card =
          anchor.closest("div[data-id]") ||
          anchor.closest("div.tUxRFH") ||
          anchor.closest("div._1AtVbE") ||
          anchor.parentElement;
        const text = card?.textContent?.replace(/\s+/g, " ").trim() || "";
        const find = (selectors, kind) => {
          for (const selector of selectors) {
            const node = card?.querySelector(selector);
            if (!node) continue;
            if (kind === "text" && node.textContent?.trim()) return node.textContent.trim();
            if (kind === "src") {
              const src = node.getAttribute("src") || node.getAttribute("data-src") || node.getAttribute("srcset");
              if (src) return src;
            }
          }
          return "";
        };

        return {
          title:
            anchor.getAttribute("title") ||
            find(["div.KzDlHZ", "a.WKTcLC", "div._4rR01T", "a.s1Q9rs"], "text") ||
            anchor.textContent?.trim() ||
            "",
          link: anchor.getAttribute("href") || "",
          price:
            find(["div.Nx9bqj", "div._30jeq3"], "text") ||
            text.match(/₹\s?[\d,]+/)?.[0] ||
            "",
          image: find(["img"], "src"),
          rating: find(["div.XQDdHH"], "text"),
          snippet: text.slice(0, 260),
        };
      });
    });

    const items = raw
      .map((item) => normalizeItem(item, "flipkart_scrape_puppeteer_dom"))
      .filter(Boolean);

    const deduped = new Map();
    for (const item of items) {
      const existing = deduped.get(item.link);
      if (!existing || Number(item.price) < Number(existing.price)) deduped.set(item.link, item);
    }
    return Array.from(deduped.values()).slice(0, maxResults);
  } finally {
    await browser.close();
  }
}

async function flipkartScraper(query) {
  const timeoutMs = Number(process.env.FLIPKART_TIMEOUT_MS || process.env.REQUEST_TIMEOUT_MS || 18000);
  const maxResults = Number(process.env.MAX_RESULTS_PER_SOURCE || 6);
  const userAgent =
    process.env.SCRAPER_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const url = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;

  try {
    const { data: html } = await axios.get(url, {
      timeout: timeoutMs,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        Referer: "https://www.flipkart.com/",
      },
    });

    const domParsed = parseWithCheerioCards(html, maxResults);
    if (domParsed.length >= Math.min(3, maxResults)) return domParsed;

    const jsonLdParsed = parseWithJsonLd(html, maxResults);
    const merged = [...domParsed];
    const seen = new Set(domParsed.map((i) => i.link));
    jsonLdParsed.forEach((item) => {
      if (!seen.has(item.link)) merged.push(item);
    });
    if (merged.length > 0) return merged.slice(0, maxResults);
  } catch (error) {
    console.warn(`Flipkart axios+cheerio failed: ${error.message}`);
  }

  try {
    return await parseWithPuppeteer(url, Math.max(timeoutMs, 24000), maxResults, userAgent);
  } catch (error) {
    console.warn(`Flipkart puppeteer fallback failed: ${error.message}`);
    return [];
  }
}

module.exports = flipkartScraper;
