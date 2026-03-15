const redis = require("../config/redis");

async function getCache(key) {
  return await redis.get(key);
}

async function setCache(key, value) {
  await redis.set(key, JSON.stringify(value), "EX", 300);
}

module.exports = {
  getCache,
  setCache,
};
