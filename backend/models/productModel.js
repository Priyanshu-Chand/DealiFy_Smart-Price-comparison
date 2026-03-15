const db = require("../config/db");

const getAllProducts = () => {
  const sql = `
    SELECT product_id, product_name, brand, model, image_url
    FROM products
    ORDER BY created_at DESC
  `;
  return db.promise().query(sql);
};

const getProductById = (id) => {
  const sql = `
    SELECT *
    FROM products
    WHERE product_id = ?
  `;
  return db.promise().query(sql, [id]);
};

const getProductComparison = (id) => {
  const sql = `
    SELECT 
      platforms.platform_name,
      product_prices.price,
      product_prices.product_url,
      product_prices.rating,
      product_prices.last_updated
    FROM product_prices
    JOIN platforms
      ON product_prices.platform_id = platforms.platform_id
    WHERE product_prices.product_id = ?
    ORDER BY product_prices.price ASC
  `;
  return db.promise().query(sql, [id]);
};

module.exports = {
  getAllProducts,
  getProductById,
  getProductComparison,
};
