const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: config.secret,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Store screen share sessions
const sessions = new Map(); // sessionId -> { presenter: ws, viewers: Set, pieceColor: 'white'|'black' }

function requireAuth(req, res, next) {
  if (req.session.authenticated) next();
  else res.redirect('/login');
}

// Routes
app.get('/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'share.html')));
app.get('/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/watch/:sessionId', (req, res) => res.sendFile(path.join(__dirname, 'public', 'watch.html')));

app.post('/login', async (req, res) => {
  const { username } = req.body;
  const user = config.users.find(u => u.username === username);
  if (user) {
    req.session.authenticated = true;
    req.session.username = username;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid username' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/status', requireAuth, (req, res) => {
  res.json({ username: req.session.username });
});

app.get('/api/session/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (session) {
    res.json({
      active: !!session.presenter,
      pieceColor: session.pieceColor || 'white',
      viewers: session.viewers.size
    });
  } else {
    res.json({ active: false });
  }
});

// WebSocket handling
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('session');

  if (url.pathname === '/share' && sessionId) {
    // Presenter (phone sharing screen)
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, { presenter: null, viewers: new Set(), pieceColor: 'white' });
    }

    const session = sessions.get(sessionId);
    if (session.presenter) session.presenter.close();

    session.presenter = ws;
    console.log(`📱 Presenter connected: ${sessionId}`);

    // Notify all viewers
    session.viewers.forEach(v => {
      if (v.readyState === WebSocket.OPEN) {
        v.send(JSON.stringify({ type: 'presenter-connected', pieceColor: session.pieceColor }));
      }
    });

    ws.on('message', (data) => {
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'set_color') {
            session.pieceColor = msg.color;
            console.log(`♟️  Session ${sessionId} playing as: ${msg.color}`);
            // Notify viewers of color change
            session.viewers.forEach(v => {
              if (v.readyState === WebSocket.OPEN) {
                v.send(JSON.stringify({ type: 'color_update', color: msg.color }));
              }
            });
          }
        } catch (e) {}
      } else {
        // Binary frame - relay to all viewers
        session.viewers.forEach(v => {
          if (v.readyState === WebSocket.OPEN) {
            v.send(data);
          }
        });
      }
    });

    ws.on('close', () => {
      console.log(`Presenter disconnected: ${sessionId}`);
      session.presenter = null;
      session.viewers.forEach(v => {
        if (v.readyState === WebSocket.OPEN) {
          v.send(JSON.stringify({ type: 'presenter-disconnected' }));
        }
      });
    });

    // Send viewer count updates
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'viewer_count',
          count: session.viewers.size
        }));
      } else {
        clearInterval(interval);
      }
    }, 3000);

  } else if (url.pathname === '/watch' && sessionId) {
    // Viewer (PC/bot watching)
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, { presenter: null, viewers: new Set(), pieceColor: 'white' });
    }

    const session = sessions.get(sessionId);
    session.viewers.add(ws);
    console.log(`👁️  Viewer connected: ${sessionId} (${session.viewers.size} total)`);

    // Send initial status
    ws.send(JSON.stringify({
      type: session.presenter ? 'presenter-connected' : 'presenter-disconnected',
      pieceColor: session.pieceColor
    }));

    ws.on('close', () => {
      session.viewers.delete(ws);
      console.log(`Viewer disconnected: ${sessionId} (${session.viewers.size} remaining)`);
    });
  } else {
    ws.close(1008, 'Invalid connection');
  }
});

const PORT = process.env.PORT || config.port;
server.listen(PORT, () => {
  console.log(`\n🚀 Screen Share Server running on port ${PORT}`);
  console.log(`📱 Open: http://localhost:${PORT}\n`);
});
