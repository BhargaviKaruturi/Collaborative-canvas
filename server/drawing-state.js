/**
 * Authoritative drawing state stored on server per room.
 * - strokes: ordered list of all strokes (with 'active' flag)
 * - undo/redo operate globally on the last/next active stroke
 * - eraser is replayed via destination-out on clients for deterministic results
 */
class DrawingState {
  constructor() {
    this.strokes = [];   // { id, userId, tool, color, width, points: [], active: true }
    this.index = new Map(); // id -> stroke
    this.redoStack = []; // holds deactivated strokes for redo
  }

  snapshot() {
    // Return minimal JSON for clients
    return this.strokes.map(s => ({
      id: s.id, userId: s.userId, tool: s.tool, color: s.color, width: s.width,
      points: s.points, active: s.active
    }));
  }

  startStroke({ id, userId, tool, color, width, point }) {
    if (this.index.has(id)) return this.index.get(id);
    const stroke = { id, userId, tool, color, width, points: [point], active: true };
    this.strokes.push(stroke);
    this.index.set(id, stroke);
    this.redoStack.length = 0; // new action invalidates redo history
    return stroke;
  }

  appendPoints(id, pts) {
    const s = this.index.get(id);
    if (!s) return null;
    // downsample server-side too, avoid duplicates
    for (const p of pts) {
      const last = s.points[s.points.length - 1];
      if (!last || Math.hypot(p.x-last.x, p.y-last.y) >= 0.5) {
        s.points.push(p);
      }
    }
    return s;
  }

  endStroke(id) {
    // no-op; we already stream live
    return this.index.get(id) || null;
  }

  undo() {
    // find last active stroke
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i];
      if (s.active) {
        s.active = false;
        this.redoStack.push(s);
        return true;
      }
    }
    return false;
  }

  redo() {
    const s = this.redoStack.pop();
    if (!s) return false;
    s.active = true;
    return true;
  }

  clear(userId) {
    if (this.strokes.length === 0) return false;
    // Wipe all strokes and indexes; broadcast will send empty snapshot
    this.strokes = [];
    this.index.clear();
    this.redoStack = [];
    return true;
  }
}

module.exports = DrawingState;
