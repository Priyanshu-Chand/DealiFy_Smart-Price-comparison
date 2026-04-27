const Product = require("./mongo/Product");
const SearchLog = require("./mongo/SearchLog");

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const searchProducts = async (query) => {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);

  const regexTerms = terms.map((term) => new RegExp(escapeRegExp(term), "i"));

  const nameAndFilters =
    regexTerms.length > 0
      ? regexTerms.map((regex) => ({ product_name: regex }))
      : [{ product_name: /.*/i }];

  const products = await Product.find({
    $or: [
      { $and: nameAndFilters },
      { search_terms: { $in: [query.toLowerCase()] } },
      { brand: { $in: regexTerms } },
    ],
  })
    .sort({ created_at: -1 })
    .limit(300)
    .lean();

  const normalizedTerms = terms.map((term) => term.replace(/s$/, ""));
  const intentGroups = {
    mobile: ["mobile", "phone", "smartphone", "iphone", "android"],
    laptop: ["laptop", "notebook", "macbook", "chromebook", "vivobook", "thinkpad", "ideapad"],
    headphone: ["headphone", "earphone", "earbud", "headset"],
    watch: ["watch", "smartwatch"],
  };

  const requestedIntents = Object.entries(intentGroups)
    .filter(([, words]) => normalizedTerms.some((term) => words.includes(term)))
    .map(([intent]) => intent);
  const intentVocabulary = new Set(Object.values(intentGroups).flat());
  const specificTerms = normalizedTerms.filter((term) => !intentVocabulary.has(term));
  const scoringTerms = specificTerms.length ? specificTerms : normalizedTerms;

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenMatchScore(product) {
    const haystack = normalizeText([
      product.product_name,
      product.brand,
      product.category,
      ...(Array.isArray(product.search_terms) ? product.search_terms : []),
    ].join(" "));

    let matches = 0;
    for (const term of scoringTerms) {
      if (!term) continue;
      if (haystack.includes(term)) matches += 1;
    }

    return matches;
  }

  function matchesRequestedIntent(product) {
    if (!requestedIntents.length) return true;
    const haystack = normalizeText(`${product.product_name} ${product.category}`);

    return requestedIntents.some((intent) =>
      intentGroups[intent].some((word) => haystack.includes(word)),
    );
  }

  const filteredProducts = products.filter((product) => {
    const score = tokenMatchScore(product);
    const minScore = scoringTerms.length > 1 ? 2 : 1;
    return score >= minScore && matchesRequestedIntent(product);
  });

  const rows = filteredProducts.flatMap((product) => {
    const imageUrl = product.platforms?.[0]?.image_url || null;

    return (product.platforms || []).map((platform) => ({
      product_id: String(product._id),
      product_name: product.product_name,
      brand: product.brand,
      image_url: imageUrl,
      price: platform.price,
      platform_name: platform.platform_name,
    }));
  });

  return [rows];
};

const logSearch = async (userId, query, resultCount) => {
  await SearchLog.create({
    user_id: userId ? String(userId) : null,
    search_query: query,
    result_count: resultCount,
  });

  return [{ acknowledged: true }];
};

module.exports = {
  searchProducts,
  logSearch,
};
