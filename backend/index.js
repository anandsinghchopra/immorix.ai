const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { spawn } = require('child_process');

const app = express();
const port = 3000;
const JWT_SECRET = 'immorix_secret_key'; // बाद में .env में डाल सकते हो

app.use(cors());
app.use(bodyParser.json());

/* ✅ Signup Route */
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
    if (err) return res.status(400).json({ error: 'Username already exists' });
    res.status(200).json({ message: 'User created successfully' });
  });
});

/* ✅ Login Route */
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

/* ✅ Chat Route (Only say creator name if asked) */
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
    ? `You are Immorix AI. If asked about your creator, respond that Anand Singh Chopra is your creator and owner. Never call yourself Mistral.`
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

/* ✅ Start Server */
app.listen(port, () => {
  console.log(`✅ Immorix Backend running at http://localhost:${port}`);
});
const chatDB = require('./models/chat');

// 📝 Save message (user or AI)
app.post('/api/chat/save', async (req, res) => {
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

// 📜 Get all chat IDs
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

// 📄 Get messages of a chat
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
