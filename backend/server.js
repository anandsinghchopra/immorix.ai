require('dotenv').config(); 

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { spawn } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
// 🔒 Reset Password Route
app.post('/reset-password', async (req, res) => {
  const { username, newPassword } = req.body;
  if (!username || !newPassword) return res.status(400).json({ message: "Missing fields" });

  const hashed = await bcrypt.hash(newPassword, 10);
  db.run(`UPDATE users SET password = ? WHERE username = ?`, [hashed, username], function (err) {
    if (err || this.changes === 0) return res.status(400).json({ message: "User not found" });
    res.json({ message: "Password updated successfully" });
  });
});
// 🌐 PWA Install
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js')
    .then(() => console.log('✅ SW registered'))
    .catch(err => console.error('❌ SW failed:', err));
}
