const db = require("../config/db");

const getUserCart = (userId) => {
  const sql = `
    SELECT c.cart_id
    FROM carts c
    WHERE c.user_id = ?
  `;

  return db.promise().query(sql, [userId]);
};

const createCart = (userId) => {
  const sql = `
    INSERT INTO carts (user_id)
    VALUES (?)
  `;

  return db.promise().query(sql, [userId]);
};

const addCartItem = (cartId, productId) => {
  const sql = `
    INSERT INTO cart_items (cart_id, product_id)
    VALUES (?, ?)
  `;

  return db.promise().query(sql, [cartId, productId]);
};

const getCartItems = (userId) => {
  const sql = `
    SELECT 
      cart_items.cart_item_id,
      products.product_id,
      products.product_name,
      products.brand,
      products.image_url
    FROM carts
    JOIN cart_items
      ON carts.cart_id = cart_items.cart_id
    JOIN products
      ON cart_items.product_id = products.product_id
    WHERE carts.user_id = ?
  `;

  return db.promise().query(sql, [userId]);
};

const removeCartItem = (cartItemId) => {
  const sql = `
    DELETE FROM cart_items
    WHERE cart_item_id = ?
  `;

  return db.promise().query(sql, [cartItemId]);
};

module.exports = {
  getUserCart,
  createCart,
  addCartItem,
  getCartItems,
  removeCartItem,
};
