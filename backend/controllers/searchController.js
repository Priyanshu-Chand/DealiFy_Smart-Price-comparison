const db = require("../config/db");
const { searchProducts, logSearch } = require("../models/searchModel");
const scrapingService = require("../services/scrapingService");

const search = async (req, res) => {
  try {
    const query = req.query.q;

    if (!query) {
      return res.status(400).json({ message: "Search query required" });
    }

    const [results] = await searchProducts(query);

    await logSearch(null, query, results.length);

    // CASE 1: Product found
    if (results.length > 0) {
      return res.json({
        source: "database",
        query,
        results,
      });
    }

    // CASE 2: Product NOT found
    console.log("Product not found in DB, starting scraping...");

    const scrapedProducts = await scrapingService.scrapeAllPlatforms(query);

    if (!scrapedProducts.length) {
      return res.json({
        message: "Product not found anywhere",
      });
    }

    // Create new product entry
    const productName = scrapedProducts[0].title;

    const [insertResult] = await db.query(
      `
      INSERT INTO products
      (category_id, brand, model, product_name, specs_hash)
      VALUES (1, ?, ?, ?, SHA2(?,256))
      `,
      [
        extractBrand(productName),
        extractModel(productName),
        productName,
        productName,
      ],
    );

    const newProductId = insertResult.insertId;

    return res.json({
      source: "scraped",
      product_id: newProductId,
      product_name: productName,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { search };
