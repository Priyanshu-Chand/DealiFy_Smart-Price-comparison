const axios = require("axios");

let ebayToken = null;
let ebayTokenExpiresAt = 0;
let usingManualToken = false;

function toInrAmount(value, currency) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const code = String(currency || "USD").toUpperCase();
  if (code === "INR") return numeric;

  // Keep conversion configurable; fallback rate is used when no FX service is configured.
  const usdToInr = Number(process.env.USD_TO_INR_RATE || 83);
  if (code === "USD") return numeric * usdToInr;

  return null;
}

function parseEbayRating(item) {
  const sellerFeedbackPct =
    item?.seller?.feedbackPercentage ??
    item?.sellerFeedbackPercentage ??
    null;
  const numeric = Number(String(sellerFeedbackPct || "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100) return null;
  return Number((numeric / 20).toFixed(1));
}

function getEbayEnvConfig() {
  const environment = (process.env.EBAY_ENVIRONMENT || "auto").toLowerCase();

  if (environment === "sandbox") {
    return {
      tokenUrl: "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
      apiBaseUrl: "https://api.sandbox.ebay.com",
    };
  }

  return {
    tokenUrl: "https://api.ebay.com/identity/v1/oauth2/token",
    apiBaseUrl: "https://api.ebay.com",
  };
}

async function getEbayToken(options = {}) {
  const preferManual = options.preferManual !== false;
  const manualToken = String(process.env.EBAY_ACCESS_TOKEN || "").trim();
  const manualTokenExpiry = Number(process.env.EBAY_ACCESS_TOKEN_EXPIRES_AT || 0);
  const manualTokenValid = manualToken && (!manualTokenExpiry || Date.now() < manualTokenExpiry);

  if (preferManual && manualTokenValid) {
    usingManualToken = true;
    return manualToken;
  }

  if (ebayToken && Date.now() < ebayTokenExpiresAt) {
    usingManualToken = false;
    return ebayToken;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId.includes("your-") || clientSecret.includes("your-")) {
    console.warn("eBay source skipped: credentials are not configured yet");
    return null;
  }

  const { tokenUrl } = getEbayEnvConfig();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 12000);

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  });

  const { data } = await axios.post(tokenUrl, body.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: timeoutMs,
  });

  ebayToken = data.access_token;
  const expiresInMs = (Number(data.expires_in) || 7200) * 1000;
  ebayTokenExpiresAt = Date.now() + expiresInMs - 60000;
  usingManualToken = false;

  return ebayToken;
}

async function fetchBrowseSearch(query, token) {
  const { apiBaseUrl } = getEbayEnvConfig();
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 12000);
  const maxResults = Number(process.env.MAX_RESULTS_PER_SOURCE || 6);
  const configuredMarketplace = String(process.env.EBAY_MARKETPLACE_ID || "EBAY_US").trim();
  const marketplaceCandidates = [configuredMarketplace, "EBAY_US"].filter(
    (value, index, arr) => value && arr.indexOf(value) === index,
  );
  const filterCandidates = ["deliveryCountry:IN", null];

  let lastError = null;

  for (const marketplaceId of marketplaceCandidates) {
    for (const filter of filterCandidates) {
      try {
        const params = {
          q: query,
          limit: maxResults,
        };
        if (filter) params.filter = filter;

        const { data } = await axios.get(`${apiBaseUrl}/buy/browse/v1/item_summary/search`, {
          params,
          headers: {
            Authorization: `Bearer ${token}`,
            "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
          },
          timeout: timeoutMs,
        });

        return data;
      } catch (error) {
        lastError = error;
        const status = error?.response?.status;
        if (status && ![400, 409].includes(status)) {
          throw error;
        }
      }
    }
  }

  throw lastError || new Error("eBay browse search failed");
}

async function ebayScraper(query) {
  let token = await getEbayToken();
  if (!token) return [];

  const maxResults = Number(process.env.MAX_RESULTS_PER_SOURCE || 6);
  let data;

  try {
    data = await fetchBrowseSearch(query, token);
  } catch (error) {
    const status = error?.response?.status;
    const canRetryWithFreshToken = status === 401;

    if (canRetryWithFreshToken) {
      ebayToken = null;
      ebayTokenExpiresAt = 0;
      token = await getEbayToken({ preferManual: false });
      if (!token) return [];
      data = await fetchBrowseSearch(query, token);
    } else {
      throw error;
    }
  }

  const summaries = Array.isArray(data.itemSummaries) ? data.itemSummaries : [];

  return summaries
    .map((item) => {
      const title = item.title;
      const link = item.itemWebUrl;
      const image = item.image?.imageUrl || null;
      const priceValue = item.price?.value;
      const currency = item.price?.currency;
      const inrPrice = toInrAmount(priceValue, currency);
      const rating = parseEbayRating(item);

      if (!title || !link || !inrPrice) return null;

      return {
        title,
        price: String(inrPrice),
        link,
        image,
        platform: "ebay",
        brand: title.split(" ")[0] || "UNKNOWN",
        rating,
        specs: {
          source: "ebay_browse_api",
          seller_feedback_percent:
            item?.seller?.feedbackPercentage ?? item?.sellerFeedbackPercentage ?? null,
          original_price: priceValue ? String(priceValue) : null,
          original_currency: currency || null,
          converted_currency: "INR",
          condition: item.condition || null,
          itemLocation: item.itemLocation || null,
          shippingOptions: item.shippingOptions || null,
        },
      };
    })
    .filter(Boolean)
    .slice(0, maxResults);
}

module.exports = ebayScraper;
