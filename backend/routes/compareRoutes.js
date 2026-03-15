const express = require("express");
const router = express.Router();
const { compare } = require("../controllers/compareController");

router.get("/:productId", compare);

module.exports = router;
