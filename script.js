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
let activeTemplate = "saree";

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
  placementImage: null,
  placementX: 0,
  placementY: 0,
  placementW: 0,
  placementH: 0,
  placementZone: "all",
  placementLockAspect: true,
  uploadedBorderImage: null,
  uploadedPatternImage: null,
  uploadedPalluImage: null,
  patternOccupancy: 1.0,
  borderImageLayout: "match",
  borderStripeHeight: 3,
  borderGapHeight: 2,
};

// Stores smoothly-placed images: drawn on canvas with grid on top
let placedImages = []; // [{img, canvasX, canvasY, canvasW, canvasH, opacity}]

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
let isDraggingPlacement = false;
let dragPlacementStart = null;

// ── ZONE DEFINITIONS (fraction of canvas width) ──────────────────────
function getZoneBounds(zone) {
  const cols = Math.floor(canvas.width / S.gridSize);
  const rows = Math.floor(canvas.height / S.gridSize);
  if (zone === "all") return { x0: 0, y0: 0, x1: cols - 1, y1: rows - 1 };

  if (activeTemplate === "saree") {
    const borderRowCount = Math.floor(rows * 0.12);
    if (zone === "pallu") {
      return {
        x0: Math.floor(cols * 0.7),
        y0: borderRowCount,
        x1: cols - 1,
        y1: rows - 1 - borderRowCount,
      };
    }
    if (zone === "border") {
      return {
        x0: 0,
        y0: 0,
        x1: cols - 1,
        y1: Math.max(0, borderRowCount - 1),
      };
    }
    // body = middle section between borders
    return {
      x0: 0,
      y0: borderRowCount,
      x1: Math.floor(cols * 0.7) - 1,
      y1: rows - 1 - borderRowCount,
    };
  } else {
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
}
function inZone(gx, gy) {
  if (S.activeZone === "all") return true;
  if (activeTemplate === "saree") {
    const cols = Math.floor(canvas.width / S.gridSize);
    const rows = Math.floor(canvas.height / S.gridSize);
    const borderRowCount = Math.floor(rows * 0.12);
    if (S.activeZone === "border") {
      return gy < borderRowCount || gy >= rows - borderRowCount;
    }
    if (S.activeZone === "pallu") {
      return (
        gx >= Math.floor(cols * 0.7) &&
        gy >= borderRowCount &&
        gy < rows - borderRowCount
      );
    }
    if (S.activeZone === "body") {
      return (
        gx < Math.floor(cols * 0.7) &&
        gy >= borderRowCount &&
        gy < rows - borderRowCount
      );
    }
  }
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

  // Collapse sidebar by default on mobile/tablet screens
  if (window.innerWidth <= 767) {
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.add("collapsed");
  }
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

  const closeBtn = document.getElementById("sidebarCloseBtn");
  if (closeBtn) {
    closeBtn.onclick = toggleSidebar;
  }

  const backdrop = document.getElementById("sidebarBackdrop");
  if (backdrop) {
    backdrop.onclick = toggleSidebar;
  }

  // Image upload — start interactive placement
  document.getElementById("imageUpload").onchange = (e) => {
    if (e.target.files[0]) startImagePlacement(e.target.files[0]);
  };

  // Border image upload
  document.getElementById("borderImageUpload").onchange = (e) => {
    if (e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.src = ev.target.result;
        img.onload = () => {
          S.uploadedBorderImage = img;
          const clearBtn = document.getElementById("clearBorderImageBtn");
          if (clearBtn) clearBtn.style.display = "block";
          redraw();
        };
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  // Pallu image upload
  document.getElementById("palluImageUpload").onchange = (e) => {
    if (e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.src = ev.target.result;
        img.onload = () => {
          S.uploadedPalluImage = img;
          const clearBtn = document.getElementById("clearPalluImageBtn");
          if (clearBtn) clearBtn.style.display = "block";
          redraw();
        };
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  // Pattern image upload
  document.getElementById("patternImageUpload").onchange = (e) => {
    if (e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.src = ev.target.result;
        img.onload = () => {
          S.uploadedPatternImage = img;
          const clearBtn = document.getElementById("clearPatternImageBtn");
          if (clearBtn) clearBtn.style.display = "block";
          redraw();
        };
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  // Pattern occupancy selection
  document.getElementById("patternOccupancy").onchange = (e) => {
    S.patternOccupancy = parseFloat(e.target.value) || 1.0;
    redraw();
  };

  // Border layout settings
  const layoutEl = document.getElementById("borderImageLayout");
  if (layoutEl)
    layoutEl.onchange = (e) => {
      S.borderImageLayout = e.target.value;
      redraw();
    };
  const stripeHEl = document.getElementById("borderStripeHeight");
  if (stripeHEl)
    stripeHEl.oninput = (e) => {
      S.borderStripeHeight = parseInt(e.target.value) || 1;
      redraw();
    };
  const gapHEl = document.getElementById("borderGapHeight");
  if (gapHEl)
    gapHEl.oninput = (e) => {
      S.borderGapHeight = parseInt(e.target.value) || 0;
      redraw();
    };

  // Clear Buttons
  const clearBorderBtn = document.getElementById("clearBorderImageBtn");
  if (clearBorderBtn)
    clearBorderBtn.onclick = () => {
      S.uploadedBorderImage = null;
      clearBorderBtn.style.display = "none";
      redraw();
    };

  const clearPalluBtn = document.getElementById("clearPalluImageBtn");
  if (clearPalluBtn)
    clearPalluBtn.onclick = () => {
      S.uploadedPalluImage = null;
      clearPalluBtn.style.display = "none";
      redraw();
    };

  const clearPatternBtn = document.getElementById("clearPatternImageBtn");
  if (clearPatternBtn)
    clearPatternBtn.onclick = () => {
      S.uploadedPatternImage = null;
      clearPatternBtn.style.display = "none";
      redraw();
    };

  // Image placement control bindings
  document.getElementById("placementZone").onchange = (e) => {
    S.placementZone = e.target.value;
    redraw();
  };
  document.getElementById("placementX").oninput = (e) => {
    S.placementX = parseInt(e.target.value) || 0;
    redraw();
  };
  document.getElementById("placementY").oninput = (e) => {
    S.placementY = parseInt(e.target.value) || 0;
    redraw();
  };
  document.getElementById("placementW").oninput = (e) => {
    const val = parseInt(e.target.value) || 1;
    S.placementW = val;
    placementDataCache = null;
    if (S.placementLockAspect && S.placementImage) {
      const aspect = S.placementImage.height / S.placementImage.width;
      S.placementH = Math.round(val * aspect) || 1;
      document.getElementById("placementH").value = S.placementH;
    }
    redraw();
  };
  document.getElementById("placementH").oninput = (e) => {
    const val = parseInt(e.target.value) || 1;
    S.placementH = val;
    placementDataCache = null;
    if (S.placementLockAspect && S.placementImage) {
      const aspect = S.placementImage.width / S.placementImage.height;
      S.placementW = Math.round(val * aspect) || 1;
      document.getElementById("placementW").value = S.placementW;
    }
    redraw();
  };
  document.getElementById("placementLockAspect").onchange = (e) => {
    S.placementLockAspect = e.target.checked;
  };
  document.getElementById("placementApplyBtn").onclick = applyImagePlacement;
  document.getElementById("placementCancelBtn").onclick = cancelImagePlacement;

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
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  sidebar.classList.toggle("collapsed");
  const isCollapsed = sidebar.classList.contains("collapsed");
  if (backdrop) {
    if (isCollapsed) {
      backdrop.classList.remove("active");
    } else {
      backdrop.classList.add("active");
    }
  }
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
  activeTemplate = name;
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

  if (_ovl && _ovl.el && _ovl.canvasW !== undefined) {
    _ovl.el.style.left = canvas.offsetLeft + _ovl.canvasX * S.zoom + "px";
    _ovl.el.style.top = canvas.offsetTop + _ovl.canvasY * S.zoom + "px";
    _ovl.el.style.width = _ovl.canvasW * S.zoom + "px";
    _ovl.el.style.height = _ovl.canvasH * S.zoom + "px";
  }
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

let placementDataCache = null;

function updatePlacementDataCache() {
  if (!S.placementImage || !S.placementW || !S.placementH) {
    placementDataCache = null;
    return;
  }
  const tc = document.createElement("canvas");
  const tx = tc.getContext("2d");
  tc.width = S.placementW;
  tc.height = S.placementH;
  tx.drawImage(S.placementImage, 0, 0, S.placementW, S.placementH);
  placementDataCache = tx.getImageData(0, 0, S.placementW, S.placementH).data;
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

  // Placed images drawn smoothly — grid will render on top of them
  placedImages.forEach((pi) => {
    ctx.save();
    ctx.globalAlpha = pi.opacity !== undefined ? pi.opacity : 1;
    ctx.drawImage(pi.img, pi.canvasX, pi.canvasY, pi.canvasW, pi.canvasH);
    ctx.restore();
  });

  // ── Draw Uploaded Border Image ─────────────────────────────────────
  if (S.uploadedBorderImage) {
    const cols = Math.floor(canvas.width / S.gridSize);
    const rows = Math.floor(canvas.height / S.gridSize);
    const aspect =
      S.uploadedBorderImage.naturalWidth / S.uploadedBorderImage.naturalHeight;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (activeTemplate === "border") {
      const tileH = canvas.height;
      const tileW = tileH * aspect;
      for (let tx = 0; tx < canvas.width; tx += tileW) {
        ctx.drawImage(S.uploadedBorderImage, tx, 0, tileW, tileH);
      }
    } else {
      let layout = S.borderImageLayout || "match";
      if (layout === "match") layout = activeBorderType; // 'plain', 'single', 'double', 'triple', 'four'

      let stripesCount = 0;
      if (layout === "single") stripesCount = 1;
      else if (layout === "double") stripesCount = 2;
      else if (layout === "triple") stripesCount = 3;
      else if (layout === "four") stripesCount = 4;

      if (stripesCount === 0) {
        const borderRowCount = Math.max(1, Math.floor(rows * 0.12));
        const borderHeight = borderRowCount * S.gridSize;
        const tileH = borderHeight;
        const tileW = tileH * aspect;

        // Top Border
        for (let tx = 0; tx < canvas.width; tx += tileW) {
          ctx.drawImage(S.uploadedBorderImage, tx, 0, tileW, tileH);
        }
        // Bottom Border
        if (activeTemplate === "saree") {
          for (let tx = 0; tx < canvas.width; tx += tileW) {
            ctx.drawImage(S.uploadedBorderImage, tx, canvas.height - tileH, tileW, tileH);
          }
        }
      } else {
        const stripeH = (S.borderStripeHeight || 3) * S.gridSize;
        const gapH = (S.borderGapHeight || 0) * S.gridSize;
        const tileW = stripeH * aspect;

        for (let i = 0; i < stripesCount; i++) {
          // Top Border Stripe i
          const topY = i * (stripeH + gapH);
          for (let tx = 0; tx < canvas.width; tx += tileW) {
            ctx.drawImage(S.uploadedBorderImage, tx, topY, tileW, stripeH);
          }
          // Bottom Border Stripe i (mirrored / stacked going inwards)
          if (activeTemplate === "saree") {
            const botY = canvas.height - (i + 1) * stripeH - i * gapH;
            for (let tx = 0; tx < canvas.width; tx += tileW) {
              ctx.drawImage(S.uploadedBorderImage, tx, botY, tileW, stripeH);
            }
          }
        }
      }
    }
    ctx.restore();
  }

  // ── Draw Uploaded Pallu Image ──────────────────────────────────────
  if (S.uploadedPalluImage && activeTemplate === "saree") {
    const b = getZoneBounds("pallu");
    const palluX = b.x0 * S.gridSize;
    const palluY = b.y0 * S.gridSize;
    const palluW = (b.x1 - b.x0 + 1) * S.gridSize;
    const palluH = (b.y1 - b.y0 + 1) * S.gridSize;
    const aspect =
      S.uploadedPalluImage.naturalWidth / S.uploadedPalluImage.naturalHeight;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const tileH = palluH;
    const tileW = tileH * aspect;
    for (let tx = palluX; tx < palluX + palluW; tx += tileW) {
      // Clip drawing to Pallu width so it doesn't overflow the Pallu bounds
      ctx.beginPath();
      ctx.rect(tx, palluY, Math.min(tileW, palluX + palluW - tx), palluH);
      ctx.clip();
      ctx.drawImage(S.uploadedPalluImage, tx, palluY, tileW, tileH);
    }
    ctx.restore();
  }

  // ── Draw Uploaded Pattern Image ────────────────────────────────────
  if (S.uploadedPatternImage) {
    const cols = Math.floor(canvas.width / S.gridSize);
    const rows = Math.floor(canvas.height / S.gridSize);

    // Determine the body bounds
    let x0 = 0,
      y0 = 0,
      x1 = cols - 1,
      y1 = rows - 1;
    if (activeTemplate === "saree") {
      const borderRowCount = Math.floor(rows * 0.12);
      x0 = 0;
      y0 = borderRowCount;
      x1 = Math.floor(cols * 0.7) - 1;
      y1 = rows - 1 - borderRowCount;
    }

    const occ = S.patternOccupancy || 1.0;
    const maxDim = S.gridSize * occ;
    const aspect =
      S.uploadedPatternImage.naturalWidth /
      S.uploadedPatternImage.naturalHeight;

    let targetW, targetH;
    if (aspect > 1) {
      targetW = maxDim;
      targetH = maxDim / aspect;
    } else {
      targetH = maxDim;
      targetW = maxDim * aspect;
    }

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const cellX = gx * S.gridSize;
        const cellY = gy * S.gridSize;
        const drawX = cellX + (S.gridSize - targetW) / 2;
        const drawY = cellY + (S.gridSize - targetH) / 2;
        ctx.drawImage(S.uploadedPatternImage, drawX, drawY, targetW, targetH);
      }
    }
    ctx.restore();
  }

  // Grid lines (cross-grid: horizontal + vertical + both diagonals per cell)
  if (S.showGrid) {
    ctx.strokeStyle = S.gridColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();

    // Horizontal lines
    for (let y = 0; y <= canvas.height; y += S.gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    // Vertical lines
    for (let x = 0; x <= canvas.width; x += S.gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }

    // Diagonal lines inside each cell (\ direction)
    const cols = Math.floor(canvas.width / S.gridSize);
    const rows = Math.floor(canvas.height / S.gridSize);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = col * S.gridSize;
        const cy = row * S.gridSize;
        // top-left to bottom-right
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + S.gridSize, cy + S.gridSize);
        // top-right to bottom-left
        ctx.moveTo(cx + S.gridSize, cy);
        ctx.lineTo(cx, cy + S.gridSize);
      }
    }

    ctx.stroke();

    // Superbox lines (thicker, drawn on top)
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

  // Image overlay is rendered as HTML element – no canvas drawing needed here

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
  const { gx, gy } = getGrid(e);
  if (S.placementImage) {
    if (
      gx >= S.placementX &&
      gx < S.placementX + S.placementW &&
      gy >= S.placementY &&
      gy < S.placementY + S.placementH
    ) {
      isDraggingPlacement = true;
      dragPlacementStart = {
        offsetX: gx - S.placementX,
        offsetY: gy - S.placementY,
      };
    }
    return;
  }
  isDrawing = true;
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

  if (isDraggingPlacement && dragPlacementStart) {
    S.placementX = gx - dragPlacementStart.offsetX;
    S.placementY = gy - dragPlacementStart.offsetY;
    document.getElementById("placementX").value = S.placementX;
    document.getElementById("placementY").value = S.placementY;
    redraw();
    return;
  }
  if (S.placementImage) return; // block other actions in placement mode

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
  if (isDraggingPlacement) {
    isDraggingPlacement = false;
    dragPlacementStart = null;
    return;
  }
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
  if (selActive) {
    const x0 = selRect.x;
    const y0 = selRect.y;
    const x1 = x0 + selRect.w;
    const y1 = y0 + selRect.h;
    for (let x = x0; x < x1; x++) {
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
    }
  } else {
    const cols = Math.floor(canvas.width / S.gridSize);
    const rows = Math.floor(canvas.height / S.gridSize);
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        if (inZone(x, y)) {
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
      }
    }
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
// ── INTERACTIVE IMAGE PLACEMENT ───────────────────────────────────────
// ── IMAGE OVERLAY (drag + resize) ────────────────────────────────────
let _ovl = null; // { el, img, vpRect, startX, startY, startLeft, startTop, startW, startH, resizeDir }

function startImagePlacement(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const imgEl = document.getElementById("overlayImg");
    const ovlEl = document.getElementById("imgOverlay");
    const vp = document.getElementById("canvasViewport");

    imgEl.src = ev.target.result;
    imgEl.onload = () => {
      // Start in centre at ~40% of canvas width on screen (layout pixels)
      const vpW = canvas.offsetWidth;
      const vpH = canvas.offsetHeight;
      const nat = imgEl.naturalWidth / imgEl.naturalHeight;
      const w = Math.round(vpW * 0.4);
      const h = Math.round(w / nat);
      const left = canvas.offsetLeft + Math.round((vpW - w) / 2);
      const top = canvas.offsetTop + Math.round((vpH - h) / 2);

      ovlEl.style.left = left + "px";
      ovlEl.style.top = top + "px";
      ovlEl.style.width = w + "px";
      ovlEl.style.height = h + "px";
      ovlEl.style.display = "block";

      // Store source image for apply step
      S.placementImage = imgEl;
      S.placementZone = "all";

      // Hide old placement panel — controls are now on the overlay toolbar
      document.getElementById("placementPanel").style.display = "none";

      _ovl = {
        el: ovlEl,
        img: imgEl,
        canvasX: (left - canvas.offsetLeft) / S.zoom,
        canvasY: (top - canvas.offsetTop) / S.zoom,
        canvasW: w / S.zoom,
        canvasH: h / S.zoom,
      };
      _bindOverlayEvents(ovlEl);
    };
  };
  reader.readAsDataURL(file);
}

function _bindOverlayEvents(ovlEl) {
  // Drag to move
  ovlEl.addEventListener("mousedown", _ovlMouseDown);
  // Resize handles
  ovlEl.querySelectorAll(".ovl-handle").forEach((h) => {
    h.addEventListener("mousedown", _ovlResizeDown);
  });
  // Toolbar buttons
  document.getElementById("ovlApplyBtn").onclick = applyImagePlacement;
  document.getElementById("ovlCancelBtn").onclick = cancelImagePlacement;
}

function _ovlMouseDown(e) {
  if (e.target.classList.contains("ovl-handle")) return;
  if (e.target.closest(".ovl-toolbar")) return;
  e.preventDefault();
  const ovlEl = document.getElementById("imgOverlay");
  _ovl.startX = e.clientX;
  _ovl.startY = e.clientY;
  _ovl.startLeft = parseInt(ovlEl.style.left) || 0;
  _ovl.startTop = parseInt(ovlEl.style.top) || 0;
  _ovl.dragging = true;
  document.addEventListener("mousemove", _ovlMouseMove);
  document.addEventListener("mouseup", _ovlMouseUp);
}

function _ovlMouseMove(e) {
  if (!_ovl) return;
  const ovlEl = document.getElementById("imgOverlay");
  if (_ovl.dragging) {
    const left = _ovl.startLeft + e.clientX - _ovl.startX;
    const top = _ovl.startTop + e.clientY - _ovl.startY;
    ovlEl.style.left = left + "px";
    ovlEl.style.top = top + "px";
    _ovl.canvasX = (left - canvas.offsetLeft) / S.zoom;
    _ovl.canvasY = (top - canvas.offsetTop) / S.zoom;
  } else if (_ovl.resizeDir) {
    const dx = e.clientX - _ovl.startX;
    const dy = e.clientY - _ovl.startY;
    const dir = _ovl.resizeDir;
    let left = _ovl.startLeft,
      top = _ovl.startTop;
    let w = _ovl.startW,
      h = _ovl.startH;
    const MIN = 30;

    if (dir.includes("e")) w = Math.max(MIN, _ovl.startW + dx);
    if (dir.includes("s")) h = Math.max(MIN, _ovl.startH + dy);
    if (dir.includes("w")) {
      w = Math.max(MIN, _ovl.startW - dx);
      left = _ovl.startLeft + (_ovl.startW - w);
    }
    if (dir.includes("n")) {
      h = Math.max(MIN, _ovl.startH - dy);
      top = _ovl.startTop + (_ovl.startH - h);
    }

    ovlEl.style.left = left + "px";
    ovlEl.style.top = top + "px";
    ovlEl.style.width = w + "px";
    ovlEl.style.height = h + "px";

    _ovl.canvasX = (left - canvas.offsetLeft) / S.zoom;
    _ovl.canvasY = (top - canvas.offsetTop) / S.zoom;
    _ovl.canvasW = w / S.zoom;
    _ovl.canvasH = h / S.zoom;
  }
}

function _ovlMouseUp() {
  if (_ovl) {
    _ovl.dragging = false;
    _ovl.resizeDir = null;
  }
  document.removeEventListener("mousemove", _ovlMouseMove);
  document.removeEventListener("mouseup", _ovlMouseUp);
}

function _ovlResizeDown(e) {
  e.preventDefault();
  e.stopPropagation();
  const ovlEl = document.getElementById("imgOverlay");
  _ovl.startX = e.clientX;
  _ovl.startY = e.clientY;
  _ovl.startLeft = parseInt(ovlEl.style.left) || 0;
  _ovl.startTop = parseInt(ovlEl.style.top) || 0;
  _ovl.startW = parseInt(ovlEl.style.width) || ovlEl.offsetWidth;
  _ovl.startH = parseInt(ovlEl.style.height) || ovlEl.offsetHeight;
  _ovl.resizeDir = e.currentTarget.dataset.dir;
  _ovl.dragging = false;
  document.addEventListener("mousemove", _ovlMouseMove);
  document.addEventListener("mouseup", _ovlMouseUp);
}

function applyImagePlacement() {
  if (!S.placementImage) return;

  const ovlEl = document.getElementById("imgOverlay");

  // Pixel offset of overlay relative to canvas viewport (accounting for zoom)
  const ovlLeft = parseInt(ovlEl.style.left) || 0;
  const ovlTop = parseInt(ovlEl.style.top) || 0;
  const ovlWidth = parseInt(ovlEl.style.width) || ovlEl.offsetWidth;
  const ovlHeight = parseInt(ovlEl.style.height) || ovlEl.offsetHeight;

  // Convert to true canvas pixel coords (undo zoom and offsets relative to canvas viewport)
  const canvasX = (ovlLeft - canvas.offsetLeft) / S.zoom;
  const canvasY = (ovlTop - canvas.offsetTop) / S.zoom;
  const canvasW = ovlWidth / S.zoom;
  const canvasH = ovlHeight / S.zoom;

  // Store as a smooth placed image — drawn directly on canvas, grid goes on top
  placedImages.push({
    img: S.placementImage,
    canvasX,
    canvasY,
    canvasW,
    canvasH,
    opacity: S.drawOpacity,
  });

  cancelImagePlacement();
  redraw();
}

function cancelImagePlacement() {
  S.placementImage = null;
  S.placementX = 0;
  S.placementY = 0;
  S.placementW = 0;
  S.placementH = 0;
  placementDataCache = null;
  _ovl = null;

  const ovlEl = document.getElementById("imgOverlay");
  if (ovlEl) ovlEl.style.display = "none";
  document.getElementById("placementPanel").style.display = "none";
  document.getElementById("imageUpload").value = "";

  // Unbind document listeners
  document.removeEventListener("mousemove", _ovlMouseMove);
  document.removeEventListener("mouseup", _ovlMouseUp);

  redraw();
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
  placedImages = []; // also remove placed images
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

// ══════════════════════════════════════════════════════════════════════
// BORDER TYPE SELECTOR
// ══════════════════════════════════════════════════════════════════════

const BORDER_TYPES = {
  plain: { label: "Plain", stripes: 0, defaultColors: [] },
  single: { label: "Single", stripes: 1, defaultColors: ["#d4af37"] },
  double: {
    label: "Double",
    stripes: 2,
    defaultColors: ["#d4af37", "#8e1a4e"],
  },
  triple: {
    label: "Triple",
    stripes: 3,
    defaultColors: ["#d4af37", "#8e1a4e", "#e74c3c"],
  },
  four: {
    label: "Four",
    stripes: 4,
    defaultColors: ["#d4af37", "#8e1a4e", "#e74c3c", "#f39c12"],
  },
};

let activeBorderType = "plain";
const borderTypeColors = {};
Object.keys(BORDER_TYPES).forEach((k) => {
  borderTypeColors[k] = [...BORDER_TYPES[k].defaultColors];
});

// ── Colour helpers ────────────────────────────────────────────────────
function _darken(hex, amount) {
  let { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    Math.max(0, r - amount),
    Math.max(0, g - amount),
    Math.max(0, b - amount)
  );
}
function _lighten(hex, amount) {
  let { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    Math.min(255, r + amount),
    Math.min(255, g + amount),
    Math.min(255, b + amount)
  );
}
function _alpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Draw woven-texture fill on a region ───────────────────────────────
function _drawWovenRegion(cx, x, y, w, h, col1, col2) {
  const ts = 4; // thread size
  for (let px = x; px < x + w; px += ts) {
    for (let py = y; py < y + h; py += ts) {
      const even = (Math.floor(px / ts) + Math.floor(py / ts)) % 2 === 0;
      cx.fillStyle = even ? col1 : col2;
      cx.fillRect(px, py, Math.min(ts, x + w - px), Math.min(ts, y + h - py));
    }
  }
}

// ── Draw ikat/zigzag stripe pattern ───────────────────────────────────
function _drawStripePattern(cx, x, y, w, h, col, idx) {
  // Base fill
  cx.fillStyle = col;
  cx.fillRect(x, y, w, h);

  // Overlay woven threads
  _drawWovenRegion(cx, x, y, w, h, col, _darken(col, 45));

  // Pattern overlay based on stripe index
  cx.save();
  cx.beginPath();
  cx.rect(x, y, w, h);
  cx.clip();

  const goldLight = _lighten(col, 80);
  cx.strokeStyle = _alpha(goldLight, 0.55);
  cx.lineWidth = 1;

  if (idx % 4 === 0) {
    // Zigzag
    const step = 6;
    for (let px = x - step; px < x + w + step; px += step) {
      cx.beginPath();
      for (let py = y; py < y + h; py += step) {
        const xPos = px + (Math.floor(py / step) % 2 === 0 ? step / 2 : 0);
        if (py === y) cx.moveTo(xPos, py);
        else cx.lineTo(xPos, py);
      }
      cx.stroke();
    }
  } else if (idx % 4 === 1) {
    // Diamond dots
    cx.fillStyle = _alpha(goldLight, 0.45);
    for (let px = x + 3; px < x + w; px += 8) {
      for (let py = y + 3; py < y + h; py += 8) {
        cx.beginPath();
        cx.arc(px, py, 1.5, 0, Math.PI * 2);
        cx.fill();
      }
    }
  } else if (idx % 4 === 2) {
    // Diagonal grid
    for (let px = x; px < x + w; px += 5) {
      cx.beginPath();
      cx.moveTo(px, y);
      cx.lineTo(px + h, y + h);
      cx.stroke();
    }
  } else {
    // Wave lines
    for (let py = y + 3; py < y + h; py += 5) {
      cx.beginPath();
      for (let px = x; px <= x + w; px += 2) {
        const wy = py + Math.sin((px - x) * 0.4) * 1.5;
        if (px === x) cx.moveTo(px, wy);
        else cx.lineTo(px, wy);
      }
      cx.stroke();
    }
  }

  cx.restore();

  // Gold edge line on each stripe boundary
  cx.strokeStyle = _alpha("#ffd700", 0.8);
  cx.lineWidth = 1;
  cx.beginPath();
  cx.moveTo(x, y);
  cx.lineTo(x + w, y);
  cx.stroke();
  cx.beginPath();
  cx.moveTo(x, y + h);
  cx.lineTo(x + w, y + h);
  cx.stroke();
}

// ── Rich thumbnail renderer ───────────────────────────────────────────
function drawBorderThumb(type) {
  const cv = document.getElementById(`bthumb-${type}`);
  if (!cv) return;
  const cx = cv.getContext("2d");
  const W = cv.width,
    H = cv.height;
  const cfg = BORDER_TYPES[type];
  const colors = borderTypeColors[type];

  const bodyCol = document.getElementById("btBodyColor")?.value || "#8e1a4e";
  const palluCol = document.getElementById("btPalluColor")?.value || "#c0392b";

  // ── 1. Clear ─────────────────────────────────────────────────────
  cx.clearRect(0, 0, W, H);

  // Zones: body = left 72%, pallu = right 28%
  const palluX = Math.floor(W * 0.72);
  const bodyW = palluX;

  // ── 2. Body background (woven texture) ───────────────────────────
  _drawWovenRegion(cx, 0, 0, bodyW, H, bodyCol, _darken(bodyCol, 35));

  // ── 3. Pallu (right section – denser pattern) ────────────────────
  _drawWovenRegion(
    cx,
    palluX,
    0,
    W - palluX,
    H,
    palluCol,
    _darken(palluCol, 45)
  );
  // Extra pallu diamond motifs
  cx.fillStyle = _alpha(_lighten(palluCol, 70), 0.35);
  const motifS = 10;
  for (let px = palluX + 5; px < W; px += motifS) {
    for (let py = 5; py < H; py += motifS) {
      cx.beginPath();
      cx.moveTo(px, py - 3);
      cx.lineTo(px + 3, py);
      cx.lineTo(px, py + 3);
      cx.lineTo(px - 3, py);
      cx.closePath();
      cx.fill();
    }
  }

  // ── 4. Gold divider between body and pallu ───────────────────────
  cx.fillStyle = "#d4af37";
  cx.fillRect(palluX - 2, 0, 4, H);

  // ── 5. Border stripes (top + bottom, mirrored) ───────────────────
  if (cfg.stripes > 0) {
    // Stripe height scales so all stripes fit within ~38% of H each side
    const totalStripeH = Math.floor(H * 0.38);
    const stripeH = Math.max(5, Math.floor(totalStripeH / cfg.stripes));

    for (let i = 0; i < cfg.stripes; i++) {
      const col = colors[i] || "#d4af37";
      const topY = i * stripeH;
      const botY = H - (i + 1) * stripeH;

      _drawStripePattern(cx, 0, topY, bodyW, stripeH, col, i);
      _drawStripePattern(cx, 0, botY, bodyW, stripeH, col, i);
    }
  }

  // ── 6. Overall border frame ──────────────────────────────────────
  cx.strokeStyle = _alpha("#d4af37", 0.6);
  cx.lineWidth = 1;
  cx.strokeRect(0.5, 0.5, W - 1, H - 1);

  // ── 7. Label badge ───────────────────────────────────────────────
  const label = cfg.label + (cfg.stripes > 0 ? ` (${cfg.stripes})` : "");
  cx.fillStyle = "rgba(0,0,0,0.55)";
  const tw = cx.measureText(label).width + 10;
  cx.fillRect(4, H - 17, tw, 14);
  cx.fillStyle = "#ffffff";
  cx.font = "bold 9px sans-serif";
  cx.fillText(label, 9, H - 6);
}

function drawAllBorderThumbs() {
  Object.keys(BORDER_TYPES).forEach(drawBorderThumb);
}

// ── Border colour pickers ─────────────────────────────────────────────
function renderBorderColorPickers(type) {
  const cfg = BORDER_TYPES[type];
  const wrap = document.getElementById("borderColors");
  const rows = document.getElementById("borderColorRows");
  if (!wrap || !rows) return;

  if (cfg.stripes === 0) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "block";
  rows.innerHTML = "";

  for (let i = 0; i < cfg.stripes; i++) {
    const row = document.createElement("div");
    row.className = "border-color-row";
    const lbl = document.createElement("label");
    lbl.textContent = `Stripe ${i + 1}`;
    const inp = document.createElement("input");
    inp.type = "color";
    inp.value = borderTypeColors[type][i] || "#d4af37";
    const idx = i;
    inp.addEventListener("input", (e) => {
      borderTypeColors[type][idx] = e.target.value;
      drawBorderThumb(type);
    });
    row.appendChild(lbl);
    row.appendChild(inp);
    rows.appendChild(row);
  }
}

// ── Apply border layout to canvas ────────────────────────────────────
function applyBorderTypeToCanvas() {
  const type = activeBorderType;
  const cfg = BORDER_TYPES[type];
  const colors = borderTypeColors[type];
  const bodyCol = document.getElementById("btBodyColor")?.value || "#8e1a4e";
  const palluCol = document.getElementById("btPalluColor")?.value || "#c0392b";

  saveState();
  layers[0].boxes.clear();

  const cols = Math.floor(canvas.width / S.gridSize);
  const rows = Math.floor(canvas.height / S.gridSize);
  const bodyEndCol = Math.floor(cols * 0.7);
  const palluStartCol = Math.floor(cols * 0.72);

  const toRgbaStr = (hex) => {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},1)`;
  };

  // Body
  const bodyStr = toRgbaStr(bodyCol);
  for (let x = 0; x < bodyEndCol; x++)
    for (let y = 0; y < rows; y++) layers[0].boxes.set(`${x},${y}`, bodyStr);

  // Pallu (checkerboard)
  for (let x = palluStartCol; x < cols; x++)
    for (let y = 0; y < rows; y++) {
      const col = patternColor(
        x,
        y,
        "checkerboard",
        palluCol,
        _darken(palluCol, 30),
        2
      );
      layers[0].boxes.set(`${x},${y}`, col);
    }

  // Border stripes — each stripe = 3 grid rows tall (top + bottom mirror)
  if (cfg.stripes > 0) {
    const stripeRows = 3;
    for (let i = 0; i < cfg.stripes; i++) {
      const strCol = colors[i] || "#d4af37";
      const patTypes = ["zigzag", "diamond", "wave", "checkerboard"];
      const patType = patTypes[i % patTypes.length];

      for (let x = 0; x < bodyEndCol; x++) {
        for (let dy = 0; dy < stripeRows; dy++) {
          // top
          const ty = i * stripeRows + dy;
          if (ty < rows)
            layers[0].boxes.set(
              `${x},${ty}`,
              patternColor(x, ty, patType, strCol, _darken(strCol, 40), 2)
            );
          // bottom mirror
          const by = rows - 1 - (i * stripeRows + dy);
          if (by >= 0)
            layers[0].boxes.set(
              `${x},${by}`,
              patternColor(x, by, patType, strCol, _darken(strCol, 40), 2)
            );
        }
      }
    }
  }

  redraw();
  renderLayers();
}

// ── Wire up panel ────────────────────────────────────────────────────
function initBorderTypePanel() {
  const title = document.getElementById("borderTypePanelTitle");
  const body = document.getElementById("borderTypeBody");
  const chevron = document.getElementById("borderTypePanelChevron");

  if (title && body && chevron) {
    title.addEventListener("click", () => {
      const open = body.classList.toggle("expanded");
      chevron.classList.toggle("open", open);
      if (open) drawAllBorderThumbs();
    });
  }

  document.querySelectorAll(".border-type-card").forEach((card) => {
    card.addEventListener("click", () => {
      document
        .querySelectorAll(".border-type-card")
        .forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      activeBorderType = card.dataset.border;
      renderBorderColorPickers(activeBorderType);
      drawAllBorderThumbs();
      redraw();
    });
  });

  ["btBodyColor", "btPalluColor"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", drawAllBorderThumbs);
  });

  const applyBtn = document.getElementById("applyBorderTypeBtn");
  if (applyBtn) applyBtn.addEventListener("click", applyBorderTypeToCanvas);

  // Panel starts expanded — draw thumbs immediately
  drawAllBorderThumbs();
  // Belt-and-suspenders: also draw after fonts/layout settle
  setTimeout(drawAllBorderThumbs, 300);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initBorderTypePanel);
} else {
  initBorderTypePanel();
}

// ══════════════════════════════════════════════════════════════════════
// PREDEFINED BORDER DESIGNS
// Inspired by Sambalpuri / Odisha ikat saree borders
// ══════════════════════════════════════════════════════════════════════

const BORDER_DESIGNS = [
  {
    id: "sambalpuri_ikat",
    label: "Sambalpuri Ikat",
    desc: "Odisha border with temple Kumbha spikes, Rudraksha bands, and Pasapali checkers",
    colors: {
      stripe1: "#cc0000",
      stripe2: "#111111",
      accent: "#ffffff",
      body: "#8e1a4e",
    },
    draw(cx, x, y, w, h) {
      // 1. Outer Edge Solid Band (top 12% of height)
      const bandH1 = Math.max(2, Math.floor(h * 0.12));
      cx.fillStyle = this.colors.stripe1;
      cx.fillRect(x, y, w, bandH1);

      // Fine gold/white stripe below it
      cx.strokeStyle = this.colors.accent;
      cx.lineWidth = 1;
      cx.beginPath();
      cx.moveTo(x, y + bandH1);
      cx.lineTo(x + w, y + bandH1);
      cx.stroke();

      // 2. First Rudraksha Bead Stripe (from 12% to 24%)
      const rudH = Math.max(2, Math.floor(h * 0.12));
      const rudY1 = y + bandH1;
      cx.fillStyle = this.colors.stripe2;
      cx.fillRect(x, rudY1, w, rudH);

      // Draw little Rudraksha beads (diamonds with a dot)
      cx.fillStyle = this.colors.accent;
      const beadSize = Math.max(3, Math.floor(rudH * 0.5));
      const beadStep = beadSize * 2.5;
      const centerY1 = rudY1 + rudH / 2;

      for (let bx = x + beadSize; bx < x + w; bx += beadStep) {
        cx.beginPath();
        cx.moveTo(bx, centerY1 - beadSize / 2);
        cx.lineTo(bx + beadSize / 2, centerY1);
        cx.lineTo(bx, centerY1 + beadSize / 2);
        cx.lineTo(bx - beadSize / 2, centerY1);
        cx.closePath();
        cx.fill();
      }

      // Separator line
      const sepY1 = rudY1 + rudH;
      cx.strokeStyle = this.colors.accent;
      cx.beginPath();
      cx.moveTo(x, sepY1);
      cx.lineTo(x + w, sepY1);
      cx.stroke();

      // 3. Central Pasapali Checkerboard Blocks (from 24% to 64%)
      const checkerH = Math.max(6, Math.floor(h * 0.4));
      const checkerY = sepY1;
      cx.fillStyle = this.colors.stripe2;
      cx.fillRect(x, checkerY, w, checkerH);

      const blockSize = Math.max(10, Math.floor(checkerH * 0.85));
      const blockPadding = Math.max(1, Math.floor((checkerH - blockSize) / 2));
      const step = blockSize + blockPadding * 3;

      for (let px = x + blockPadding; px < x + w - blockSize; px += step) {
        // Draw white frame around checker block
        cx.strokeStyle = this.colors.accent;
        cx.lineWidth = 1;
        cx.strokeRect(px, checkerY + blockPadding, blockSize, blockSize);

        // Draw 4x4 checkerboard inside block
        const cell = blockSize / 4;
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            const isStripe1 = (r + c) % 2 === 0;
            cx.fillStyle = isStripe1 ? this.colors.stripe1 : this.colors.accent;
            cx.fillRect(
              px + c * cell,
              checkerY + blockPadding + r * cell,
              cell,
              cell
            );
          }
        }
      }

      // Separator line
      const sepY2 = checkerY + checkerH;
      cx.strokeStyle = this.colors.accent;
      cx.beginPath();
      cx.moveTo(x, sepY2);
      cx.lineTo(x + w, sepY2);
      cx.stroke();

      // 4. Second Rudraksha Bead Stripe (from 64% to 76%)
      const rudY2 = sepY2;
      cx.fillStyle = this.colors.stripe2;
      cx.fillRect(x, rudY2, w, rudH);

      const centerY2 = rudY2 + rudH / 2;
      cx.fillStyle = this.colors.accent;
      for (let bx = x + beadSize; bx < x + w; bx += beadStep) {
        cx.beginPath();
        cx.moveTo(bx, centerY2 - beadSize / 2);
        cx.lineTo(bx + beadSize / 2, centerY2);
        cx.lineTo(bx, centerY2 + beadSize / 2);
        cx.lineTo(bx - beadSize / 2, centerY2);
        cx.closePath();
        cx.fill();
      }

      // Separator line
      const sepY3 = rudY2 + rudH;
      cx.strokeStyle = this.colors.accent;
      cx.beginPath();
      cx.moveTo(x, sepY3);
      cx.lineTo(x + w, sepY3);
      cx.stroke();

      // 5. Kumbha Temple Spikes (from 76% to 100%)
      const spikeH = h - (sepY3 - y);
      const spikeW = Math.max(8, Math.floor(spikeH * 1.2));

      cx.fillStyle = this.colors.stripe1;
      cx.strokeStyle = this.colors.accent;
      cx.lineWidth = 1;

      for (let px = x + 3; px < x + w - spikeW; px += spikeW * 1.3) {
        // Triangle pointing inwards (downwards from sepY3)
        cx.beginPath();
        cx.moveTo(px, sepY3);
        cx.lineTo(px + spikeW / 2, sepY3 + spikeH);
        cx.lineTo(px + spikeW, sepY3);
        cx.closePath();
        cx.fill();
        cx.stroke();

        // Small inner triangle accent
        cx.fillStyle = this.colors.accent;
        cx.beginPath();
        cx.moveTo(px + spikeW * 0.3, sepY3);
        cx.lineTo(px + spikeW / 2, sepY3 + spikeH * 0.4);
        cx.lineTo(px + spikeW * 0.7, sepY3);
        cx.closePath();
        cx.fill();
        cx.fillStyle = this.colors.stripe1; // reset fill
      }
    },
  },
  {
    id: "ikatchecker",
    label: "Ikat Checker",
    desc: "Pink/black ikat checkerboard rows — classic Sambalpuri cotton",
    colors: {
      stripe1: "#d63384",
      stripe2: "#1a1a2e",
      accent: "#f8c8e0",
      body: "#c0c0c0",
    },
    draw(cx, x, y, w, h) {
      const cell = Math.max(4, Math.floor(h / 6));
      for (let row = 0; row < Math.ceil(h / cell); row++) {
        const ry = y + row * cell;
        const rh = Math.min(cell, y + h - ry);
        const baseCol =
          row % 2 === 0 ? this.colors.stripe1 : this.colors.stripe2;
        // Ikat checker effect
        for (let col = 0; col < Math.ceil(w / cell); col++) {
          const rx = x + col * cell;
          const rw = Math.min(cell, x + w - rx);
          const even = (row + col) % 2 === 0;
          cx.fillStyle = even ? baseCol : this.colors.accent;
          cx.fillRect(rx, ry, rw, rh);
          // Ikat blur lines
          cx.strokeStyle = "rgba(0,0,0,0.25)";
          cx.lineWidth = 1;
          cx.beginPath();
          cx.moveTo(rx, ry);
          cx.lineTo(rx + rw, ry + rh);
          cx.stroke();
        }
      }
    },
  },
  {
    id: "peacockikat",
    label: "Peacock Ikat",
    desc: "Teal/maroon with peacock-motif ikat repeat",
    colors: {
      stripe1: "#0e7c6c",
      stripe2: "#4a0e2e",
      accent: "#d4af37",
      body: "#006655",
    },
    draw(cx, x, y, w, h) {
      // Base teal fill
      cx.fillStyle = this.colors.stripe1;
      cx.fillRect(x, y, w, h);
      // Maroon band in center
      const bandH = Math.floor(h * 0.4);
      const bandY = y + Math.floor(h * 0.3);
      cx.fillStyle = this.colors.stripe2;
      cx.fillRect(x, bandY, w, bandH);
      // Gold peacock-eye dots
      cx.fillStyle = this.colors.accent;
      const step = Math.max(10, Math.floor(w / 8));
      for (let px = x + step / 2; px < x + w; px += step) {
        // Eye shape
        cx.beginPath();
        cx.ellipse(
          px,
          bandY + bandH / 2,
          step * 0.3,
          bandH * 0.35,
          0,
          0,
          Math.PI * 2
        );
        cx.fill();
        cx.strokeStyle = this.colors.stripe1;
        cx.lineWidth = 1.5;
        cx.stroke();
        // Inner dot
        cx.fillStyle = this.colors.stripe2;
        cx.beginPath();
        cx.arc(px, bandY + bandH / 2, step * 0.1, 0, Math.PI * 2);
        cx.fill();
        cx.fillStyle = this.colors.accent;
      }
      // Gold edge lines
      cx.strokeStyle = this.colors.accent;
      cx.lineWidth = 2;
      [y + 1, y + h - 2].forEach((ly) => {
        cx.beginPath();
        cx.moveTo(x, ly);
        cx.lineTo(x + w, ly);
        cx.stroke();
      });
    },
  },
  {
    id: "diamondgrid",
    label: "Diamond Grid",
    desc: "Blue base with red/white diamond lattice — Pasapali style",
    colors: {
      stripe1: "#1a1aff",
      stripe2: "#cc0000",
      accent: "#ffffff",
      body: "#0000cc",
    },
    draw(cx, x, y, w, h) {
      cx.fillStyle = this.colors.stripe1;
      cx.fillRect(x, y, w, h);
      const d = Math.max(8, Math.floor(h / 4));
      cx.strokeStyle = this.colors.accent;
      cx.lineWidth = 1.5;
      for (let px = x - d; px < x + w + d; px += d) {
        for (let py = y - d; py < y + h + d; py += d) {
          cx.beginPath();
          cx.moveTo(px + d / 2, py);
          cx.lineTo(px + d, py + d / 2);
          cx.lineTo(px + d / 2, py + d);
          cx.lineTo(px, py + d / 2);
          cx.closePath();
          cx.stroke();
          // Alternate fill
          if ((Math.floor((px - x) / d) + Math.floor((py - y) / d)) % 2 === 0) {
            cx.fillStyle = this.colors.stripe2;
            cx.fill();
          }
        }
      }
    },
  },
  {
    id: "zigzagikat",
    label: "Zigzag Ikat",
    desc: "Red/black diagonal zigzag ikat — typical cotton border",
    colors: {
      stripe1: "#cc1111",
      stripe2: "#111111",
      accent: "#f5c518",
      body: "#aa0000",
    },
    draw(cx, x, y, w, h) {
      const rowH = Math.max(4, Math.floor(h / 5));
      for (let row = 0; row < 5; row++) {
        const ry = y + row * rowH;
        const rh = Math.min(rowH, y + h - ry);
        const col = row % 2 === 0 ? this.colors.stripe1 : this.colors.stripe2;
        cx.fillStyle = col;
        cx.fillRect(x, ry, w, rh);
        // Zigzag overlay
        cx.strokeStyle = this.colors.accent;
        cx.lineWidth = 1.2;
        const step = 8;
        cx.beginPath();
        let toggle = false;
        for (let px = x; px <= x + w; px += step) {
          const zy = ry + (toggle ? rh * 0.2 : rh * 0.8);
          if (px === x) cx.moveTo(px, zy);
          else cx.lineTo(px, zy);
          toggle = !toggle;
        }
        cx.stroke();
      }
    },
  },
  {
    id: "floralscroll",
    label: "Floral Scroll",
    desc: "Maroon with gold floral scrollwork — rich pallu border",
    colors: {
      stripe1: "#6b0f1a",
      stripe2: "#d4af37",
      accent: "#f5e6c8",
      body: "#4a0a12",
    },
    draw(cx, x, y, w, h) {
      cx.fillStyle = this.colors.stripe1;
      cx.fillRect(x, y, w, h);
      // Gold scroll vine line
      cx.strokeStyle = this.colors.stripe2;
      cx.lineWidth = 1.5;
      const midY = y + h / 2;
      cx.beginPath();
      for (let px = x; px <= x + w; px += 2) {
        const vy = midY + Math.sin((px - x) * 0.12) * (h * 0.25);
        if (px === x) cx.moveTo(px, vy);
        else cx.lineTo(px, vy);
      }
      cx.stroke();
      // Floral dots along vine
      cx.fillStyle = this.colors.accent;
      const flStep = Math.max(12, Math.floor(w / 10));
      for (let px = x + flStep / 2; px < x + w; px += flStep) {
        const fy = midY + Math.sin((px - x) * 0.12) * (h * 0.25);
        // Petal cluster
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2;
          cx.beginPath();
          cx.ellipse(
            px + Math.cos(ang) * h * 0.15,
            fy + Math.sin(ang) * h * 0.15,
            h * 0.09,
            h * 0.05,
            ang,
            0,
            Math.PI * 2
          );
          cx.fill();
        }
        cx.fillStyle = this.colors.stripe2;
        cx.beginPath();
        cx.arc(px, fy, h * 0.07, 0, Math.PI * 2);
        cx.fill();
        cx.fillStyle = this.colors.accent;
      }
      // Gold edge lines
      cx.strokeStyle = this.colors.stripe2;
      cx.lineWidth = 2;
      [y + 1, y + h - 2].forEach((ly) => {
        cx.beginPath();
        cx.moveTo(x, ly);
        cx.lineTo(x + w, ly);
        cx.stroke();
      });
    },
  },
  {
    id: "elephantrow",
    label: "Elephant Row",
    desc: "Mauve/red with elephant procession motif — Pattachitra style",
    colors: {
      stripe1: "#8b1a4a",
      stripe2: "#d4622a",
      accent: "#f5deb3",
      body: "#6b0f35",
    },
    draw(cx, x, y, w, h) {
      cx.fillStyle = this.colors.stripe1;
      cx.fillRect(x, y, w, h);
      // Red band top/bottom
      const bandH = Math.floor(h * 0.18);
      cx.fillStyle = this.colors.stripe2;
      cx.fillRect(x, y, w, bandH);
      cx.fillRect(x, y + h - bandH, w, bandH);
      // Elephant silhouettes
      const elW = Math.max(16, Math.floor(h * 0.6));
      const elH = Math.floor(h * 0.55);
      const elY = y + Math.floor(h * 0.22);
      cx.fillStyle = this.colors.accent;
      for (let px = x + elW / 2; px < x + w; px += elW * 1.4) {
        // Body oval
        cx.beginPath();
        cx.ellipse(
          px,
          elY + elH * 0.45,
          elW * 0.38,
          elH * 0.32,
          0,
          0,
          Math.PI * 2
        );
        cx.fill();
        // Head
        cx.beginPath();
        cx.arc(px + elW * 0.3, elY + elH * 0.28, elH * 0.2, 0, Math.PI * 2);
        cx.fill();
        // Trunk
        cx.strokeStyle = this.colors.accent;
        cx.lineWidth = Math.max(2, elH * 0.08);
        cx.beginPath();
        cx.moveTo(px + elW * 0.45, elY + elH * 0.35);
        cx.bezierCurveTo(
          px + elW * 0.6,
          elY + elH * 0.5,
          px + elW * 0.55,
          elY + elH * 0.72,
          px + elW * 0.35,
          elY + elH * 0.78
        );
        cx.stroke();
        // Legs
        for (let l = 0; l < 3; l++) {
          cx.strokeStyle = this.colors.accent;
          cx.lineWidth = Math.max(2, elH * 0.07);
          cx.beginPath();
          cx.moveTo(px - elW * 0.2 + l * elW * 0.2, elY + elH * 0.7);
          cx.lineTo(px - elW * 0.2 + l * elW * 0.2, elY + elH * 0.92);
          cx.stroke();
        }
      }
      // Gold edge
      cx.strokeStyle = this.colors.accent;
      cx.lineWidth = 1.5;
      [y + bandH, y + h - bandH].forEach((ly) => {
        cx.beginPath();
        cx.moveTo(x, ly);
        cx.lineTo(x + w, ly);
        cx.stroke();
      });
    },
  },
  {
    id: "deertemple",
    label: "Deer & Temple",
    desc: "Teal background with deer and temple arch motifs — ikat weave",
    colors: {
      stripe1: "#0a5c52",
      stripe2: "#7a1a3a",
      accent: "#f0c060",
      body: "#085045",
    },
    draw(cx, x, y, w, h) {
      cx.fillStyle = this.colors.stripe1;
      cx.fillRect(x, y, w, h);
      const archW = Math.max(18, Math.floor(h * 0.7));
      const archH = Math.floor(h * 0.75);
      const archY = y + Math.floor(h * 0.13);
      cx.fillStyle = this.colors.stripe2;
      // Temple arches
      for (let px = x + archW * 0.5; px < x + w; px += archW * 1.6) {
        // Arch
        cx.beginPath();
        cx.moveTo(px - archW * 0.3, archY + archH);
        cx.lineTo(px - archW * 0.3, archY + archH * 0.4);
        cx.arc(px, archY + archH * 0.4, archW * 0.3, Math.PI, 0, false);
        cx.lineTo(px + archW * 0.3, archY + archH);
        cx.closePath();
        cx.fill();
        cx.strokeStyle = this.colors.accent;
        cx.lineWidth = 1.2;
        cx.stroke();
        // Spire
        cx.fillStyle = this.colors.accent;
        cx.beginPath();
        cx.moveTo(px, archY - archH * 0.05);
        cx.lineTo(px - archW * 0.1, archY + archH * 0.1);
        cx.lineTo(px + archW * 0.1, archY + archH * 0.1);
        cx.closePath();
        cx.fill();
        cx.fillStyle = this.colors.stripe2;
        // Deer between arches
        if (px + archW * 0.8 < x + w) {
          const dx = px + archW * 0.85,
            dy = archY + archH * 0.3;
          cx.strokeStyle = this.colors.accent;
          cx.lineWidth = Math.max(1.5, archH * 0.06);
          cx.beginPath();
          cx.arc(dx, dy, archH * 0.15, 0, Math.PI * 2);
          cx.stroke();
          // Legs
          [
            [
              dx - archH * 0.1,
              dy + archH * 0.15,
              dx - archH * 0.15,
              dy + archH * 0.4,
            ],
            [
              dx + archH * 0.1,
              dy + archH * 0.15,
              dx + archH * 0.05,
              dy + archH * 0.4,
            ],
          ].forEach(([x1, y1, x2, y2]) => {
            cx.beginPath();
            cx.moveTo(x1, y1);
            cx.lineTo(x2, y2);
            cx.stroke();
          });
        }
      }
      cx.strokeStyle = this.colors.accent;
      cx.lineWidth = 1.5;
      [y + 1, y + h - 2].forEach((ly) => {
        cx.beginPath();
        cx.moveTo(x, ly);
        cx.lineTo(x + w, ly);
        cx.stroke();
      });
    },
  },
  {
    id: "geomwave",
    label: "Geom Wave",
    desc: "Black/red with geometric wave-repeat — Bomkai tribal style",
    colors: {
      stripe1: "#111111",
      stripe2: "#cc0000",
      accent: "#ffffff",
      body: "#1a1a1a",
    },
    draw(cx, x, y, w, h) {
      // Alternate black and red rows
      const nRows = 4;
      const rh = Math.floor(h / nRows);
      const rowCols = [
        this.colors.stripe1,
        this.colors.stripe2,
        this.colors.stripe1,
        this.colors.stripe2,
      ];
      for (let r = 0; r < nRows; r++) {
        const ry = y + r * rh;
        cx.fillStyle = rowCols[r];
        cx.fillRect(x, ry, w, Math.min(rh, y + h - ry));
        // White geometric wave
        cx.strokeStyle = this.colors.accent;
        cx.lineWidth = 1;
        const step = Math.max(6, Math.floor(w / 20));
        cx.beginPath();
        for (let px = x; px <= x + w; px += step) {
          const wy =
            ry + rh / 2 + Math.sin(((px - x) / step) * Math.PI) * rh * 0.3;
          if (px === x) cx.moveTo(px, wy);
          else cx.lineTo(px, wy);
        }
        cx.stroke();
        // Dot accents
        cx.fillStyle = this.colors.accent;
        for (let px = x + step; px < x + w; px += step * 2) {
          cx.beginPath();
          cx.arc(px, ry + rh / 2, Math.max(1.5, rh * 0.12), 0, Math.PI * 2);
          cx.fill();
        }
      }
      cx.strokeStyle = this.colors.accent;
      cx.lineWidth = 1.5;
      [y + 1, y + h - 2].forEach((ly) => {
        cx.beginPath();
        cx.moveTo(x, ly);
        cx.lineTo(x + w, ly);
        cx.stroke();
      });
    },
  },
];

// ── Which design is selected ──────────────────────────────────────────
let activeDesignId = BORDER_DESIGNS[0].id;

// ── Draw a thumbnail for a design ────────────────────────────────────
function drawDesignThumb(design, canvas) {
  const cx = canvas.getContext("2d");
  const w = canvas.width,
    h = canvas.height;
  cx.clearRect(0, 0, w, h);
  // Background
  cx.fillStyle = "#1a1a2e";
  cx.fillRect(0, 0, w, h);
  // Simulate saree body stripe
  cx.fillStyle = "#2a1a3e";
  cx.fillRect(0, Math.floor(h * 0.25), w, Math.floor(h * 0.5));
  // Draw border band at top
  design.draw(cx, 0, 0, w, Math.floor(h * 0.25));
  // Mirror at bottom
  cx.save();
  cx.translate(0, h);
  cx.scale(1, -1);
  design.draw(cx, 0, 0, w, Math.floor(h * 0.25));
  cx.restore();
}

// ── Build the design grid ─────────────────────────────────────────────
function initBorderDesignPanel() {
  const grid = document.getElementById("borderDesignGrid");
  if (!grid) return;

  BORDER_DESIGNS.forEach((design) => {
    const card = document.createElement("div");
    card.className =
      "border-design-card" + (design.id === activeDesignId ? " active" : "");
    card.dataset.id = design.id;
    card.title = design.desc;

    const cv = document.createElement("canvas");
    cv.width = 120;
    cv.height = 70;
    card.appendChild(cv);

    const lbl = document.createElement("span");
    lbl.textContent = design.label;
    card.appendChild(lbl);

    grid.appendChild(card);
    drawDesignThumb(design, cv);

    card.addEventListener("click", () => {
      document
        .querySelectorAll(".border-design-card")
        .forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      activeDesignId = design.id;
    });
  });

  // Collapsible
  const title = document.getElementById("borderDesignPanelTitle");
  const body = document.getElementById("borderDesignBody");
  const chevron = document.getElementById("borderDesignPanelChevron");
  if (title && body && chevron) {
    title.addEventListener("click", () => {
      const open = body.classList.toggle("expanded");
      chevron.classList.toggle("open", open);
    });
  }

  // Apply button
  const applyBtn = document.getElementById("applyBorderDesignBtn");
  if (applyBtn) applyBtn.addEventListener("click", applyBorderDesign);
}

// ── Apply the selected design to the canvas grid ──────────────────────
function applyBorderDesign() {
  const design = BORDER_DESIGNS.find((d) => d.id === activeDesignId);
  if (!design) return;

  const bodyCol = document.getElementById("bdBodyColor")?.value || "#8e1a4e";
  const palluCol = document.getElementById("bdPalluColor")?.value || "#1a3a8e";

  saveState();
  layers[0].boxes.clear();

  const cols = Math.floor(canvas.width / S.gridSize);
  const rows = Math.floor(canvas.height / S.gridSize);
  const bodyEndCol = Math.floor(cols * 0.7);
  const palluStartCol = Math.floor(cols * 0.72);

  const toRgba = (hex) => {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},1)`;
  };

  // --- Fill body ---
  for (let x = 0; x < bodyEndCol; x++)
    for (let y = 0; y < rows; y++)
      layers[0].boxes.set(`${x},${y}`, toRgba(bodyCol));

  // --- Fill pallu with checkerboard ---
  for (let x = palluStartCol; x < cols; x++)
    for (let y = 0; y < rows; y++) {
      const col = patternColor(
        x,
        y,
        "checkerboard",
        palluCol,
        _darken(palluCol, 30),
        2
      );
      layers[0].boxes.set(`${x},${y}`, col);
    }

  // --- Draw border design using off-screen canvas, then snap to grid ---
  // Border region: top & bottom N rows (border thickness = 20% of height)
  const borderRowCount = Math.max(3, Math.floor(rows * 0.2));
  const gs = S.gridSize;

  // Create off-screen canvas the size of the border strip (full body width × borderRows)
  const bw = bodyEndCol * gs;
  const bh = borderRowCount * gs;

  const offTop = document.createElement("canvas");
  offTop.width = bw;
  offTop.height = bh;
  const offTopCtx = offTop.getContext("2d");
  design.draw(offTopCtx, 0, 0, bw, bh);

  const offBot = document.createElement("canvas");
  offBot.width = bw;
  offBot.height = bh;
  const offBotCtx = offBot.getContext("2d");
  // Mirror vertically for bottom border
  offBotCtx.translate(0, bh);
  offBotCtx.scale(1, -1);
  design.draw(offBotCtx, 0, 0, bw, bh);

  // Sample each grid cell's colour from the off-screen canvas
  const topData = offTopCtx.getImageData(0, 0, bw, bh).data;
  const botData = offBotCtx.getImageData(0, 0, bw, bh).data;

  function sampleColor(imgData, cellX, cellY, cw, ch, iw) {
    // Sample centre pixel of the cell
    const px = Math.floor(cellX * cw + cw / 2);
    const py = Math.floor(cellY * ch + ch / 2);
    const idx = (py * iw + px) * 4;
    const r = imgData[idx],
      g = imgData[idx + 1],
      b = imgData[idx + 2],
      a = imgData[idx + 3];
    if (a < 10) return null;
    return `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`;
  }

  for (let x = 0; x < bodyEndCol; x++) {
    for (let dy = 0; dy < borderRowCount; dy++) {
      // Top border
      const topY = dy;
      const col = sampleColor(topData, x, dy, gs, gs, bw);
      if (col) layers[0].boxes.set(`${x},${topY}`, col);

      // Bottom border (mirror)
      const botY = rows - 1 - dy;
      const bCol = sampleColor(botData, x, dy, gs, gs, bw);
      if (bCol) layers[0].boxes.set(`${x},${botY}`, bCol);
    }
  }

  redraw();
  renderLayers();
}

// Map to cache high-quality downscaled images
const scaledImageCache = new Map();

function getHighQualityDownscaledImage(img, targetW, targetH) {
  if (!img || targetW <= 0 || targetH <= 0) return img;

  // Use a cache key based on image source and target dimensions
  const cacheKey =
    img.src + "_" + Math.round(targetW) + "x" + Math.round(targetH);
  if (scaledImageCache.has(cacheKey)) {
    return scaledImageCache.get(cacheKey);
  }

  let curW = img.naturalWidth;
  let curH = img.naturalHeight;

  // If not downscaling by more than 50%, regular browser scaling is fine
  if (targetW >= curW * 0.5 && targetH >= curH * 0.5) return img;

  let source = img;
  const cvs = document.createElement("canvas");
  const ctx = cvs.getContext("2d");

  // Step down by halves
  while (curW * 0.5 > targetW && curH * 0.5 > targetH) {
    curW = Math.floor(curW * 0.5);
    curH = Math.floor(curH * 0.5);
    cvs.width = curW;
    cvs.height = curH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, curW, curH);
    source = cvs; // canvas becomes source for next step
  }

  // Final exact resize to target dimensions
  const finalCvs = document.createElement("canvas");
  finalCvs.width = targetW;
  finalCvs.height = targetH;
  const finalCtx = finalCvs.getContext("2d");
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = "high";
  finalCtx.drawImage(source, 0, 0, targetW, targetH);

  scaledImageCache.set(cacheKey, finalCvs);

  // Keep cache small
  if (scaledImageCache.size > 15) {
    const firstKey = scaledImageCache.keys().next().value;
    scaledImageCache.delete(firstKey);
  }

  return finalCvs;
}

// ── Init on load ──────────────────────────────────────────────────────
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initBorderDesignPanel);
} else {
  initBorderDesignPanel();
}
