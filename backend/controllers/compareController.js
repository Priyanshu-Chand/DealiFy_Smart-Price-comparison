const db = require("../config/db");
const scrapingService = require("../services/scrapingService");

const compare = async (req, res) => {
  try {
    const productId = req.params.productId;

    const [productRows] = await db.query(
      "SELECT product_name FROM products WHERE product_id=?",
      [productId],
    );

    if (!productRows.length) {
      return res.status(404).json({ message: "Product not found" });
    }

    const productName = productRows[0].product_name;

    // start scraping
    await scrapingService.scrapeAllPlatforms(productName, productId);

    // fetch prices
    const [prices] = await db.query(
      `
      SELECT pl.platform_name, pr.price, pr.product_url
      FROM product_prices pr
      JOIN platforms pl
      ON pr.platform_id = pl.platform_id
      WHERE pr.product_id=?
      ORDER BY pr.price ASC
      `,
      [productId],
    );

    res.json({
      product: productName,
      prices,
      best_price: prices[0] || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { compare };
