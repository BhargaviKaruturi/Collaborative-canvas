# Real-Time Collaborative Drawing Canvas

Vanilla JS + HTML5 Canvas for the client, Node.js + Socket.IO for the backend.
Multiple people can draw together in real time. Includes global undo/redo, eraser, user cursors, and online users list.

## ✨ Features
- Brush & eraser, color picker, adjustable stroke width
- Real-time live strokes (streamed), not just after finishing
- User presence with server-assigned colors
- Visible remote cursors with names
- Global **Undo/Redo** (applies to the latest/next active operation regardless of author)
- Room support via `?room=xyz`
- Clear canvas (modeled as an undoable "erase-all" operation)
- Lightweight protocol; batching of points; client prediction via immediate stroke creation

## 🧰 Tech Stack
- **Client:** Vanilla JavaScript + HTML5 Canvas + DOM
- **Server:** Node.js, Express, Socket.IO
- **No frameworks** on the frontend, no drawing libraries

## 🚀 Getting Started

```bash
npm install
npm start
```
Then open: `http://localhost:3000/client/index.html`

Optionally join a named room and set your display name:
```
http://localhost:3000/client/index.html?room=demo&name=Alice
```

Open the URL in multiple browser windows/tabs to test multi-user sync.

## 🧪 How to Test
- Open the app in 2+ tabs. Draw simultaneously to see live sync.
- Use Undo/Redo buttons; they act **globally** on the latest/next operation (regardless of which user created it).
- Try eraser tool; it uses `destination-out` blending for crisp erasing.
- Watch user list update as users connect/disconnect.
- See live cursors of other users moving around.

## ⚠️ Known Limitations
- History is in-memory per server instance (no persistence). Restarting the server clears state.
- Global undo/redo is “latest-op-wins” order. Per-user undo is not implemented.
- Basic throttling is applied via `.volatile` emits and point downsampling; further batching could be added.
- Clear is implemented as a giant erasing stroke rather than wiping bitmap, which keeps history consistent but can be heavy if used frequently.

## ⏱️ Time Spent
- Design & coding: ~5–6 hours
- Documentation: ~45 minutes
- Polish (styling, UX): ~30 minutes

## 📁 Project Structure
```
collaborative-canvas/
├── client/
│   ├── index.html
│   ├── style.css
│   ├── canvas.js
│   ├── websocket.js
│   └── main.js
├── server/
│   ├── server.js
│   ├── rooms.js
│   └── drawing-state.js
├── package.json
├── README.md
└── ARCHITECTURE.md
```
