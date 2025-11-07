/**
 * WebSocket (Socket.IO) client abstraction
 */
const WS = (() => {
  let socket = null;
  let latencyCb = () => {};
  
  // Get WebSocket URL - try to get from window first, otherwise use same origin
  let wsUrl = window.__WS_URL__ || window.location.origin;
  
  // If URL is not set yet, wait a bit for it
  if (!window.__WS_URL__ && !window.__WS_URL_READY__) {
    // For production, try to fetch from API
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
    
    if (!isLocalhost) {
      // Fetch config asynchronously and reconnect if needed
      fetch('/api/config')
        .then(res => res.ok ? res.json() : null)
        .then(config => {
          if (config && config.wsUrl && config.wsUrl !== wsUrl) {
            console.log('Updating WebSocket URL to:', config.wsUrl);
            wsUrl = config.wsUrl;
            // Reconnect with new URL
            if (socket) {
              socket.disconnect();
            }
            initSocket();
          }
        })
        .catch(err => {
          console.warn('Could not fetch WebSocket URL from API, using fallback:', err);
          // Use Railway URL as fallback
          if (wsUrl === window.location.origin) {
            wsUrl = 'https://collaborative-canvas-production-48b3.up.railway.app';
            if (socket) {
              socket.disconnect();
            }
            initSocket();
          }
        });
    }
  }
  
  function initSocket() {
    console.log('Connecting to WebSocket server at:', wsUrl);
    
    socket = io(wsUrl, {
      transports: ["websocket", "polling"], // Add polling as fallback for better compatibility
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000
    });
    
    socket.on('connect', () => {
      console.log('✅ Connected to WebSocket server');
    });
    
    socket.on('disconnect', () => {
      console.log('❌ Disconnected from WebSocket server');
    });
    
    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });
    
    // basic ping-pong latency
    setInterval(() => {
      if (socket && socket.connected) {
        const start = performance.now();
        socket.volatile.emit("ping:latency", () => {
          const ms = Math.round(performance.now() - start);
          latencyCb(ms);
        });
      }
    }, 2000);
  }
  
  // Initialize socket immediately
  initSocket();

  return {
    get socket() { return socket; },
    onLatency(cb) { latencyCb = cb; },
    join(room, name) {
      if (socket && socket.connected) {
        socket.emit("room:join", { room, name });
      } else {
        // Wait for connection
        socket?.on('connect', () => {
          socket.emit("room:join", { room, name });
        });
      }
    },
    sendStrokeEvent(evt) {
      if (socket && socket.connected) {
        // Use reliable delivery so other clients see strokes in-progress
        socket.emit("stroke:event", evt);
      }
    },
    requestUndo() { 
      if (socket && socket.connected) {
        socket.emit("history:undo");
      }
    },
    requestRedo() { 
      if (socket && socket.connected) {
        socket.emit("history:redo");
      }
    },
    requestClear() { 
      if (socket && socket.connected) {
        socket.emit("canvas:clear");
      }
    },
    sendCursor(pos) { 
      if (socket && socket.connected) {
        socket.volatile.emit("cursor:update", pos);
      }
    },
  };
})();
