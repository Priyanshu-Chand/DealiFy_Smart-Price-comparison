const { mongoose } = require("../config/db");
const Cart = require("./mongo/Cart");
const Product = require("./mongo/Product");

const toObjectId = (value) => {
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(String(value));
};

const getUserCart = async (userId) => {
  const uid = toObjectId(userId);
  if (!uid) return [[]];

  const cart = await Cart.findOne({ user_id: uid }).lean();
  return [cart ? [{ cart_id: String(cart._id) }] : []];
};

const createCart = async (userId) => {
  const uid = toObjectId(userId);
  if (!uid) throw new Error("Invalid user id");

  const created = await Cart.create({ user_id: uid, items: [] });
  return [{ insertId: String(created._id) }];
};

const addCartItem = async (cartId, productId) => {
  const cid = toObjectId(cartId);
  const pid = toObjectId(productId);
  if (!cid || !pid) throw new Error("Invalid cart or product id");

  await Cart.updateOne(
    { _id: cid },
    {
      $push: {
        items: {
          product_id: pid,
          added_at: new Date(),
        },
      },
    },
  );

  return [{ acknowledged: true }];
};

const getCartItems = async (userId) => {
  const uid = toObjectId(userId);
  if (!uid) return [[]];

  const cart = await Cart.findOne({ user_id: uid }).lean();
  if (!cart || !Array.isArray(cart.items) || !cart.items.length) {
    return [[]];
  }

  const productIds = cart.items
    .map((item) => item.product_id)
    .filter((id) => mongoose.Types.ObjectId.isValid(id));

  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const rows = cart.items
    .map((item) => {
      const product = productMap.get(String(item.product_id));
      if (!product) return null;

      return {
        cart_item_id: String(item._id),
        product_id: String(product._id),
        product_name: product.product_name,
        brand: product.brand,
        image_url: product.platforms?.[0]?.image_url || null,
      };
    })
    .filter(Boolean);

  return [rows];
};

const removeCartItem = async (cartItemId) => {
  const itemId = toObjectId(cartItemId);
  if (!itemId) return [{ acknowledged: true, modifiedCount: 0 }];

  await Cart.updateOne(
    { "items._id": itemId },
    { $pull: { items: { _id: itemId } } },
  );

  return [{ acknowledged: true }];
};

module.exports = { getUserCart, createCart, addCartItem, getCartItems, removeCartItem };
