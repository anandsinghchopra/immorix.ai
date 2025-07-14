require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs'); // ✅ bcryptjs instead of bcrypt
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { spawn } = require('child_process');
const db = require('./db');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(bodyParser.json());

const otpStore = {}; // In-memory OTP store

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ✅ Signup
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required' });

  const hashedPassword = await bcrypt.hash(password, 10);
  db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
    if (err) return res.status(400).json({ error: 'Username already exists' });
    res.status(200).json({ message: 'User created successfully' });
  });
});

// ✅ Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'User not found' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Login successful', token });
  });
});

// ✅ Chat with Ollama
app.post('/chat', (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) return res.status(400).json({ error: 'Message is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const ollama = spawn('ollama', ['run', 'mistral']);

  const lowerCaseMsg = userMessage.toLowerCase();
  const creatorKeywords = [
    "who created you", "your creator", "who made you",
    "who is your owner", "founder", "developer", "made you", "owner", "who built you"
  ];
  const isAskingAboutCreator = creatorKeywords.some(keyword =>
    lowerCaseMsg.includes(keyword)
  );
  const systemPrompt = isAskingAboutCreator
    ? `You are Immorix AI. Your creator is Anand Singh Chopra. Never call yourself Mistral.`
    : ``;

  const prompt = `
${systemPrompt}
User: ${userMessage}
`.trim();

  ollama.stdout.on('data', (data) => {
    res.write(data.toString());
  });

  ollama.stderr.on('data', (data) => {
    console.error('stderr:', data.toString());
  });

  ollama.on('error', (err) => {
    console.error('Spawn error:', err);
    res.write('❌ Error generating response');
    res.end();
  });

  ollama.on('close', () => {
    res.end();
  });

  ollama.stdin.write(prompt);
  ollama.stdin.end();
});

// ✅ Save chat
app.post('/api/chat/save', (req, res) => {
  const { chat_id, role, message } = req.body;
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const user = jwt.verify(token, JWT_SECRET);
    db.run(
      `INSERT INTO chats (user_id, chat_id, role, message) VALUES (?, ?, ?, ?)`,
      [user.id, chat_id, role, message],
      (err) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json({ success: true });
      }
    );
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// ✅ Get chat list
app.get('/api/chat/list', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const user = jwt.verify(token, JWT_SECRET);
    db.all(
      `SELECT DISTINCT chat_id FROM chats WHERE user_id = ? ORDER BY timestamp DESC`,
      [user.id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json(rows.map(r => r.chat_id));
      }
    );
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// ✅ Get chat messages by chat_id
app.get('/api/chat/:chat_id', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const chat_id = req.params.chat_id;
  try {
    const user = jwt.verify(token, JWT_SECRET);
    db.all(
      `SELECT role, message FROM chats WHERE user_id = ? AND chat_id = ? ORDER BY timestamp ASC`,
      [user.id, chat_id],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json(rows);
      }
    );
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// ✅ Send OTP for reset
app.post('/send-otp', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  otpStore[email] = { otp, expiresAt };

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Immorix - Password Reset OTP",
    text: `Your OTP is: ${otp}. It will expire in 5 minutes.`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) return res.status(500).json({ error: "Email send failed" });
    res.json({ message: "OTP sent to email" });
  });
});

// ✅ Verify OTP
app.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  const record = otpStore[email];

  if (!record) return res.status(400).json({ error: "No OTP found" });
  if (Date.now() > record.expiresAt) return res.status(400).json({ error: "OTP expired" });
  if (record.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });

  delete otpStore[email];
  res.json({ success: true });
});

// ✅ Reset password with OTP verified
app.post('/reset-password-email', async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) return res.status(400).json({ error: "Fields required" });

  const hashed = await bcrypt.hash(newPassword, 10);
  db.run(`UPDATE users SET password = ? WHERE username = ?`, [hashed, email], function (err) {
    if (err || this.changes === 0) return res.status(400).json({ error: "User not found" });
    res.json({ message: "Password updated" });
  });
});

// ✅ Root check
app.get('/', (req, res) => {
  res.send('🚀 Immorix AI Backend is Running!');
});

// ✅ Start server
app.listen(port, () => {
  console.log(`✅ Immorix Backend running at http://localhost:${port}`);
});

