# Architecture

## 1) Data Flow Diagram (High-level)

```
[Pointer events]
     │
     ▼
Client (Canvas)
  - Downsample points
  - Immediate local stroke (prediction)
  - Stream events to server
     │
     ▼
Server (Authoritative State)
  - start/append/end strokes
  - maintain ordered history + active flag
  - global undo/redo
  - broadcast updates
     │
     ▼
All Clients
  - update local history from server
  - redraw (deterministic re-render)
```

## 2) WebSocket Protocol (Socket.IO events)

**Client → Server**
- `room:join` `{ room, name }`
- `stroke:event`
  - `{"type":"start","stroke":{id, tool, color, width, points:[{x,y}]}}`
  - `{"type":"append","id":<strokeId>,"points":[{x,y}, ...]}`
  - `{"type":"end","id":<strokeId>}`
- `cursor:update` `{ x, y }` (volatile)
- `history:undo` *(global)*
- `history:redo`
- `canvas:clear`

**Server → Client**
- `room:joined` `{ room, users, self, strokes }`
- `users:update` `{ [userId]: {name,color}, ... }`
- `cursor:update` `{ userId, pos }` (other users only)
- `stroke:apply` `<stroke snapshot>` (sent frequently to stream points)
- `history:reset` `[strokes...]` (after undo/redo)
- `canvas:cleared` `[strokes...]` (after clear modeled as op)

## 3) Undo/Redo Strategy (Global)

- The server keeps `strokes[]` (append-only) and `active` flag per stroke.
- **Undo**: find the last stroke with `active===true`, flip to `false`, push to `redoStack`.
- **Redo**: pop from `redoStack`, set `active=true`.
- All clients receive `history:reset` with the **authoritative** array and re-render.
- This is **global** and author-agnostic, as requested.
- Clear is modeled as a large erasing stroke (so it can be undone like any other op).

## 4) Performance Decisions

- **Streaming & batching**: Points are downsampled both client and server (>0.5px delta). `socket.volatile` is used for high-frequency events (`append` and cursors) to drop frames under congestion.
- **Deterministic re-render**: Clients keep no raster cache; they replay strokes in order on every redraw, guaranteeing consistent canvases across users. Canvas is resized at DPR scale, and redraws are lightweight.
- **Smoothing**: Quadratic curve interpolation between points for smooth lines.
- **Conflict resolution**: Last-write-wins via stroke order. Eraser uses `destination-out` so overlap semantics remain stable when history is replayed.
- **Room isolation**: History and presence are scoped to a room, chosen via URL param.

## 5) Conflict Resolution

- Overlapping strokes are resolved by **temporal order** in `strokes[]`.
- Erasing is a stroke operation that removes prior pixels wherever it overlaps when replayed.
- Because clients always replay in order, every user ends up with the same bitmap even if they drew simultaneously.

## 6) Edge Cases & Handling

- **Late joiners**: Receive the full snapshot (`room:joined.strokes`) and draw immediately.
- **Network loss**: `volatile` events may drop, but frequent `stroke:apply` broadcasts contain full stroke arrays, so state heals naturally. Undo/redo emits full snapshots.
- **Resize**: Canvas replays vector history at any size/DPR → crisp results.
- **Security**: Room IDs are public; for interview scope, no auth. Input is shape-validated implicitly; hardening can be added with schema validation.
