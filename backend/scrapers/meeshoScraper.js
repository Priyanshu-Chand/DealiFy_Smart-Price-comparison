const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parsePrice(raw) {
  const value = Number(String(raw || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(value) && value > 0 ? String(value) : null;
}

function parseRating(raw) {
  const value = Number(String(raw || "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(value) || value <= 0 || value > 5) return null;
  return Number(value.toFixed(1));
}

function toAbsUrl(url) {
  const value = String(url || "").trim();
  if (!value) return null;
  if (value.startsWith("http")) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `https://www.meesho.com${value}`;
  return null;
}

function toProduct(item, source) {
  const title = String(item?.title || item?.name || "").replace(/\s+/g, " ").trim();
  const link = toAbsUrl(item?.link || item?.url);
  const image = toAbsUrl(item?.image || item?.img || item?.imageUrl) || null;
  const price = parsePrice(item?.price || item?.discountedPrice || item?.finalPrice);
  const rating = parseRating(item?.rating || item?.avgRating || item?.averageRating);

  if (!title || !link || !price || !/meesho\.com/i.test(link)) return null;

  return {
    title,
    price,
    link,
    image,
    platform: "meesho",
    brand: title.split(" ")[0] || "UNKNOWN",
    rating,
    specs: {
      source,
    },
  };
}

function extractFromDom(html, maxResults) {
  const $ = cheerio.load(html);
  const rows = [];

  $("a[href*='/'], a[href*='product'], a[href*='catalog']").each((_, el) => {
    const anchor = $(el);
    const href = anchor.attr("href");
    const card = anchor.closest("div");
    const scope = card.length ? card : anchor.parent();

    const title =
      anchor.attr("title") ||
      scope.find("[title]").first().attr("title") ||
      scope.find("p, h2, h3, h4").first().text() ||
      anchor.text();

    const price =
      scope.find("h5").first().text() ||
      scope.find("span").filter((__, s) => /\u20B9|Rs\.?|INR/i.test($(s).text())).first().text() ||
      scope.text().match(/(?:\u20B9|Rs\.?|INR)\s*[\d,]+/i)?.[0];

    const image =
      scope.find("img").first().attr("src") ||
      scope.find("img").first().attr("data-src") ||
      scope.find("img").first().attr("srcset");

    const rating = scope.find("span").filter((__, s) => /\d(\.\d)?\s*(\(|stars?)/i.test($(s).text())).first().text();

    const product = toProduct(
      { title, link: href, image, price, rating },
      "meesho_scrape_cheerio_dom",
    );

    if (product) rows.push(product);
  });

  const deduped = new Map();
  for (const row of rows) {
    const key = row.link || row.title.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || Number(row.price) < Number(existing.price)) {
      deduped.set(key, row);
    }
  }

  return Array.from(deduped.values()).slice(0, maxResults);
}

async function extractWithPuppeteer(url, userAgent, timeoutMs, maxResults) {
  const browser = await puppeteer.launch({
    headless: String(process.env.PUPPETEER_HEADLESS || "true").toLowerCase() === "true" ? "new" : false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-IN,en;q=0.9",
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.max(timeoutMs, 25000) });
    await sleep(2200);
    await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 1.8)));
    await sleep(1200);

    const raw = await page.evaluate((limit) => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const candidates = [];
      const seen = new Set();

      const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
      const abs = (v) => {
        const href = String(v || "").trim();
        if (!href) return null;
        if (/^https?:\/\//i.test(href)) return href;
        if (href.startsWith("//")) return `https:${href}`;
        if (href.startsWith("/")) return `https://www.meesho.com${href}`;
        return null;
      };

      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        if (!href || href === "#" || href.startsWith("javascript:")) continue;
        if (!/product|search|catalog|plp|pdp/i.test(href)) continue;

        const link = abs(href);
        if (!link || seen.has(link)) continue;

        const card = a.closest("article, li, [role='listitem'], div") || a.parentElement;
        const text = clean(card?.textContent || a.textContent || "");
        const title =
          clean(a.getAttribute("title")) ||
          clean(card?.querySelector("[title]")?.getAttribute("title")) ||
          clean(card?.querySelector("h2,h3,h4,p")?.textContent) ||
          "";
        const price = text.match(/(?:\u20B9|rs\.?|inr)\s*([\d,]+)/i)?.[0] || "";
        const rating = text.match(/\b([0-5](?:\.\d)?)\s*(?:\(|\/5|stars?)\b/i)?.[1] || "";
        const image =
          card?.querySelector("img")?.getAttribute("src") ||
          card?.querySelector("img")?.getAttribute("data-src") ||
          "";

        if (!title || !price) continue;
        seen.add(link);
        candidates.push({ title, link, price, rating, image });
        if (candidates.length >= Number(limit || 6) * 3) break;
      }

      return candidates;
    }, maxResults);

    const normalized = (Array.isArray(raw) ? raw : [])
      .map((item) => toProduct(item, "meesho_scrape_puppeteer_dom"))
      .filter(Boolean);

    const deduped = new Map();
    for (const row of normalized) {
      if (!deduped.has(row.link)) deduped.set(row.link, row);
    }
    return Array.from(deduped.values()).slice(0, maxResults);
  } finally {
    await browser.close();
  }
}

function walkJson(node, bucket) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((item) => walkJson(item, bucket));
    return;
  }
  if (typeof node !== "object") return;

  const hasTitle = node.name || node.title || node.productName;
  const hasPrice = node.price || node.discountedPrice || node.finalPrice || node.selling_price;
  const hasUrl = node.url || node.productUrl || node.slug || node.pdp_uri;
  if (hasTitle && hasPrice && hasUrl) {
    bucket.push({
      title: node.name || node.title || node.productName,
      price: node.price || node.discountedPrice || node.finalPrice || node.selling_price,
      link: node.url || node.productUrl || node.slug || node.pdp_uri,
      image:
        node.image ||
        node.imageUrl ||
        node.image_url ||
        (Array.isArray(node.images) ? node.images[0] : null),
      rating: node.rating || node.avgRating || node.averageRating || null,
    });
  }

  Object.values(node).forEach((value) => walkJson(value, bucket));
}

function extractFromNextData(html, maxResults) {
  const $ = cheerio.load(html);
  const script = $("#__NEXT_DATA__").text().trim();
  if (!script) return [];

  try {
    const data = JSON.parse(script);
    const bucket = [];
    walkJson(data, bucket);

    const rows = bucket
      .map((row) => toProduct(row, "meesho_scrape_next_data"))
      .filter(Boolean);

    const deduped = new Map();
    for (const row of rows) {
      if (!deduped.has(row.link)) deduped.set(row.link, row);
    }
    return Array.from(deduped.values()).slice(0, maxResults);
  } catch (error) {
    return [];
  }
}

async function meeshoScraper(query) {
  const timeoutMs = Number(process.env.MEESHO_TIMEOUT_MS || process.env.REQUEST_TIMEOUT_MS || 12000);
  const maxResults = Number(process.env.MAX_RESULTS_PER_SOURCE || 6);
  const userAgent =
    process.env.SCRAPER_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  const url = `https://www.meesho.com/search?q=${encodeURIComponent(query)}`;
  let html = "";

  try {
    const response = await axios.get(url, {
      timeout: timeoutMs,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: "https://www.meesho.com/",
        Origin: "https://www.meesho.com",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });
    html = String(response.data || "");
  } catch (error) {
    const isBlocked = Number(error?.response?.status) === 403;
    if (!isBlocked) throw error;
  }

  if (html) {
    const nextData = extractFromNextData(html, maxResults);
    if (nextData.length > 0) return nextData;

    const domRows = extractFromDom(html, maxResults);
    if (domRows.length > 0) return domRows;
  }

  // Final fallback: rendered DOM scrape using real browser context.
  return extractWithPuppeteer(url, userAgent, timeoutMs, maxResults);
}

module.exports = meeshoScraper;
