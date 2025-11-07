/**
 * WebSocket (Socket.IO) client abstraction
 */
const WS = (() => {
  let socket = null;
  let latencyCb = () => {};
  let wsUrl = null;
  let socketInitialized = false;
  
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
      });
      
      socket.on('disconnect', () => {
        console.log('❌ Disconnected from WebSocket server');
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
      } else {
        // Queue the event if socket isn't ready yet
        console.warn('Socket not connected, queuing stroke event:', evt.type);
        const trySend = () => {
          if (socket && socket.connected) {
            socket.emit("stroke:event", evt);
          } else {
            setTimeout(trySend, 100);
          }
        };
        trySend();
      }
    },
    requestUndo() { 
      if (socket && socket.connected) {
        socket.emit("history:undo");
      } else {
        // Queue the request if socket isn't ready yet (max 5 seconds wait)
        let attempts = 0;
        const maxAttempts = 50;
        const tryUndo = () => {
          if (socket && socket.connected) {
            socket.emit("history:undo");
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(tryUndo, 100);
          } else {
            console.error('Failed to send undo request: socket not connected');
          }
        };
        tryUndo();
      }
    },
    requestRedo() { 
      if (socket && socket.connected) {
        socket.emit("history:redo");
      } else {
        // Queue the request if socket isn't ready yet (max 5 seconds wait)
        let attempts = 0;
        const maxAttempts = 50;
        const tryRedo = () => {
          if (socket && socket.connected) {
            socket.emit("history:redo");
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(tryRedo, 100);
          } else {
            console.error('Failed to send redo request: socket not connected');
          }
        };
        tryRedo();
      }
    },
    requestClear() { 
      if (socket && socket.connected) {
        socket.emit("canvas:clear");
      } else {
        // Queue the request if socket isn't ready yet (max 5 seconds wait)
        let attempts = 0;
        const maxAttempts = 50;
        const tryClear = () => {
          if (socket && socket.connected) {
            socket.emit("canvas:clear");
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(tryClear, 100);
          } else {
            console.error('Failed to send clear request: socket not connected');
          }
        };
        tryClear();
      }
    },
    sendCursor(pos) { 
      if (socket && socket.connected) {
        socket.volatile.emit("cursor:update", pos);
      }
    },
  };
})();
