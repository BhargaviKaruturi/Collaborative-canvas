/**
 * Room registry and user management
 */
const palette = [
  "#e11d48", "#f59e0b", "#84cc16", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"
];

class Rooms {
  constructor() {
    this.rooms = new Map(); // roomId -> { users: Map<socketId, {name,color}>, state: DrawingState }
  }
  ensure(roomId, makeState) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        users: new Map(),
        state: makeState(),
      });
    }
    return this.rooms.get(roomId);
  }
  addUser(roomId, socketId, name) {
    const room = this.rooms.get(roomId);
    const color = palette[Math.floor(Math.random()*palette.length)];
    room.users.set(socketId, { name, color });
    return { id: socketId, name, color };
  }
  removeUser(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.users.delete(socketId);
    if (room.users.size === 0) {
      // optional: persist/cleanup
    }
  }
  usersObj(roomId) {
    const room = this.rooms.get(roomId);
    const obj = {};
    for (const [id, u] of room.users.entries()) obj[id] = u;
    return obj;
  }
}

module.exports = Rooms;
