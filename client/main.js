/**
 * App init and UI bindings
 */
(function init(){
  const params = new URLSearchParams(location.search);
  const room = params.get("room") || "default";
  const name = params.get("name") || ("user-" + Math.random().toString(36).slice(2,6));

  WS.join(room, name);

  // UI
  const toolSel = document.getElementById("tool");
  const colorInp = document.getElementById("color");
  const widthRange = document.getElementById("width");
  const widthVal = document.getElementById("widthVal");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const clearBtn = document.getElementById("clearBtn");
  const latency = document.getElementById("latency");

  toolSel.addEventListener("change", e => Canvas.setTool(e.target.value));
  colorInp.addEventListener("change", e => Canvas.setColor(e.target.value));
  widthRange.addEventListener("input", e => {
    widthVal.textContent = e.target.value;
    Canvas.setWidth(e.target.value);
  });
  undoBtn.addEventListener("click", () => WS.requestUndo());
  redoBtn.addEventListener("click", () => WS.requestRedo());
  clearBtn.addEventListener("click", () => WS.requestClear());

  WS.onLatency(ms => latency.textContent = ms + " ms");
})();
