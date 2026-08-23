const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.ensureDirSync(DATA_DIR);
if (!fs.existsSync(DB_FILE)) {
  fs.writeJsonSync(DB_FILE, {
    users: [],
    games: [],
    scripts: [],
    scriptChats: {},
    pendingGames: [],
    pendingScripts: []
  });
}

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Seed games from games.json if DB empty
function seedGames() {
  const db = fs.readJsonSync(DB_FILE);
  const gamesJsonPath = path.join(__dirname, 'games.json');
  if (fs.existsSync(gamesJsonPath) && db.games.length === 0) {
    const seed = fs.readJsonSync(gamesJsonPath);
    seed.forEach(g => {
      db.games.push({
        id: g.id,
        title: g.title,
        description: g.description || '',
        category: g.category || 'Uncategorized',
        file: g.file || null,
        html: null,
        thumbnail: g.thumbnail || '',
        approved: true,
        views: 0,
        author: 'system',
        createdAt: Date.now()
      });
    });
    fs.writeJsonSync(DB_FILE, db, { spaces: 2 });
  }
}
seedGames();

function loadDB() { return fs.readJsonSync(DB_FILE); }
function saveDB(db) { fs.writeJsonSync(DB_FILE, db, { spaces: 2 }); }

// Auth
app.post('/api/register', (req, res) => {
  const db = loadDB();
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  if (db.users.some(u => u.username === username)) return res.status(400).json({ error: 'Username exists' });
  const user = { username, password, role: 'user', mutedUntil: 0, bannedUntil: 0 };
  db.users.push(user);
  saveDB(db);
  res.json({ user: { username, role: 'user' } });
});

app.post('/api/login', (req, res) => {
  const db = loadDB();
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username);
  if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.bannedUntil && Date.now() < user.bannedUntil) return res.status(403).json({ error: 'Banned' });
  res.json({ user: { username: user.username, role: user.role } });
});

// Games
app.get('/api/games', (req, res) => {
  const db = loadDB();
  res.json(db.games.filter(g => g.approved));
});

app.post('/api/games', (req, res) => {
  const db = loadDB();
  const { title, description, category, html, thumbnail, author } = req.body;
  if (!title || !html || !author) return res.status(400).json({ error: 'Missing fields' });
  db.pendingGames.push({
    id: 'game_' + Date.now(),
    title,
    description: description || '',
    category: category || 'Uncategorized',
    html,
    thumbnail: thumbnail || '',
    approved: false,
    views: 0,
    author,
    createdAt: Date.now()
  });
  saveDB(db);
  res.json({ message: 'Submitted for review' });
});

app.delete('/api/games/:id', (req, res) => {
  const db = loadDB();
  db.games = db.games.filter(g => g.id !== req.params.id);
  db.pendingGames = db.pendingGames.filter(g => g.id !== req.params.id);
  saveDB(db);
  res.json({ message: 'Game removed' });
});

app.post('/api/games/:id/approve', (req, res) => {
  const db = loadDB();
  const idx = db.pendingGames.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const game = db.pendingGames.splice(idx, 1)[0];
  game.approved = true;
  db.games.push(game);
  saveDB(db);
  res.json({ message: 'Approved' });
});

// Scripts
app.get('/api/scripts', (req, res) => {
  const db = loadDB();
  res.json(db.scripts.filter(s => s.approved));
});

app.post('/api/scripts', (req, res) => {
  const db = loadDB();
  const { title, code, author } = req.body;
  if (!title || !code || !author) return res.status(400).json({ error: 'Missing fields' });
  db.pendingScripts.push({
    id: 'script_' + Date.now(),
    title,
    code,
    author,
    approved: false,
    createdAt: Date.now(),
    image: ''
  });
  saveDB(db);
  res.json({ message: 'Submitted for review' });
});

app.delete('/api/scripts/:id', (req, res) => {
  const db = loadDB();
  db.scripts = db.scripts.filter(s => s.id !== req.params.id);
  db.pendingScripts = db.pendingScripts.filter(s => s.id !== req.params.id);
  saveDB(db);
  res.json({ message: 'Script removed' });
});

app.post('/api/scripts/:id/approve', (req, res) => {
  const db = loadDB();
  const idx = db.pendingScripts.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const script = db.pendingScripts.splice(idx, 1)[0];
  script.approved = true;
  db.scripts.push(script);
  saveDB(db);
  res.json({ message: 'Approved' });
});

// Script Chat
app.get('/api/scripts/:id/chat', (req, res) => {
  const db = loadDB();
  res.json(db.scriptChats[req.params.id] || []);
});

app.post('/api/scripts/:id/chat', (req, res) => {
  const db = loadDB();
  const { username, text } = req.body;
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.mutedUntil && Date.now() < user.mutedUntil) return res.status(403).json({ error: 'Muted' });
  if (user.bannedUntil && Date.now() < user.bannedUntil) return res.status(403).json({ error: 'Banned' });
  if (!db.scriptChats[req.params.id]) db.scriptChats[req.params.id] = [];
  db.scriptChats[req.params.id].push({ username, text, timestamp: Date.now() });
  saveDB(db);
  res.json({ message: 'Sent' });
});

// Admin
app.get('/api/admin/pending', (req, res) => {
  const db = loadDB();
  res.json({ games: db.pendingGames, scripts: db.pendingScripts });
});

app.post('/api/admin/moderate', (req, res) => {
  const db = loadDB();
  const { username, action, duration } = req.body;
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (action === 'mute') user.mutedUntil = Date.now() + (duration || 5*60*1000);
  else if (action === 'ban') user.bannedUntil = duration === Infinity ? Infinity : Date.now() + duration;
  saveDB(db);
  res.json({ message: 'Moderated' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
