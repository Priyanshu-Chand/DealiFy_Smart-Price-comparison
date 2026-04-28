const Redis = require("ioredis");

const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = Number(process.env.REDIS_PORT || 6379);
const redisPassword = process.env.REDIS_PASSWORD || undefined;
const redisTlsEnabled =
  String(process.env.REDIS_TLS || "").toLowerCase() === "true";

const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      tls: redisUrl.startsWith("rediss://") ? {} : undefined,
    })
  : new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      tls: redisTlsEnabled ? {} : undefined,
      maxRetriesPerRequest: null,
    });

redis.on("connect", () => {
  console.log("Redis connected");
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});

module.exports = redis;

