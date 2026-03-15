const {
  getAllProducts,
  getProductById,
  getProductComparison,
} = require("../models/productModel");

const listProducts = async (req, res) => {
  try {
    const [products] = await getAllProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const productDetails = async (req, res) => {
  try {
    const id = req.params.id;
    const [product] = await getProductById(id);

    if (product.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const productComparison = async (req, res) => {
  try {
    const id = req.params.id;

    const [prices] = await getProductComparison(id);

    if (prices.length === 0) {
      return res.status(404).json({ message: "No prices found" });
    }

    const cheapest = prices[0];

    res.json({
      cheapest_platform: cheapest.platform_name,
      cheapest_price: cheapest.price,
      all_prices: prices,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  listProducts,
  productDetails,
  productComparison,
};
