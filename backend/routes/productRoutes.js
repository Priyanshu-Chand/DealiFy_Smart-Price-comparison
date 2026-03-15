const express = require("express");
const router = express.Router();

const {
  listProducts,
  productDetails,
  productComparison,
} = require("../controllers/productController");

router.get("/products", listProducts);
router.get("/products/:id", productDetails);
router.get("/products/:id/comparison", productComparison);

module.exports = router;
