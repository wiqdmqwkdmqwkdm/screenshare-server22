# Screen Share Server

Remote screen sharing server with authentication and secure access.

## Features

- 🔐 Password-protected login
- 🌐 Remote access from anywhere
- 📱 Mobile-friendly web viewer
- ⚡ Real-time WebSocket streaming
- 🔒 Secure WebSocket connections (WSS)

## Quick Deploy

### Deploy to Railway

1. Fork this repository
2. Go to https://railway.app
3. Click "New Project" → "Deploy from GitHub repo"
4. Select this repository
5. Generate domain and copy URL

### Deploy to Render

1. Fork this repository
2. Go to https://render.com
3. Create new Web Service
4. Connect your repo
5. Build command: `npm install`
6. Start command: `npm start`

## Configuration

Edit `config.json`:

```json
{
  "port": 3000,
  "secret": "your-session-secret",
  "streamKey": "your-stream-key",
  "users": [
    {
      "username": "admin",
      "password": "$2a$10$hashedpassword"
    }
  ]
}
```

**⚠️ IMPORTANT**: Change default passwords immediately!

### Generate Password Hash

Use https://bcrypt-generator.com/ with 10 rounds.

## Usage

### Desktop Client

1. Run the desktop client app
2. Enter server URL: `wss://your-app-url.com`
3. Enter stream key from config
4. Click "Connect & Stream"

### View Stream

1. Open browser: `https://your-app-url.com`
2. Login with credentials from config.json
3. Watch your screen in real-time!

## Environment Variables (Optional)

- `PORT`: Server port (default: 3000)
- `SESSION_SECRET`: Session encryption key
- `STREAM_KEY`: Authentication key for streamers
- `NODE_ENV`: Set to `production` for deployment

## Local Development

```bash
npm install
npm start
```

Open http://localhost:3000

## Security

- Change default passwords immediately
- Use strong stream keys
- Enable HTTPS in production (automatic on Railway/Render)
- Don't share your stream key

## Requirements

- Node.js 18+
- Modern browser for viewing

## License

MIT
