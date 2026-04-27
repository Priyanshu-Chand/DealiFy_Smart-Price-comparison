const mongoose = require("mongoose");
const path = require("path");

if (!process.env.MONGODB_URI && !process.env.PORT) {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
}

let connected = false;

function unsupportedMySqlError() {
  throw new Error(
    "This backend now uses MongoDB only. Use MONGODB_URI (Atlas cluster URI) in backend/.env.",
  );
}

async function connectDB() {
  if (connected) return mongoose.connection;

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
  });

  connected = true;
  console.log("MongoDB Connected");

  return mongoose.connection;
}

const dbCompat = {
  connectDB,
  mongoose,
  query: unsupportedMySqlError,
  promise: () => {
    return {
      query: unsupportedMySqlError,
    };
  },
};

module.exports = dbCompat;
