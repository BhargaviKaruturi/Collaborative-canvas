# Deployment Guide for Vercel

## Overview

This collaborative canvas app consists of:
1. **Frontend** (client/) - Static files deployed to Vercel
2. **Backend** (server/) - WebSocket server that needs to be deployed separately (Railway, Render, Fly.io, etc.)

## Why Separate Deployment?

Vercel doesn't support WebSocket servers natively. The frontend is deployed on Vercel, while the WebSocket server must run on a platform that supports persistent connections.

## Setup Instructions

### 1. Deploy the WebSocket Server

Deploy the server to a platform that supports WebSockets:
- **Railway** (recommended): https://railway.app
- **Render**: https://render.com
- **Fly.io**: https://fly.io
- **Heroku**: https://heroku.com

Make sure to note your server URL (e.g., `https://your-app.up.railway.app`)

### 2. Configure Vercel Environment Variables

1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add a new variable:
   - **Name**: `WS_URL`
   - **Value**: Your WebSocket server URL (e.g., `https://your-app.up.railway.app`)
   - **Environment**: Production (and Preview if needed)

### 3. Deploy to Vercel

The app will automatically:
- Serve static files from `/client`
- Provide `/api/config` endpoint that returns the WebSocket URL
- Connect to your WebSocket server

### 4. Verify Deployment

1. Open your Vercel deployment URL
2. Open browser console (F12)
3. You should see: "Connecting to WebSocket server at: [your-server-url]"
4. You should see: "✅ Connected to WebSocket server"
5. Try drawing on the canvas - it should work!

## Troubleshooting

### Drawing not working?

1. **Check browser console** for WebSocket connection errors
2. **Verify environment variable** `WS_URL` is set in Vercel
3. **Check server logs** to ensure the WebSocket server is running
4. **Verify CORS** - The server should allow connections from your Vercel domain

### Connection errors?

- Make sure your WebSocket server is running and accessible
- Check that the `WS_URL` environment variable is correctly set
- Verify the server allows WebSocket connections from your Vercel domain
- Check browser console for specific error messages

## Local Development

For local development, the app will automatically use `window.location.origin` to connect to a local server.

Run the server locally:
```bash
cd server
npm install
npm start
```

Then open `http://localhost:8080/client/index.html`

