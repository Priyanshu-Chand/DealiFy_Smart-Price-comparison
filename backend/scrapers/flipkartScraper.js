const initBrowserPool = require("../services/browserPool");

async function scrapeFlipkart(query) {
  const cluster = await initBrowserPool();

  try {
    const result = await cluster.execute(query, async ({ page, data }) => {
      const url = `https://www.flipkart.com/search?q=${encodeURIComponent(data)}`;

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      await page.waitForSelector("div[data-id]", { timeout: 20000 });

      const products = await page.evaluate(() => {
        const items = [];

        document.querySelectorAll("div[data-id]").forEach((el) => {
          const title =
            el.querySelector("a[title]")?.innerText ||
            el.querySelector("._4rR01T")?.innerText;

          const price = el.querySelector("._30jeq3")?.innerText;

          const link = el.querySelector("a")?.href;

          const image = el.querySelector("img")?.src;

          if (title && price) {
            items.push({
              title,
              price,
              link,
              image,
              platform: "flipkart",
            });
          }
        });

        return items.slice(0, 5);
      });

      return products;
    });

    return result;
  } catch (error) {
    console.error("Flipkart Scraper Error:", error);
    return [];
  }
}

module.exports = scrapeFlipkart;
