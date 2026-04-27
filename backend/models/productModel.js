const Product = require("./mongo/Product");

const getAllProducts = async () => {
  const docs = await Product.find({}).sort({ created_at: -1 }).lean();

  const rows = docs.map((doc) => {
    const platformRows = (doc.platforms || [])
      .map((platform) => ({
        platform_name: platform.platform_name,
        price: Number(platform.price),
      }))
      .filter((platform) => Number.isFinite(platform.price))
      .sort((a, b) => a.price - b.price);

    const best = platformRows[0] || null;

    return {
      product_id: String(doc._id),
      product_name: doc.product_name,
      brand: doc.brand,
      category: doc.category || "other",
      model: null,
      image_url: doc.platforms?.[0]?.image_url || null,
      best_price: best ? best.price : null,
      best_platform: best ? best.platform_name : null,
      platforms: platformRows.map((platform) => platform.platform_name),
    };
  });

  return [rows];
};

const getProductById = async (id) => {
  const doc = await Product.findById(id).lean();

  if (!doc) return [[]];

  return [[{
    product_id: String(doc._id),
    product_name: doc.product_name,
    brand: doc.brand,
    category: doc.category,
    image_url: doc.platforms?.[0]?.image_url || null,
    specs: doc.specs || {},
    search_terms: doc.search_terms || [],
    platforms: (doc.platforms || []).map((platform) => ({
      platform_name: platform.platform_name,
      price: platform.price,
      source: platform.source || null,
      specs: platform.specs || {},
      product_url: platform.product_url,
      image_url: platform.image_url,
      rating: platform.rating,
      last_updated: platform.last_updated,
      price_history: platform.price_history || [],
    })),
    created_at: doc.created_at,
  }]];
};

const getProductComparison = async (id) => {
  const doc = await Product.findById(id).lean();

  if (!doc) return [[]];

  const rows = (doc.platforms || [])
    .map((platform) => ({
      platform_name: platform.platform_name,
      price: platform.price,
      product_url: platform.product_url,
      rating: platform.rating,
      last_updated: platform.last_updated,
    }))
    .sort((a, b) => a.price - b.price);

  return [rows];
};

module.exports = {
  getAllProducts,
  getProductById,
  getProductComparison,
};
