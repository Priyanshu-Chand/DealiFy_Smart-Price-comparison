const User = require("./mongo/User");

const mapUserRow = (doc) => ({
  user_id: String(doc._id),
  name: doc.name,
  email: doc.email,
  password_hash: doc.password_hash,
});

const createUser = async (name, email, passwordHash) => {
  const created = await User.create({
    name,
    email: String(email || "").toLowerCase().trim(),
    password_hash: passwordHash,
  });

  return [{ insertId: String(created._id) }];
};

const findUserByEmail = async (email) => {
  const normalized = String(email || "").toLowerCase().trim();
  const user = await User.findOne({ email: normalized }).lean();
  return [user ? [mapUserRow(user)] : []];
};

module.exports = { createUser, findUserByEmail };
