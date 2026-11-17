const db = require('../database/db');
const bcrypt = require('bcryptjs');

const username = process.env.MIC_ADMIN_USERNAME;
const password = process.env.MIC_ADMIN_PASSWORD;

try {
  if (!username || !password || password.length < 12) {
    throw new Error('Username required and password must contain at least 12 characters.');
  }

  const count = db.prepare('SELECT COUNT(*) AS total FROM admin_users').get().total;
  if (count !== 0) {
    throw new Error('An admin account already exists. No changes made.');
  }

  const hash = bcrypt.hashSync(password, 12);

  db.prepare(
    'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)'
  ).run(username, hash);

  console.log('Admin account created successfully.');
} finally {
  db.close();
}