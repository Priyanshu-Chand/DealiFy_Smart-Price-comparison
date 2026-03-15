const scrapingService = require("./services/scrapingService");

async function test() {
  const result = await scrapingService.scrapeAllPlatforms("iphone 15");

  console.log(result);
}

test();
