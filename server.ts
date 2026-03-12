import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-demo';

app.use(express.json());

// Setup SQLite Database
const dbPath = path.join(__dirname, 'database.db');
const db = new Database(dbPath);

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(parent_id) REFERENCES folders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    folder_id TEXT,
    user_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    original_link TEXT,
    share_token TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE SET NULL
  );

  -- Drop FTS if exists to recreate with user_id
  DROP TABLE IF EXISTS documents_fts;
  CREATE VIRTUAL TABLE documents_fts USING fts5(
    title,
    content,
    user_id UNINDEXED,
    content='documents',
    content_rowid='rowid'
  );

  DROP TRIGGER IF EXISTS documents_ai;
  CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, title, content, user_id) VALUES (new.rowid, new.title, new.content, new.user_id);
  END;

  DROP TRIGGER IF EXISTS documents_ad;
  CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, content, user_id) VALUES('delete', old.rowid, old.title, old.content, old.user_id);
  END;

  DROP TRIGGER IF EXISTS documents_au;
  CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, content, user_id) VALUES('delete', old.rowid, old.title, old.content, old.user_id);
    INSERT INTO documents_fts(rowid, title, content, user_id) VALUES (new.rowid, new.title, new.content, new.user_id);
  END;
`);

// Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
};

// Auth Routes
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(400).json({ error: 'Username taken' });

    const isFirstUser = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
    const role = isFirstUser.count === 0 ? 'admin' : 'user';

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(id, username, hash, role);

    const token = jwt.sign({ id, username, role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id, username, role } });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Admin Routes
app.get('/api/admin/users', authenticate, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at FROM users').all();
  res.json(users);
});

// Folders Routes
app.get('/api/folders', authenticate, (req: any, res) => {
  const folders = db.prepare('SELECT * FROM folders WHERE user_id = ? ORDER BY name ASC').all(req.user.id);
  res.json(folders);
});

app.post('/api/folders', authenticate, (req: any, res) => {
  const { name, parent_id } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO folders (id, name, parent_id, user_id) VALUES (?, ?, ?, ?)').run(id, name, parent_id || null, req.user.id);
  res.json({ id, name, parent_id, user_id: req.user.id });
});

// Documents Routes
app.get('/api/documents/home', authenticate, (req: any, res) => {
  const recentAdded = db.prepare('SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').all(req.user.id);
  const recentOpened = db.prepare('SELECT * FROM documents WHERE user_id = ? ORDER BY last_opened_at DESC LIMIT 5').all(req.user.id);
  res.json({ recentAdded, recentOpened });
});

app.get('/api/documents', authenticate, (req: any, res) => {
  const { q, folder_id } = req.query;
  try {
    let query = 'SELECT * FROM documents WHERE user_id = ?';
    let params: any[] = [req.user.id];

    if (q) {
      query = `
        SELECT d.* 
        FROM documents d
        JOIN documents_fts f ON d.rowid = f.rowid
        WHERE documents_fts MATCH ? AND f.user_id = ?
      `;
      params = [q, req.user.id];
      
      if (folder_id && folder_id !== 'all') {
        if (folder_id === 'root') {
          query += ' AND d.folder_id IS NULL';
        } else {
          query += ' AND d.folder_id = ?';
          params.push(folder_id);
        }
      }
      query += ' ORDER BY rank';
    } else {
      if (folder_id && folder_id !== 'all') {
        if (folder_id === 'root') {
          query += ' AND folder_id IS NULL';
        } else {
          query += ' AND folder_id = ?';
          params.push(folder_id);
        }
      }
      query += ' ORDER BY created_at DESC';
    }

    const documents = db.prepare(query).all(...params);
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

const upload = multer({ dest: 'uploads/' });

app.post('/api/documents/upload', authenticate, upload.array('files', 50), (req: any, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    
    const { folder_id } = req.body;
    const targetFolder = folder_id === 'root' || !folder_id ? null : folder_id;
    
    const stmt = db.prepare(`
      INSERT INTO documents (id, title, content, folder_id, user_id, source_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const results = [];
    for (const file of req.files) {
      const title = file.originalname.replace('.md', '');
      const content = fs.readFileSync(file.path, 'utf-8');
      const id = uuidv4();
      stmt.run(id, title, content, targetFolder, req.user.id, 'md');
      fs.unlinkSync(file.path);
      results.push({ id, title });
    }

    res.status(201).json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

app.post('/api/documents/feishu', authenticate, (req: any, res) => {
  const { link, folder_id } = req.body;
  const targetFolder = folder_id === 'root' || !folder_id ? null : folder_id;
  const id = uuidv4();
  const title = 'Feishu Document ' + id.substring(0, 4);
  const content = `# ${title}\n\nThis is a mocked markdown representation of the Feishu document at: ${link}\n\n> Parsed via Zhiyan MCP (Mocked)\n\n## Content\n\nHere you would see the actual content extracted from Feishu.`;

  db.prepare(`
    INSERT INTO documents (id, title, content, folder_id, user_id, source_type, original_link)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, content, targetFolder, req.user.id, 'feishu', link);

  res.status(201).json({ id, title });
});

app.put('/api/documents/:id/open', authenticate, (req: any, res) => {
  db.prepare("UPDATE documents SET last_opened_at = datetime('now') WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  res.json({ success: true });
});

app.delete('/api/documents/:id', authenticate, (req: any, res) => {
  db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// Sharing
app.post('/api/documents/:id/share', authenticate, (req: any, res) => {
  const doc = db.prepare('SELECT share_token FROM documents WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id) as any;
  if (!doc) return res.status(404).json({ error: 'Not found' });
  
  if (doc.share_token) {
    return res.json({ token: doc.share_token });
  }
  
  const token = uuidv4();
  db.prepare('UPDATE documents SET share_token = ? WHERE id = ?').run(token, req.params.id);
  res.json({ token });
});

app.get('/api/shared/:token', (req, res) => {
  const doc = db.prepare(`
    SELECT d.title, d.content, d.source_type, d.original_link, d.created_at, u.username as author
    FROM documents d
    JOIN users u ON d.user_id = u.id
    WHERE d.share_token = ?
  `).get(req.params.token);
  
  if (!doc) return res.status(404).json({ error: 'Shared document not found' });
  res.json(doc);
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
