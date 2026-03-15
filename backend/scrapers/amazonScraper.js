const initBrowserPool = require("../services/browserPool");

async function amazonScraper(query) {
  const cluster = await initBrowserPool();

  const result = await cluster.execute(query, async ({ page, data }) => {
    const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(data)}`;

    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

    const products = await page.evaluate(() => {
      const items = [];

      document.querySelectorAll(".s-result-item").forEach((el) => {
        const title = el.querySelector("h2 span")?.innerText;
        const price = el.querySelector(".a-price-whole")?.innerText;
        const link = el.querySelector("h2 a")?.href;
        const image = el.querySelector("img")?.src;

        if (title && price) {
          items.push({
            title,
            price,
            link,
            image,
            platform: "amazon",
          });
        }
      });

      return items.slice(0, 5);
    });

    return products;
  });

  return result;
}

module.exports = amazonScraper;
