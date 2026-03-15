const {
  getUserCart,
  createCart,
  addCartItem,
  getCartItems,
  removeCartItem,
} = require("../models/cartModel");

const addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id } = req.body;

    let [cart] = await getUserCart(userId);

    let cartId;

    if (cart.length === 0) {
      const [newCart] = await createCart(userId);
      cartId = newCart.insertId;
    } else {
      cartId = cart[0].cart_id;
    }

    await addCartItem(cartId, product_id);

    res.json({ message: "Product added to cart" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const viewCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const [items] = await getCartItems(userId);

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const id = req.params.id;

    await removeCartItem(id);

    res.json({ message: "Item removed from cart" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  addToCart,
  viewCart,
  removeFromCart,
};
