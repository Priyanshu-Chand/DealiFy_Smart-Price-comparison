const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  addToCart,
  viewCart,
  removeFromCart,
} = require("../controllers/cartController");

router.post("/cart/add", authMiddleware, addToCart);

router.get("/cart", authMiddleware, viewCart);

router.delete("/cart/remove/:id", authMiddleware, removeFromCart);

module.exports = router;
