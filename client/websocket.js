/**
 * WebSocket (Socket.IO) client abstraction
 */
const WS = (() => {
  const socket = io({ transports: ["websocket"] });
  let latencyCb = () => {};

  // basic ping-pong latency
  setInterval(() => {
    const start = performance.now();
    socket.volatile.emit("ping:latency", () => {
      const ms = Math.round(performance.now() - start);
      latencyCb(ms);
    });
  }, 2000);

  return {
    socket,
    onLatency(cb) { latencyCb = cb; },
    join(room, name) {
      socket.emit("room:join", { room, name });
    },
    sendStrokeEvent(evt) {
      // Use reliable delivery so other clients see strokes in-progress
      socket.emit("stroke:event", evt);
    },
    requestUndo() { socket.emit("history:undo"); },
    requestRedo() { socket.emit("history:redo"); },
    requestClear() { socket.emit("canvas:clear"); },
    sendCursor(pos) { socket.volatile.emit("cursor:update", pos); },
  };
})();
