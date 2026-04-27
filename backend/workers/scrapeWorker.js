const { Worker } = require("bullmq");
const redis = require("../config/redis");
const scrapingService = require("../services/scrapingService");
// Create a worker to process scraping jobs
const worker = new Worker(
  "scrape-products",
  async (job) => {
    const { query } = job.data;

    console.log("Worker scraping:", query);

    await scrapingService.scrapeAndStoreProduct(query);
  },
  {
    connection: redis,
    skipVersionCheck: true,
  },
);

// Event listeners for logging
worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});
// Handle errors
worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed`, err);
});
