const { Cluster } = require("puppeteer-cluster");

let cluster;

async function initBrowserPool() {
  if (!cluster) {
    cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_CONTEXT,
      maxConcurrency: 5,

      puppeteerOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    console.log("Browser pool started");
  }

  return cluster;
}

module.exports = initBrowserPool;
