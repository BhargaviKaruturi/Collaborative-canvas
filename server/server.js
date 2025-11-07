const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const { Server } = require("socket.io");
const Rooms = require("./rooms");
const DrawingState = require("./drawing-state");

const app = express();
app.use(cors());
app.use("/client", express.static(path.join(__dirname, "..", "client")));
app.get("/", (req, res) => res.redirect("/client/index.html"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = new Rooms();
function makeState(){ return new DrawingState(); }

io.on("connection", (socket) => {
  let roomId = null;

  socket.on("ping:latency", (cb) => cb && cb());

  socket.on("room:join", ({ room, name }) => {
    roomId = room || "default";
    socket.join(roomId);
    const roomObj = rooms.ensure(roomId, makeState);
    const user = rooms.addUser(roomId, socket.id, name || ("user-" + socket.id.slice(-4)));

    // Notify self with snapshot
    socket.emit("room:joined", {
      room: roomId,
      users: rooms.usersObj(roomId),
      self: user,
      strokes: roomObj.state.snapshot()
    });
    // Broadcast users update
    io.to(roomId).emit("users:update", rooms.usersObj(roomId));
  });

  socket.on("cursor:update", (pos) => {
    if (!roomId) return;
    socket.to(roomId).emit("cursor:update", { userId: socket.id, pos });
  });

  // Drawing stream
  socket.on("stroke:event", (evt) => {
    if (!roomId) return;
    const roomObj = rooms.ensure(roomId, makeState);
    const st = roomObj.state;
    const me = roomObj.users.get(socket.id) || { name: "user", color: "#999" };

    if (evt.type === "start") {
      const s = st.startStroke({
        id: evt.stroke.id,
        userId: socket.id,
        tool: evt.stroke.tool,
        color: evt.stroke.color,
        width: evt.stroke.width,
        point: evt.stroke.points[0]
      });
      io.to(roomId).emit("stroke:apply", {
        id: s.id, userId: s.userId, tool: s.tool, color: s.color, width: s.width, points: s.points, active: s.active
      });
      return;
    }

    if (evt.type === "append") {
      const s = st.appendPoints(evt.id, evt.points || []);
      if (!s) return;
      // Broadcast updated stroke (batched points)
      io.to(roomId).emit("stroke:apply", {
        id: s.id, userId: s.userId, tool: s.tool, color: s.color, width: s.width, points: s.points, active: s.active
      });
      return;
    }

    if (evt.type === "end") {
      const s = st.endStroke(evt.id);
      if (!s) return;
      io.to(roomId).emit("stroke:apply", {
        id: s.id, userId: s.userId, tool: s.tool, color: s.color, width: s.width, points: s.points, active: s.active
      });
      return;
    }
  });

  // Global undo/redo (acts on last/next active op regardless of author)
  socket.on("history:undo", () => {
    if (!roomId) return;
    const roomObj = rooms.ensure(roomId, makeState);
    if (roomObj.state.undo()) {
      io.to(roomId).emit("history:reset", roomObj.state.snapshot());
    }
  });
  socket.on("history:redo", () => {
    if (!roomId) return;
    const roomObj = rooms.ensure(roomId, makeState);
    if (roomObj.state.redo()) {
      io.to(roomId).emit("history:reset", roomObj.state.snapshot());
    }
  });

  // Clear -> modelled as an erasing stroke (keeps history consistent & undoable)
  socket.on("canvas:clear", () => {
    if (!roomId) return;
    const roomObj = rooms.ensure(roomId, makeState);
    if (roomObj.state.clear(socket.id)) {
      const snapshot = roomObj.state.snapshot();
      io.to(roomId).emit("canvas:cleared", snapshot);
      // Also emit history reset for clients that unify on this event
      io.to(roomId).emit("history:reset", snapshot);
    }
  });

  socket.on("disconnect", () => {
    if (!roomId) return;
    rooms.removeUser(roomId, socket.id);
    io.to(roomId).emit("users:update", rooms.usersObj(roomId));
  });
});

const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`✅ Server running on http://${HOST}:${PORT}`);
  console.log(`✅ WebSocket server ready for connections`);
});

