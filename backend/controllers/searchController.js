const { searchProducts, logSearch } = require("../models/searchModel");

const search = async (req, res) => {
  try {

    const query = req.query.q;

    if (!query) {
      return res.status(400).json({ message: "Search query required" });
    }

    const [results] = await searchProducts(query);

    // optional user id (if logged in)
    const userId = null;

    await logSearch(userId, query, results.length);

    res.json({
      query,
      results_count: results.length,
      results
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { search };