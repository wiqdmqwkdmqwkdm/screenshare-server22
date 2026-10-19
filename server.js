const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Load configuration
const configPath = path.join(__dirname, 'config.json');
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : {
      port: process.env.PORT || 3000,
      secret: process.env.SESSION_SECRET || 'change-this-secret-key',
      streamKey: process.env.STREAM_KEY || 'default-stream-key',
      users: [
        { username: 'admin', password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' } // "password"
      ]
    };

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: config.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Store active connections
let streamerSocket = null;
const viewers = new Set();

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Routes
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

app.get('/login', (req, res) => {
  if (req.session.authenticated) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const user = config.users.find(u => u.username === username);

  if (user && await bcrypt.compare(password, user.password)) {
    req.session.authenticated = true;
    req.session.username = username;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/status', requireAuth, (req, res) => {
  res.json({
    streaming: !!streamerSocket,
    viewers: viewers.size,
    username: req.session.username
  });
});

// WebSocket handling
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const type = url.searchParams.get('type');
  const key = url.searchParams.get('key');

  if (type === 'streamer') {
    // Authenticate streamer
    if (key !== config.streamKey) {
      ws.close(1008, 'Invalid stream key');
      return;
    }

    // Disconnect existing streamer if any
    if (streamerSocket) {
      streamerSocket.close();
    }

    streamerSocket = ws;
    console.log('Streamer connected');

    // Notify all viewers
    viewers.forEach(viewer => {
      viewer.send(JSON.stringify({ type: 'streamer-connected' }));
    });

    ws.on('message', (data) => {
      // Relay frame to all viewers
      viewers.forEach(viewer => {
        if (viewer.readyState === WebSocket.OPEN) {
          viewer.send(data);
        }
      });
    });

    ws.on('close', () => {
      console.log('Streamer disconnected');
      streamerSocket = null;

      // Notify viewers
      viewers.forEach(viewer => {
        viewer.send(JSON.stringify({ type: 'streamer-disconnected' }));
      });
    });

  } else if (type === 'viewer') {
    // Viewer connection (authentication checked via cookie)
    const cookies = req.headers.cookie;
    if (!cookies || !cookies.includes('connect.sid')) {
      ws.close(1008, 'Not authenticated');
      return;
    }

    viewers.add(ws);
    console.log(`Viewer connected (${viewers.size} total)`);

    // Send initial status
    ws.send(JSON.stringify({
      type: streamerSocket ? 'streamer-connected' : 'streamer-disconnected'
    }));

    ws.on('close', () => {
      viewers.delete(ws);
      console.log(`Viewer disconnected (${viewers.size} remaining)`);
    });
  } else {
    ws.close(1008, 'Invalid connection type');
  }
});

// Start server
const PORT = config.port;
server.listen(PORT, () => {
  console.log(`\n🚀 Screen Share Server running on port ${PORT}`);
  console.log(`📱 Web interface: http://localhost:${PORT}`);
  console.log(`🔑 Stream key: ${config.streamKey}\n`);
});
