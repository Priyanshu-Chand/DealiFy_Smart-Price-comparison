const { mongoose } = require("../../config/db");

const searchLogSchema = new mongoose.Schema(
  {
    user_id: { type: String, default: null },
    search_query: { type: String, required: true, trim: true },
    result_count: { type: Number, required: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: false },
  },
);

module.exports =
  mongoose.models.SearchLog || mongoose.model("SearchLog", searchLogSchema);
