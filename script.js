"use strict";

/* =====================================================================
   SAREE & STALL DESIGN STUDIO — script.js
   Features: Layers, Symmetry, Pattern Fill, Flood Fill, Zones,
   Eyedropper, Line/Rect tools, Undo/Redo, Image dither,
   Mini preview, SVG Export, Brush sizes, Templates
===================================================================== */

// ── DOM ──────────────────────────────────────────────────────────────
const canvas = document.getElementById("graphCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const prevCanvas = document.getElementById("previewCanvas");
const prevCtx = prevCanvas.getContext("2d");

// ── STATE ────────────────────────────────────────────────────────────
let S = {
  width: 1200,
  height: 800,
  gridSize: 20,
  gridColor: "#cccccc",
  superboxBorderColor: "#555555",
  bgColor: "#ffffff",
  showGrid: true,
  showZoneLabels: true,
  drawColor: "#c0392b",
  drawOpacity: 1,
  tool: "draw", // draw | erase | fill | eyedropper | select | line | rect
  brushSize: 3,
  symmetry: "none", // none | h | v | hv | quad
  activeZone: "all", // all | pallu | body | border
  activeLayer: 0,
  showZones: true,
  zoom: 1,
  patternType: "none",
  patColorA: "#c0392b",
  patColorB: "#f39c12",
  patScale: 2,
  maxColors: 16,
  ditherMode: "none",
};

let layers = [{ name: "Layer 1", visible: true, boxes: new Map() }];
let activeLayerIndex = 0;
function activeLayer() {
  return layers[activeLayerIndex];
}

// ── UNDO / REDO ──────────────────────────────────────────────────────
let undoStack = [],
  redoStack = [];
const MAX_UNDO = 40;
function saveState() {
  const snap = layers.map((l) => ({
    name: l.name,
    visible: l.visible,
    boxes: new Map(l.boxes),
  }));
  undoStack.push(snap);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (!undoStack.length) return;
  const cur = layers.map((l) => ({
    name: l.name,
    visible: l.visible,
    boxes: new Map(l.boxes),
  }));
  redoStack.push(cur);
  layers = undoStack.pop();
  activeLayerIndex = Math.min(activeLayerIndex, layers.length - 1);
  redraw();
  renderLayers();
}
function redo() {
  if (!redoStack.length) return;
  const cur = layers.map((l) => ({
    name: l.name,
    visible: l.visible,
    boxes: new Map(l.boxes),
  }));
  undoStack.push(cur);
  layers = redoStack.pop();
  activeLayerIndex = Math.min(activeLayerIndex, layers.length - 1);
  redraw();
  renderLayers();
}

// ── PALETTES ─────────────────────────────────────────────────────────
const PALETTES = {
  saree: [
    "#8e1a4e",
    "#c0392b",
    "#e74c3c",
    "#e91e8c",
    "#9b59b6",
    "#6c3483",
    "#1a1464",
    "#2980b9",
    "#16a085",
    "#27ae60",
    "#f39c12",
    "#e67e22",
    "#f5f5f0",
    "#d4c5b0",
    "#8b6914",
    "#2c3e50",
    "#ffffff",
    "#000000",
    "#ffd700",
    "#b8860b",
  ],
  stall: [
    "#1a3c6e",
    "#2980b9",
    "#3498db",
    "#85c1e9",
    "#154360",
    "#1b4f72",
    "#5dade2",
    "#aed6f1",
    "#0d6e3c",
    "#1e8449",
    "#2ecc71",
    "#82e0aa",
    "#7d6608",
    "#f1c40f",
    "#f9e79f",
    "#fdfefe",
    "#2c3e50",
    "#717d7e",
    "#abb2b9",
    "#ffffff",
  ],
  custom: [],
};
let activePaletteTab = "saree";

// ── LINE / RECT TOOL STATE ────────────────────────────────────────────
let isDrawing = false,
  drawStart = null;
let selStart = null,
  selEnd = null,
  selRect = { x: 0, y: 0, w: 0, h: 0 };
let selActive = false;

// ── ZONE DEFINITIONS (fraction of canvas width) ──────────────────────
function getZoneBounds(zone) {
  const cols = Math.floor(canvas.width / S.gridSize);
  const rows = Math.floor(canvas.height / S.gridSize);
  if (zone === "all") return { x0: 0, y0: 0, x1: cols - 1, y1: rows - 1 };
  if (zone === "pallu")
    return { x0: Math.floor(cols * 0.7), y0: 0, x1: cols - 1, y1: rows - 1 };
  if (zone === "border")
    return { x0: 0, y0: 0, x1: cols - 1, y1: Math.floor(rows * 0.12) };
  // body = middle section
  return {
    x0: 0,
    y0: Math.floor(rows * 0.12),
    x1: Math.floor(cols * 0.7) - 1,
    y1: rows - 1,
  };
}
function inZone(gx, gy) {
  if (S.activeZone === "all") return true;
  const b = getZoneBounds(S.activeZone);
  return gx >= b.x0 && gx <= b.x1 && gy >= b.y0 && gy <= b.y1;
}

// ── INIT ─────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  bindControls();
  initPalette(activePaletteTab);
  renderLayers();
  applyTemplate("saree");
  updateUI();
  renderZoneOverlay();
  setupKeyboard();
});

// ── BIND ALL CONTROLS ─────────────────────────────────────────────────
function bindControls() {
  // Dimensions
  bind("width", (v) => {
    S.width = +v;
    updateUI();
  });
  bind("height", (v) => {
    S.height = +v;
    updateUI();
  });
  bind("gridSize", (v) => {
    S.gridSize = +v;
    updateUI();
  });
  bind("drawOpacity", (v) => {
    S.drawOpacity = +v;
    document.getElementById("drawOpacityValue").textContent = (+v).toFixed(2);
  });
  bind("gridColor", (v) => {
    S.gridColor = v;
    redraw();
  });
  bind("superboxBorderColor", (v) => {
    S.superboxBorderColor = v;
    redraw();
  });
  bind("bgColor", (v) => {
    S.bgColor = v;
    redraw();
  });
  bind(
    "showGrid",
    (v) => {
      S.showGrid = v;
      redraw();
    },
    "checked"
  );
  bind(
    "showZoneLabels",
    (v) => {
      S.showZoneLabels = v;
      renderZoneOverlay();
    },
    "checked"
  );
  bind("patColorA", (v) => {
    S.patColorA = v;
  });
  bind("patColorB", (v) => {
    S.patColorB = v;
  });
  bind("patScale", (v) => {
    S.patScale = +v;
    document.getElementById("patScaleVal").textContent = v;
  });
  bind("zoomLevel", (v) => {
    S.zoom = +v;
    applyZoom();
  });
  bind("brushSize", (v) => {
    S.brushSize = +v;
  });
  bind("maxColors", (v) => {
    S.maxColors = +v;
    document.getElementById("maxColorsVal").textContent = v;
  });
  bind("ditherMode", (v) => {
    S.ditherMode = v;
  });

  // Tools
  document.getElementById("drawModeBtn").onclick = () => setTool("draw");
  document.getElementById("eraseModeBtn").onclick = () => setTool("erase");
  document.getElementById("fillModeBtn").onclick = () => setTool("fill");
  document.getElementById("eyedropperBtn").onclick = () =>
    setTool("eyedropper");
  document.getElementById("selectModeBtn").onclick = () => setTool("select");
  document.getElementById("lineModeBtn").onclick = () => setTool("line");
  document.getElementById("rectModeBtn").onclick = () => setTool("rect");

  // Buttons
  document.getElementById("downloadBtn").onclick = downloadPNG;
  document.getElementById("exportSvgBtn").onclick = exportSVG;
  document.getElementById("clearDrawingBtn").onclick = clearAll;
  document.getElementById("undoBtn").onclick = undo;
  document.getElementById("redoBtn").onclick = redo;
  document.getElementById("applyPatternBtn").onclick = applyPatternToRegion;
  document.getElementById("fillAllBtn").onclick = fillAllWithPattern;
  document.getElementById("addLayerBtn").onclick = addLayer;
  document.getElementById("mergeLayersBtn").onclick = mergeLayers;
  document.getElementById("addCustomColor").onclick = addCustomColor;
  document.getElementById("sidebarToggle").onclick = toggleSidebar;

  // Image upload
  document.getElementById("imageUpload").onchange = (e) => {
    if (e.target.files[0]) processImage(e.target.files[0]);
  };

  // Pattern buttons
  document.querySelectorAll(".pat-btn").forEach((b) => {
    b.onclick = () => {
      document
        .querySelectorAll(".pat-btn")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      S.patternType = b.dataset.pattern;
    };
  });

  // Symmetry buttons
  document.querySelectorAll(".sym-btn").forEach((b) => {
    b.onclick = () => {
      document
        .querySelectorAll(".sym-btn")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      S.symmetry = b.dataset.sym;
    };
  });

  // Zone buttons
  document.querySelectorAll(".zone-btn").forEach((b) => {
    b.onclick = () => {
      document
        .querySelectorAll(".zone-btn")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      S.activeZone = b.dataset.zone;
      renderZoneOverlay();
    };
  });

  // Palette tabs
  document.querySelectorAll(".ptab").forEach((b) => {
    b.onclick = () => {
      document
        .querySelectorAll(".ptab")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      activePaletteTab = b.dataset.tab;
      const row = document.getElementById("customColorRow");
      row.style.display = activePaletteTab === "custom" ? "flex" : "none";
      initPalette(activePaletteTab);
    };
  });

  // Templates
  document.querySelectorAll(".tmpl-card").forEach((b) => {
    b.onclick = () => {
      document
        .querySelectorAll(".tmpl-card")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      applyTemplate(b.dataset.template);
    };
  });

  // Canvas mouse events
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}

function bind(id, fn, prop = "value") {
  const el = document.getElementById(id);
  if (!el) return;
  const evName = prop === "checked" ? "change" : "input";
  el.addEventListener(evName, (e) => fn(e.target[prop]));
}

function setTool(t) {
  S.tool = t;
  document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === t);
  });
  canvas.style.cursor =
    t === "eyedropper"
      ? "crosshair"
      : t === "fill"
      ? "cell"
      : t === "select"
      ? "default"
      : "crosshair";
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("collapsed");
}

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k === "d") setTool("draw");
    else if (k === "e") setTool("erase");
    else if (k === "f") setTool("fill");
    else if (k === "i") setTool("eyedropper");
    else if (k === "s") setTool("select");
    else if (k === "l") setTool("line");
    else if (k === "r") setTool("rect");
    else if (k === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (k === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      redo();
    }
  });
}

// ── PALETTE ───────────────────────────────────────────────────────────
function initPalette(tab) {
  const wrap = document.getElementById("paletteWrap");
  wrap.innerHTML = "";
  const cols = PALETTES[tab] || [];
  cols.forEach((col) => {
    const div = document.createElement("div");
    div.className = "color-swatch" + (col === S.drawColor ? " active" : "");
    div.style.backgroundColor = col;
    div.title = col;
    div.onclick = () => {
      S.drawColor = col;
      document
        .querySelectorAll(".color-swatch")
        .forEach((x) => x.classList.remove("active"));
      div.classList.add("active");
    };
    wrap.appendChild(div);
  });
}

function addCustomColor() {
  const col = document.getElementById("customColorPick").value;
  if (!PALETTES.custom.includes(col)) PALETTES.custom.push(col);
  if (activePaletteTab === "custom") initPalette("custom");
}

// ── TEMPLATES ─────────────────────────────────────────────────────────
function applyTemplate(name) {
  saveState();
  layers = [{ name: "Layer 1", visible: true, boxes: new Map() }];
  activeLayerIndex = 0;
  if (name === "saree") {
    S.width = 1400;
    S.height = 600;
    S.gridSize = 14;
    S.bgColor = "#f5e6d2";
    document.getElementById("width").value = 1400;
    document.getElementById("height").value = 600;
    document.getElementById("gridSize").value = 14;
    document.getElementById("bgColor").value = "#f5e6d2";
    const cols = Math.floor(1400 / 14),
      rows = Math.floor(600 / 14);
    // fill body deep red
    for (let x = 0; x < Math.floor(cols * 0.68); x++)
      for (let y = 0; y < rows; y++)
        layers[0].boxes.set(`${x},${y}`, "rgba(142,26,78,1)");
    // pallu pattern
    for (let x = Math.floor(cols * 0.7); x < cols; x++)
      for (let y = 0; y < rows; y++) {
        const pat = patternColor(x, y, "checkerboard", "#8e1a4e", "#c0392b", 2);
        layers[0].boxes.set(`${x},${y}`, pat);
      }
    // gold border top & bottom
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < 3; y++)
        layers[0].boxes.set(`${x},${y}`, "rgba(212,175,55,1)");
      for (let y = rows - 3; y < rows; y++)
        layers[0].boxes.set(`${x},${y}`, "rgba(212,175,55,1)");
    }
  } else if (name === "stall") {
    S.width = 1200;
    S.height = 900;
    S.gridSize = 20;
    S.bgColor = "#f0ebe3";
    document.getElementById("width").value = 1200;
    document.getElementById("height").value = 900;
    document.getElementById("gridSize").value = 20;
    document.getElementById("bgColor").value = "#f0ebe3";
    const cols = Math.floor(1200 / 20),
      rows = Math.floor(900 / 20);
    for (let x = 0; x < cols; x++)
      for (let y = 0; y < rows; y++) {
        const pat = patternColor(x, y, "diagonal", "#1a3c6e", "#2980b9", 3);
        layers[0].boxes.set(`${x},${y}`, pat);
      }
  } else if (name === "border") {
    S.width = 1200;
    S.height = 200;
    S.gridSize = 16;
    S.bgColor = "#1a1a2e";
    document.getElementById("width").value = 1200;
    document.getElementById("height").value = 200;
    document.getElementById("gridSize").value = 16;
    document.getElementById("bgColor").value = "#1a1a2e";
    const cols = Math.floor(1200 / 16),
      rows = Math.floor(200 / 16);
    for (let x = 0; x < cols; x++)
      for (let y = 0; y < rows; y++) {
        const pat = patternColor(x, y, "diamond", "#e74c3c", "#f39c12", 3);
        layers[0].boxes.set(`${x},${y}`, pat);
      }
  } else if (name === "motif") {
    S.width = 400;
    S.height = 400;
    S.gridSize = 16;
    S.bgColor = "#fff8f0";
    document.getElementById("width").value = 400;
    document.getElementById("height").value = 400;
    document.getElementById("gridSize").value = 16;
    document.getElementById("bgColor").value = "#fff8f0";
    const cols = Math.floor(400 / 16),
      rows = Math.floor(400 / 16);
    const cx = Math.floor(cols / 2),
      cy = Math.floor(rows / 2);
    for (let x = 0; x < cols; x++)
      for (let y = 0; y < rows; y++) {
        const dx = x - cx,
          dy = y - cy,
          d = Math.sqrt(dx * dx + dy * dy);
        if (d <= 3) layers[0].boxes.set(`${x},${y}`, "rgba(231,76,60,1)");
        else if (d <= 5) layers[0].boxes.set(`${x},${y}`, "rgba(243,156,18,1)");
        else if (d <= 7) layers[0].boxes.set(`${x},${y}`, "rgba(39,174,96,1)");
      }
  }
  updateUI();
  renderLayers();
}

// ── UPDATE UI ─────────────────────────────────────────────────────────
function updateUI() {
  const snap_w = Math.floor(S.width / S.gridSize) * S.gridSize;
  const snap_h = Math.floor(S.height / S.gridSize) * S.gridSize;
  canvas.width = snap_w;
  canvas.height = snap_h;

  document.getElementById("widthValue").textContent = snap_w;
  document.getElementById("heightValue").textContent = snap_h;
  document.getElementById("gridSizeValue").textContent = S.gridSize;

  applyZoom();
  redraw();
  renderZoneOverlay();
  updateStats();
}

function applyZoom() {
  canvas.style.width = canvas.width * S.zoom + "px";
  canvas.style.height = canvas.height * S.zoom + "px";
}

function updateStats() {
  const total =
    Math.floor(canvas.width / S.gridSize) *
    Math.floor(canvas.height / S.gridSize);
  let colored = 0;
  layers.forEach((l) => {
    if (l.visible) colored += l.boxes.size;
  });
  document.getElementById("coloredBoxes").textContent = colored;
  document.getElementById("boxCount").textContent = total;
  document.getElementById("layerCount").textContent = layers.length;
}

// ── REDRAW ────────────────────────────────────────────────────────────
function redraw() {
  ctx.fillStyle = S.bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Superbox shading
  const sz = S.gridSize * 10;
  for (let i = 0; i < canvas.width; i += sz)
    for (let j = 0; j < canvas.height; j += sz)
      if ((i / sz + j / sz) % 2 === 0) {
        ctx.fillStyle = "rgba(0,0,0,0.03)";
        ctx.fillRect(i, j, sz, sz);
      }

  // Layers (bottom to top)
  layers.forEach((layer) => {
    if (!layer.visible) return;
    layer.boxes.forEach((color, key) => {
      const [x, y] = key.split(",").map(Number);
      ctx.fillStyle = color;
      ctx.fillRect(x * S.gridSize, y * S.gridSize, S.gridSize, S.gridSize);
    });
  });

  // Grid lines
  if (S.showGrid) {
    ctx.strokeStyle = S.gridColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += S.gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y <= canvas.height; y += S.gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    // Superbox lines
    ctx.strokeStyle = S.superboxBorderColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += sz) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y <= canvas.height; y += sz) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
  }

  updatePreview();
  updateStats();
}

function updatePreview() {
  prevCtx.drawImage(canvas, 0, 0, prevCanvas.width, prevCanvas.height);
}

// ── ZONE OVERLAY ──────────────────────────────────────────────────────
function renderZoneOverlay() {
  const ov = document.getElementById("zoneOverlay");
  ov.innerHTML = "";
  if (!S.showZoneLabels) return;
  const zones = ["pallu", "body", "border"];
  zones.forEach((zone) => {
    const b = getZoneBounds(zone);
    const el = document.createElement("div");
    el.className = "zone-label";
    el.textContent = zone.toUpperCase();
    el.style.left = b.x0 * S.gridSize * S.zoom + 4 + "px";
    el.style.top = b.y0 * S.gridSize * S.zoom + 4 + "px";
    ov.appendChild(el);
  });
}

// ── MOUSE EVENTS ──────────────────────────────────────────────────────
function getGrid(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    gx: Math.floor((e.clientX - rect.left) / S.zoom / S.gridSize),
    gy: Math.floor((e.clientY - rect.top) / S.zoom / S.gridSize),
  };
}

function onMouseDown(e) {
  isDrawing = true;
  const { gx, gy } = getGrid(e);
  if (S.tool === "fill") {
    saveState();
    floodFill(gx, gy);
    return;
  }
  if (S.tool === "eyedropper") {
    pickColor(gx, gy);
    isDrawing = false;
    return;
  }
  if (S.tool === "select") {
    selStart = { gx, gy };
    return;
  }
  if (S.tool === "line" || S.tool === "rect") {
    drawStart = { gx, gy };
    return;
  }
  saveState();
  paintAt(gx, gy);
}

function onMouseMove(e) {
  const { gx, gy } = getGrid(e);
  document.getElementById("mousePosition").textContent = `${gx}, ${gy}`;
  if (!isDrawing) return;

  if (S.tool === "select" && selStart) {
    showSelRect(selStart.gx, selStart.gy, gx, gy);
    return;
  }
  if ((S.tool === "line" || S.tool === "rect") && drawStart) {
    redraw();
    previewShape(drawStart.gx, drawStart.gy, gx, gy);
    return;
  }
  if (S.tool === "draw" || S.tool === "erase") paintAt(gx, gy);
}

function onMouseUp(e) {
  if (!isDrawing) return;
  isDrawing = false;
  const { gx, gy } = getGrid(e);

  if (S.tool === "select" && selStart) {
    selRect = normalizeRect(selStart.gx, selStart.gy, gx, gy);
    selActive = true;
    selStart = null;
    return;
  }
  if (S.tool === "line" && drawStart) {
    saveState();
    drawLine(drawStart.gx, drawStart.gy, gx, gy);
    drawStart = null;
    redraw();
    return;
  }
  if (S.tool === "rect" && drawStart) {
    saveState();
    drawRectTool(drawStart.gx, drawStart.gy, gx, gy);
    drawStart = null;
    redraw();
    return;
  }
}

// ── PAINT ─────────────────────────────────────────────────────────────
function paintAt(gx, gy) {
  if (
    gx < 0 ||
    gy < 0 ||
    gx * S.gridSize >= canvas.width ||
    gy * S.gridSize >= canvas.height
  )
    return;
  const half = Math.floor(S.brushSize / 2);
  for (let dx = -half; dx <= half; dx++)
    for (let dy = -half; dy <= half; dy++) paintCell(gx + dx, gy + dy);
  redraw();
}

function paintCell(gx, gy) {
  if (!inZone(gx, gy)) return;
  if (
    gx < 0 ||
    gy < 0 ||
    gx * S.gridSize >= canvas.width ||
    gy * S.gridSize >= canvas.height
  )
    return;
  const layer = activeLayer();
  if (S.tool === "erase") {
    layer.boxes.delete(`${gx},${gy}`);
  } else {
    const rgb = hexToRgb(S.drawColor);
    layer.boxes.set(
      `${gx},${gy}`,
      `rgba(${rgb.r},${rgb.g},${rgb.b},${S.drawOpacity})`
    );
  }
  // Symmetry mirrors
  const cols = Math.floor(canvas.width / S.gridSize);
  const rows = Math.floor(canvas.height / S.gridSize);
  const mirrors = getSymMirrors(gx, gy, cols, rows);
  mirrors.forEach(([mx, my]) => {
    if (!inZone(mx, my)) return;
    if (mx < 0 || my < 0 || mx >= cols || my >= rows) return;
    if (S.tool === "erase") {
      layer.boxes.delete(`${mx},${my}`);
    } else {
      const rgb = hexToRgb(S.drawColor);
      layer.boxes.set(
        `${mx},${my}`,
        `rgba(${rgb.r},${rgb.g},${rgb.b},${S.drawOpacity})`
      );
    }
  });
}

function getSymMirrors(gx, gy, cols, rows) {
  const mirrors = [];
  if (S.symmetry === "h" || S.symmetry === "hv" || S.symmetry === "quad")
    mirrors.push([cols - 1 - gx, gy]);
  if (S.symmetry === "v" || S.symmetry === "hv" || S.symmetry === "quad")
    mirrors.push([gx, rows - 1 - gy]);
  if (S.symmetry === "hv" || S.symmetry === "quad")
    mirrors.push([cols - 1 - gx, rows - 1 - gy]);
  if (S.symmetry === "quad") {
    mirrors.push([gy, gx]);
    mirrors.push([rows - 1 - gy, gx]);
    mirrors.push([gy, cols - 1 - gx]);
    mirrors.push([rows - 1 - gy, cols - 1 - gx]);
  }
  return mirrors;
}

// ── EYEDROPPER ────────────────────────────────────────────────────────
function pickColor(gx, gy) {
  const imgData = ctx.getImageData(
    gx * S.gridSize + Math.floor(S.gridSize / 2),
    gy * S.gridSize + Math.floor(S.gridSize / 2),
    1,
    1
  ).data;
  const hex = rgbToHex(imgData[0], imgData[1], imgData[2]);
  S.drawColor = hex;
  initPalette(activePaletteTab);
  setTool("draw");
}

// ── FLOOD FILL ────────────────────────────────────────────────────────
function floodFill(startX, startY) {
  const cols = Math.floor(canvas.width / S.gridSize);
  const rows = Math.floor(canvas.height / S.gridSize);
  if (startX < 0 || startY < 0 || startX >= cols || startY >= rows) return;

  const layer = activeLayer();
  const targetColor = layer.boxes.get(`${startX},${startY}`) || null;
  const fillColor = (() => {
    const r = hexToRgb(S.drawColor);
    return `rgba(${r.r},${r.g},${r.b},${S.drawOpacity})`;
  })();
  if (targetColor === fillColor) return;

  const stack = [[startX, startY]];
  const visited = new Set();
  while (stack.length) {
    const [x, y] = stack.pop();
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    if (!inZone(x, y)) continue;
    const cur = layer.boxes.get(key) || null;
    if (cur !== targetColor) continue;
    visited.add(key);
    layer.boxes.set(key, fillColor);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  redraw();
}

// ── LINE TOOL ─────────────────────────────────────────────────────────
function drawLine(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0),
    dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1,
    sy = y0 < y1 ? 1 : -1;
  let err = dx - dy,
    x = x0,
    y = y0;
  while (true) {
    paintCell(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

// ── RECT TOOL ─────────────────────────────────────────────────────────
function drawRectTool(x0, y0, x1, y1) {
  const { x: rx, y: ry, w: rw, h: rh } = normalizeRect(x0, y0, x1, y1);
  for (let x = rx; x < rx + rw; x++) {
    paintCell(x, ry);
    paintCell(x, ry + rh - 1);
  }
  for (let y = ry; y < ry + rh; y++) {
    paintCell(rx, y);
    paintCell(rx + rw - 1, y);
  }
}

// ── PREVIEW SHAPE (ghost while dragging) ─────────────────────────────
function previewShape(x0, y0, x1, y1) {
  ctx.strokeStyle = S.drawColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  if (S.tool === "line") {
    ctx.beginPath();
    ctx.moveTo(
      x0 * S.gridSize + S.gridSize / 2,
      y0 * S.gridSize + S.gridSize / 2
    );
    ctx.lineTo(
      x1 * S.gridSize + S.gridSize / 2,
      y1 * S.gridSize + S.gridSize / 2
    );
    ctx.stroke();
  } else {
    const { x, y, w, h } = normalizeRect(x0, y0, x1, y1);
    ctx.strokeRect(
      x * S.gridSize,
      y * S.gridSize,
      w * S.gridSize,
      h * S.gridSize
    );
  }
  ctx.setLineDash([]);
}

function showSelRect(x0, y0, x1, y1) {
  const { x, y, w, h } = normalizeRect(x0, y0, x1, y1);
  const r = document.getElementById("selRect");
  r.style.display = "block";
  r.style.left = x * S.gridSize * S.zoom + 20 + "px";
  r.style.top = y * S.gridSize * S.zoom + 20 + "px";
  r.style.width = w * S.gridSize * S.zoom + "px";
  r.style.height = h * S.gridSize * S.zoom + "px";
}

function normalizeRect(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0) + 1,
    h: Math.abs(y1 - y0) + 1,
  };
}

// ── PATTERNS ──────────────────────────────────────────────────────────
function patternColor(gx, gy, type, colA, colB, scale) {
  const s = scale || 1;
  const x = Math.floor(gx / s),
    y = Math.floor(gy / s);
  const r = hexToRgb(colA),
    r2 = hexToRgb(colB);
  function rgba(c, a = 1) {
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  }

  switch (type) {
    case "checkerboard":
      return (x + y) % 2 === 0 ? rgba(r) : rgba(r2);
    case "diagonal":
      return (x + y) % 2 === 0 ? rgba(r) : rgba(r2);
    case "diamond": {
      const v = Math.abs((x % (s * 2)) - s) + Math.abs((y % (s * 2)) - s);
      return v < s ? rgba(r) : rgba(r2);
    }
    case "wave":
      return Math.sin((x + y) * 0.5) > 0 ? rgba(r) : rgba(r2);
    case "floral": {
      const cx = x % (s * 4),
        cy = y % (s * 4);
      const d = Math.sqrt((cx - s * 2) ** 2 + (cy - s * 2) ** 2);
      return d < s * 1.5 ? rgba(r) : rgba(r2);
    }
    case "zigzag": {
      const row = Math.floor(y / s);
      const off = (row % 2) * Math.floor(s / 2);
      return Math.floor((x + off) / s) % 2 === 0 ? rgba(r) : rgba(r2);
    }
    case "dots": {
      const bx = x % (s * 3),
        by = y % (s * 3);
      const d = Math.sqrt((bx - s) ** 2 + (by - s) ** 2);
      return d < s * 0.8 ? rgba(r) : rgba(r2);
    }
    default:
      return rgba(r);
  }
}

function applyPatternToRegion() {
  if (S.patternType === "none") return;
  saveState();
  const layer = activeLayer();
  let x0, y0, x1, y1;
  if (selActive) {
    x0 = selRect.x;
    y0 = selRect.y;
    x1 = x0 + selRect.w;
    y1 = y0 + selRect.h;
  } else {
    const b = getZoneBounds(S.activeZone);
    x0 = b.x0;
    y0 = b.y0;
    x1 = b.x1 + 1;
    y1 = b.y1 + 1;
  }
  for (let x = x0; x < x1; x++)
    for (let y = y0; y < y1; y++) {
      const col = patternColor(
        x,
        y,
        S.patternType,
        S.patColorA,
        S.patColorB,
        S.patScale
      );
      layer.boxes.set(`${x},${y}`, col);
    }
  redraw();
}

function fillAllWithPattern() {
  if (S.patternType === "none") return;
  saveState();
  const cols = Math.floor(canvas.width / S.gridSize),
    rows = Math.floor(canvas.height / S.gridSize);
  const layer = activeLayer();
  for (let x = 0; x < cols; x++)
    for (let y = 0; y < rows; y++) {
      const col = patternColor(
        x,
        y,
        S.patternType,
        S.patColorA,
        S.patColorB,
        S.patScale
      );
      layer.boxes.set(`${x},${y}`, col);
    }
  redraw();
}

// ── LAYERS ────────────────────────────────────────────────────────────
function renderLayers() {
  const list = document.getElementById("layersList");
  list.innerHTML = "";
  layers.forEach((l, i) => {
    const item = document.createElement("div");
    item.className = "layer-item" + (i === activeLayerIndex ? " active" : "");
    item.innerHTML = `
      <input type="checkbox" ${l.visible ? "checked" : ""} title="Visible"/>
      <span class="layer-name">${l.name}</span>
      <span class="layer-del" title="Delete">✕</span>`;
    item.querySelector("input").addEventListener("change", (e) => {
      l.visible = e.target.checked;
      redraw();
    });
    item.querySelector(".layer-del").onclick = (e) => {
      e.stopPropagation();
      if (layers.length === 1) return;
      saveState();
      layers.splice(i, 1);
      activeLayerIndex = Math.max(
        0,
        Math.min(activeLayerIndex, layers.length - 1)
      );
      renderLayers();
      redraw();
    };
    item.onclick = () => {
      activeLayerIndex = i;
      renderLayers();
    };
    list.appendChild(item);
  });
}

function addLayer() {
  saveState();
  layers.push({
    name: `Layer ${layers.length + 1}`,
    visible: true,
    boxes: new Map(),
  });
  activeLayerIndex = layers.length - 1;
  renderLayers();
  updateStats();
}

function mergeLayers() {
  saveState();
  const merged = new Map();
  layers.forEach((l) => {
    if (l.visible) l.boxes.forEach((v, k) => merged.set(k, v));
  });
  layers = [{ name: "Merged", visible: true, boxes: merged }];
  activeLayerIndex = 0;
  renderLayers();
  redraw();
}

// ── IMAGE PROCESSING ──────────────────────────────────────────────────
function processImage(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const cols = Math.floor(canvas.width / S.gridSize);
      const rows = Math.floor(canvas.height / S.gridSize);
      const tc = document.createElement("canvas");
      const tx = tc.getContext("2d");
      tc.width = cols;
      tc.height = rows;
      tx.drawImage(img, 0, 0, cols, rows);
      const data = tx.getImageData(0, 0, cols, rows).data;
      saveState();
      const layer = activeLayer();
      layer.boxes.clear();

      const palColors = (PALETTES[activePaletteTab] || []).map(hexToRgb);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          if (data[i + 3] < 10) continue;
          let r = data[i],
            g = data[i + 1],
            b = data[i + 2];

          if (S.ditherMode === "palette" && palColors.length) {
            const nc = nearestColor(r, g, b, palColors);
            r = nc.r;
            g = nc.g;
            b = nc.b;
          } else if (S.ditherMode === "bayer") {
            const bayer = [
              [0, 8, 2, 10],
              [12, 4, 14, 6],
              [3, 11, 1, 9],
              [15, 7, 13, 5],
            ];
            const threshold = (bayer[y % 4][x % 4] / 16 - 0.5) * 50;
            r = clamp(r + threshold);
            g = clamp(g + threshold);
            b = clamp(b + threshold);
          }
          layer.boxes.set(`${x},${y}`, `rgba(${r},${g},${b},${S.drawOpacity})`);
        }
      }
      updateUI();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function nearestColor(r, g, b, palette) {
  let best = null,
    bestD = Infinity;
  palette.forEach((c) => {
    const d = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  });
  return best || { r, g, b };
}

// ── DOWNLOAD / EXPORT ─────────────────────────────────────────────────
function downloadPNG() {
  const link = document.createElement("a");
  link.download = "saree-design.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function exportSVG() {
  const cols = Math.floor(canvas.width / S.gridSize);
  const rows = Math.floor(canvas.height / S.gridSize);
  const gs = S.gridSize;

  // Flatten all visible layers
  const flat = new Map();
  layers.forEach((l) => {
    if (l.visible) l.boxes.forEach((v, k) => flat.set(k, v));
  });

  let rects = "";
  flat.forEach((col, key) => {
    const [x, y] = key.split(",").map(Number);
    rects += `<rect x="${x * gs}" y="${
      y * gs
    }" width="${gs}" height="${gs}" fill="${col}"/>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
<rect width="${canvas.width}" height="${canvas.height}" fill="${S.bgColor}"/>
${rects}
</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const link = document.createElement("a");
  link.download = "saree-design.svg";
  link.href = URL.createObjectURL(blob);
  link.click();
}

// ── CLEAR ─────────────────────────────────────────────────────────────
function clearAll() {
  saveState();
  activeLayer().boxes.clear();
  redraw();
}

// ── HELPERS ───────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r
    ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) }
    : { r: 0, g: 0, b: 0 };
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}
