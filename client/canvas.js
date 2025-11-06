/**
 * Canvas drawing + rendering
 * Renders strokes deterministically from server-ordered history.
 */
const Canvas = (() => {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const stage = document.querySelector(".stage");

  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let drawing = false;
  let currentStroke = null;
  let tool = "brush";
  let color = "#2b6cb0";
  let width = 6;

  // State from server
  const state = {
    strokes: [],       // [{id, userId, tool, color, width, points: [{x,y}], active: true}]
    users: {},         // userId -> {name, color}
    cursors: {},       // userId -> {x, y, ts}
    self: { id: null, name: null, color: "#999" },
    room: "default",
    // Track IDs to handle late packets after clear
    knownIds: new Set(),
    blockIds: new Set(),
  };

  // Resize handling
  function resize() {
    const rect = stage.getBoundingClientRect();
    const w = Math.max(300, rect.width);
    const h = Math.max(300, rect.height);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    ctx.scale(dpr, dpr); 
    redraw();
  }
  window.addEventListener("resize", resize);
  resize();

  // Local input -> send stream events
  function pointerDown(e) {
    e.preventDefault();
    const p = getPos(e);
    drawing = true;
    currentStroke = {
      id: crypto.randomUUID(),
      tool, color, width,
      points: [p],
      active: true
    };
    // Add to local state immediately for preview
    state.strokes.push(currentStroke);
    redraw();
    WS.sendStrokeEvent({ type: "start", stroke: currentStroke });
  }
  function pointerMove(e) {
    const p = getPos(e);
    WS.sendCursor(p);
    if (!drawing || !currentStroke) return;
    const last = currentStroke.points[currentStroke.points.length - 1];
    if (distance(p, last) < 0.5) return; // downsample noisy points
    currentStroke.points.push(p);
    // Update local preview
    redraw();
    WS.sendStrokeEvent({ type: "append", id: currentStroke.id, points: [p] });
  }
  function pointerUp(e) {
    if (!drawing || !currentStroke) return;
    drawing = false;
    const strokeId = currentStroke.id;
    // Keep the stroke in local state - server will confirm it
    currentStroke = null;
    WS.sendStrokeEvent({ type: "end", id: strokeId });
  }

  // Helpers
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
    return { x: +x.toFixed(2), y: +y.toFixed(2) };
  }
  function distance(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }

  // Rendering
  function redraw() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.width / dpr;
    const h = rect.height || canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);
    // Render all active strokes - ensure strokes persist
    for (const s of state.strokes) {
      if (s.active === false) continue; // Skip inactive strokes
      // Defensive check: ensure stroke has points before drawing
      if (!s.points || s.points.length === 0) continue;
      drawStroke(ctx, s);
    }
    drawCursors();
  }

  function drawStroke(ctx, s) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = s.width;
    if (s.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = s.color;
    }
    ctx.beginPath();
    const pts = s.points;
    if (!pts || pts.length === 0) { ctx.restore(); return; }
    // Quadratic smoothing
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=1;i<pts.length-1;i++) {
      const midX = (pts[i].x + pts[i+1].x) / 2;
      const midY = (pts[i].y + pts[i+1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }
    if (pts.length > 1) {
      ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCursors() {
    // Remove old DOM cursor elements
    document.querySelectorAll(".user-cursor").forEach(n => n.remove());
    const rect = canvas.getBoundingClientRect();
    const now = performance.now();
    for (const [uid, cur] of Object.entries(state.cursors)) {
      if (uid === state.self.id) continue;
      if (!cur) continue;
      if (now - cur.ts > 2000) continue; // stale
      const u = state.users[uid];
      const el = document.createElement("div");
      el.className = "user-cursor";
      el.style.left = (cur.x + rect.left) + "px";
      el.style.top = (cur.y + rect.top) + "px";
      el.innerHTML = `<span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${u?.color||"#999"};margin-right:6px;"></span>${u?.name||"user"}`;
      document.body.appendChild(el);
    }
  }

  // ---- Public API ----
  function setTool(v){ tool = v; }
  function setColor(v){ color = v; }
  function setWidth(v){ width = +v; }

  // Socket wiring
  WS.socket.on("connect", () => {
    state.self.id = WS.socket.id;
    redraw();
  });

  WS.socket.on("room:joined", (payload) => {
    state.room = payload.room;
    state.users = payload.users;
    state.self.name = payload.self.name;
    state.self.color = payload.self.color;
    state.strokes = payload.strokes;
    // Reset id tracking on join
    state.knownIds = new Set(payload.strokes.map(s => s.id));
    state.blockIds = new Set();
    document.getElementById("roomName").textContent = state.room;
    document.getElementById("selfName").textContent = state.self.name;
    updateUserList();
    redraw();
  });

  WS.socket.on("users:update", (users) => {
    state.users = users;
    updateUserList();
  });

  WS.socket.on("cursor:update", ({ userId, pos }) => {
    state.cursors[userId] = { ...pos, ts: performance.now() };
    drawCursors();
  });

  WS.socket.on("stroke:apply", (s) => {
    // Receive streaming stroke data - server is authoritative
    // Ignore late packets for strokes that existed before last clear
    if (state.blockIds.has(s.id)) return;
    const existing = state.strokes.find(x => x.id === s.id);
    if (existing) {
      // Always update from server, but merge points intelligently to avoid losing local preview
      // If server has more or equal points, use server's version (server is authoritative)
      // If server has fewer points but we have points, keep our local version until server catches up
      if (s.points && s.points.length > 0) {
        if (s.points.length >= existing.points.length) {
          // Server has caught up or has more points - use server's version
          existing.points = s.points;
        }
        // Otherwise keep existing points (they're more recent from local input)
      } else if (s.points && s.points.length === 0 && existing.points.length === 0) {
        // Both empty, use server's version
        existing.points = s.points;
      }
      // Always update other properties from server, but preserve active if not specified
      if (s.active !== undefined) {
        existing.active = s.active;
      } else if (existing.active === undefined) {
        // Default to active if not set
        existing.active = true;
      }
      if (s.tool !== undefined) existing.tool = s.tool;
      if (s.color !== undefined) existing.color = s.color;
      if (s.width !== undefined) existing.width = s.width;
      if (s.userId !== undefined) existing.userId = s.userId;
    } else {
      // New stroke from server - ensure it has active flag
      const newStroke = { ...s };
      if (newStroke.active === undefined) newStroke.active = true;
      if (!newStroke.points) newStroke.points = [];
      state.strokes.push(newStroke);
      state.knownIds.add(newStroke.id);
    }
    redraw();
  });

  WS.socket.on("history:reset", (strokes) => {
    state.strokes = strokes;
    // Reset id tracking on authoritative history update
    state.knownIds = new Set(strokes.map(s => s.id));
    state.blockIds = new Set();
    redraw();
  });

  WS.socket.on("canvas:cleared", (strokes) => {
    // Block any late packets for previous strokes
    for (const id of state.knownIds) state.blockIds.add(id);
    state.strokes = strokes;
    state.knownIds = new Set();
    redraw();
  });

  function updateUserList() {
    const ul = document.getElementById("userList");
    ul.innerHTML = "";
    Object.entries(state.users).forEach(([id, u]) => {
      const li = document.createElement("li");
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.style.background = u.color;
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = (id === state.self.id ? "You ("+u.name+")" : u.name);
      li.appendChild(badge);
      li.appendChild(name);
      ul.appendChild(li);
    });
  }

  // Event listeners - use pointer events with fallbacks
  let isPointerSupported = window.PointerEvent !== undefined;
  
  function attachEvents() {
    if (isPointerSupported) {
      // Pointer events (modern browsers) - unified API for mouse/touch/pen
      canvas.addEventListener("pointerdown", pointerDown);
      canvas.addEventListener("pointermove", pointerMove);
      canvas.addEventListener("pointerup", pointerUp);
      canvas.addEventListener("pointerleave", pointerUp);
      canvas.addEventListener("pointercancel", pointerUp);
    } else {
      // Mouse events (fallback for older browsers)
      canvas.addEventListener("mousedown", pointerDown);
      canvas.addEventListener("mousemove", pointerMove);
      canvas.addEventListener("mouseup", pointerUp);
      canvas.addEventListener("mouseleave", pointerUp);
      
      // Touch events (mobile fallback)
      canvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const fakeEvent = {
          clientX: touch.clientX,
          clientY: touch.clientY,
          touches: [touch],
          preventDefault: () => e.preventDefault()
        };
        pointerDown(fakeEvent);
      });
      canvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const fakeEvent = {
          clientX: touch.clientX,
          clientY: touch.clientY,
          touches: [touch],
          preventDefault: () => e.preventDefault()
        };
        pointerMove(fakeEvent);
      });
      canvas.addEventListener("touchend", (e) => {
        e.preventDefault();
        if (e.touches.length === 0) {
          pointerUp(e);
        }
      });
      canvas.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        pointerUp(e);
      });
    }
  }
  
  // Attach events after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachEvents);
  } else {
    attachEvents();
  }

  return {
    setTool, setColor, setWidth,
    state, redraw
  };
})();
