const { mongoose } = require("../../config/db");

const platformPriceSchema = new mongoose.Schema(
  {
    platform_name: { type: String, required: true, lowercase: true, trim: true },
    price: { type: Number, required: true },
    source: { type: String, default: null, trim: true },
    specs: { type: mongoose.Schema.Types.Mixed, default: {} },
    product_url: { type: String, default: null },
    image_url: { type: String, default: null },
    rating: { type: Number, default: null },
    last_updated: { type: Date, default: Date.now },
    price_history: {
      type: [
        new mongoose.Schema(
          {
            ts: { type: Date, default: Date.now },
            price: { type: Number, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    normalized_key: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      sparse: true,
    },
    product_name: { type: String, required: true, trim: true },
    brand: { type: String, default: "UNKNOWN", trim: true },
    category: { type: String, default: "other", trim: true },
    specs: { type: mongoose.Schema.Types.Mixed, default: {} },
    search_terms: { type: [String], default: [] },
    platforms: { type: [platformPriceSchema], default: [] },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

productSchema.index({ product_name: "text", brand: "text" });
productSchema.index({ search_terms: 1 });

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);
