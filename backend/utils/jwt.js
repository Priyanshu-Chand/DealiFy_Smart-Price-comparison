// This creates a secure authentication token.

const jwt = require("jsonwebtoken");

const generateToken = (user) => {
  return jwt.sign(
    { id: user.user_id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
};

module.exports = { generateToken };
