const db = require("../config/db");

const searchProducts = (query) => {
  const sql = `
    SELECT product_id, product_name, brand, model, image_url
    FROM products
    WHERE MATCH(product_name)
    AGAINST(? IN NATURAL LANGUAGE MODE)
    LIMIT 20
  `;
  return db.query(sql, [query]);
};

const logSearch = (userId, query, resultCount) => {
  const sql = `
    INSERT INTO search_logs (user_id, search_query, result_count)
    VALUES (?, ?, ?)
  `;
  return db.query(sql, [userId, query, resultCount]);
};

module.exports = {
  searchProducts,
  logSearch,
};
