const axios = require("axios");
// Helper to convert SerpAPI item to our product format
function toProduct(item) {
  const title = item.title || item.name || item.product_title;
  const link = item.link || item.product_link || item.url;
  const image = item.thumbnail || item.image || item.thumbnail_url || null;
  const price =
    item.price ||
    item.extracted_price ||
    item.price?.value ||
    item.current_price ||
    null;

  if (!title || !price) return null;

  return {
    title,
    price: String(price),
    link,
    image,
    platform: "amazon",
    brand: title.split(" ")[0] || "UNKNOWN",
    rating: item.rating || item.stars || null,
    specs: {
      source: "amazon_serpapi",
      asin: item.asin || null,
      prime: item.prime || null,
      reviews: item.reviews || item.ratings_total || null,
      delivery: item.delivery || null,
      snippet: item.snippet || null,
    },
  };
}

async function amazonScraper(query) {
  const apiKey = process.env.AMAZON_SERPAPI_KEY || process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.warn("Amazon source skipped: AMAZON_SERPAPI_KEY is not configured");
    return [];
  }

  const baseUrl = process.env.AMAZON_SERPAPI_BASE_URL || "https://serpapi.com/search.json";
  const amazonDomain = process.env.AMAZON_SERPAPI_DOMAIN || "amazon.in";
  const language = process.env.AMAZON_SERPAPI_LANGUAGE || "en_IN";
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 12000);
  const maxResults = Number(process.env.MAX_RESULTS_PER_SOURCE || 6);

  const { data } = await axios.get(baseUrl, {
    params: {
      engine: "amazon",
      amazon_domain: amazonDomain,
      language,
      k: query,
      api_key: apiKey,
    },
    timeout: timeoutMs,
  });

  const sourceItems = [
    ...(Array.isArray(data.organic_results) ? data.organic_results : []),
    ...(Array.isArray(data.shopping_results) ? data.shopping_results : []),
    ...(Array.isArray(data.products) ? data.products : []),
  ];

  return sourceItems.map(toProduct).filter(Boolean).slice(0, maxResults);
}

module.exports = amazonScraper;
