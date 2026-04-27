const { Queue } = require("bullmq");
const redis = require("../config/redis");

const scrapeQueue = new Queue("scrape-products", {
  connection: redis,
  skipVersionCheck: true,
});

module.exports = scrapeQueue;
