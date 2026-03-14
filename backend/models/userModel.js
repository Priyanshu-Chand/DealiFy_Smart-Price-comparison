//Handles database queries related to users.

const db = require("../config/db");

const createUser = (name, email, passwordHash) => {
  const sql = `
    INSERT INTO users (name, email, password_hash)
    VALUES (?, ?, ?)
  `;
  return db.promise().query(sql, [name, email, passwordHash]);
};

const findUserByEmail = (email) => {
  const sql = `
    SELECT * FROM users WHERE email = ?
  `;
  return db.promise().query(sql, [email]);
};

module.exports = {
  createUser,
  findUserByEmail,
};
