/**
 * WebSocket (Socket.IO) client abstraction
 */
const WS = (() => {
  let socket = null;
  let latencyCb = () => {};
  let wsUrl = null;
  let socketInitialized = false;

  // Queue actions until socket is connected and joined to a room
  const pendingActions = [];
  let lastJoinPayload = null;
  let joinPending = false;

  function isConnected() {
    return !!(socket && socket.connected);
  }

  function flushPending() {
    if (!isConnected() || joinPending) return;
    while (pendingActions.length) {
      const { action, description } = pendingActions.shift();
      try {
        action(socket);
      } catch (err) {
        console.error(`Failed to run queued ${description || "action"}`, err);
      }
    }
  }

  function enqueueAction(action, description) {
    pendingActions.push({ action, description });
    flushPending();
  }

  function sendJoinIfNeeded() {
    if (!joinPending || !lastJoinPayload) return;
    if (!isConnected()) return;
    socket.emit("room:join", lastJoinPayload);
    joinPending = false;
    flushPending();
  }
  
  // Wait for WebSocket URL to be ready before initializing
  async function waitForUrl() {
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
      // Local development - use same origin
      return window.location.origin;
    }
    
    // Production - wait for URL to be set or fetch from API
    if (window.__WS_URL__) {
      return window.__WS_URL__;
    }
    
    // Wait a bit for the async script in index.html to set it
    let attempts = 0;
    while (attempts < 50 && !window.__WS_URL__ && !window.__WS_URL_READY__) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (window.__WS_URL__) {
      return window.__WS_URL__;
    }
    
    // If still not set, try fetching from API
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const config = await response.json();
        if (config && config.wsUrl) {
          window.__WS_URL__ = config.wsUrl;
          return config.wsUrl;
        }
      }
    } catch (error) {
      console.warn('Could not fetch WebSocket URL from API:', error);
    }
    
    // Final fallback
    return 'https://collaborative-canvas-production-48b3.up.railway.app';
  }
  
  function initSocket() {
    if (socketInitialized) return;
    
    waitForUrl().then(url => {
      wsUrl = url;
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
        if (lastJoinPayload) {
          joinPending = true;
          sendJoinIfNeeded();
        } else {
          flushPending();
        }
      });
      
      socket.on('disconnect', () => {
        console.log('❌ Disconnected from WebSocket server');
        if (lastJoinPayload) {
          joinPending = true;
        }
      });
      
      socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        console.error('Attempted to connect to:', wsUrl);
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
      
      socketInitialized = true;
    }).catch(error => {
      console.error('Failed to initialize WebSocket:', error);
      // Create a dummy socket to prevent errors
      socket = {
        connected: false,
        id: null,
        on: () => {},
        emit: () => {},
        volatile: { emit: () => {} },
        disconnect: () => {}
      };
      socketInitialized = true;
    });
  }
  
  // Initialize socket when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSocket);
  } else {
    // Small delay to ensure window.__WS_URL__ is set
    setTimeout(initSocket, 100);
  }

  // Create a socket proxy that allows event listeners to be attached even before connection
  const socketProxy = {
    get id() { return socket?.id; },
    get connected() { return socket?.connected || false; },
    on: function(event, callback) {
      if (socket) {
        socket.on(event, callback);
      } else {
        // Queue listener to attach when socket is ready
        const attachListener = () => {
          if (socket) {
            socket.on(event, callback);
          } else {
            setTimeout(attachListener, 100);
          }
        };
        attachListener();
      }
    },
    emit: function(...args) {
      if (socket && socket.connected) {
        socket.emit(...args);
      }
    },
    get volatile() {
      return {
        emit: function(...args) {
          if (socket && socket.connected) {
            socket.volatile.emit(...args);
          }
        }
      };
    },
    disconnect: function() {
      if (socket) socket.disconnect();
    }
  };

  return {
    get socket() { return socket || socketProxy; },
    onLatency(cb) { latencyCb = cb; },
    join(room, name) {
      lastJoinPayload = { room, name };
      joinPending = true;
      sendJoinIfNeeded();
    },
    sendStrokeEvent(evt) {
      enqueueAction(sock => {
        sock.emit("stroke:event", evt);
      }, `stroke:${evt.type}`);
    },
    requestUndo() { 
      enqueueAction(sock => {
        sock.emit("history:undo");
      }, "history:undo");
    },
    requestRedo() { 
      enqueueAction(sock => {
        sock.emit("history:redo");
      }, "history:redo");
    },
    requestClear() { 
      enqueueAction(sock => {
        sock.emit("canvas:clear");
      }, "canvas:clear");
    },
    sendCursor(pos) { 
      if (socket && socket.connected) {
        socket.volatile.emit("cursor:update", pos);
      }
    },
  };
})();
