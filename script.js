const canvas = document.getElementById("graphCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const mousePosDisplay = document.getElementById("mousePosition");

let settings = {
  width: 1200,
  height: 800,
  gridSize: 20,
  gridColor: "#cccccc",
  backgroundColor: "#ffffff",
  superboxColor: "#e6f7ff",
  drawColor: "#ff0000", // Default Red
  drawOpacity: 1,
};

let isDrawing = false;
let isErasing = false;
let coloredBoxes = new Map();

// Color Palette with Red and Navy
const colors = [
  "#ff0000", // Red
  "#4ecdc4",
  "#45b7d1",
  "#000080", // Navy Blue
  "#feca57",
  "#ff9ff3",
  "#54a0ff",
  "#000000",
  "#ffffff",
];

document.addEventListener("DOMContentLoaded", () => {
  initPalette();
  setupListeners();
  updateUI();
});

function initPalette() {
  const palette = document.getElementById("palette");
  colors.forEach((col) => {
    const div = document.createElement("div");
    div.className = "color-option";
    if (col === settings.drawColor) div.classList.add("active");
    div.style.backgroundColor = col;
    div.onclick = () => {
      settings.drawColor = col;
      document
        .querySelectorAll(".color-option")
        .forEach((el) => el.classList.remove("active"));
      div.classList.add("active");
    };
    palette.appendChild(div);
  });
}

function setupListeners() {
  // Dimension Inputs
  document.getElementById("width").oninput = (e) => {
    settings.width = +e.target.value;
    updateUI();
  };
  document.getElementById("height").oninput = (e) => {
    settings.height = +e.target.value;
    updateUI();
  };
  document.getElementById("gridSize").oninput = (e) => {
    settings.gridSize = +e.target.value;
    updateUI();
  };
  document.getElementById("drawOpacity").oninput = (e) => {
    settings.drawOpacity = +e.target.value;
    updateUI();
  };
  document.getElementById("gridColor").oninput = (e) => {
    settings.gridColor = e.target.value;
    drawGraph();
  };

  // Image Upload
  document.getElementById("imageUpload").onchange = (e) => {
    if (e.target.files[0]) processImage(e.target.files[0]);
  };

  // Mode Buttons
  document.getElementById("drawModeBtn").onclick = () => {
    isErasing = false;
    updateToolUI();
  };
  document.getElementById("eraseModeBtn").onclick = () => {
    isErasing = true;
    updateToolUI();
  };
  document.getElementById("clearDrawingBtn").onclick = () => {
    coloredBoxes.clear();
    updateUI();
  };
  document.getElementById("downloadBtn").onclick = download;
  document.getElementById("resetBtn").onclick = () => location.reload();

  // Mouse Events
  canvas.onmousedown = (e) => {
    isDrawing = true;
    handleDraw(e);
  };
  canvas.onmousemove = (e) => {
    updateMousePos(e);
    if (isDrawing) handleDraw(e);
  };
  window.onmouseup = () => (isDrawing = false);

  // Zoom
  document.getElementById("zoomLevel").onchange = (e) => {
    const zoom = e.target.value;
    canvas.style.width = canvas.width * zoom + "px";
    canvas.style.height = canvas.height * zoom + "px";
  };
}

function processImage(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");
      const cols = Math.floor(settings.width / settings.gridSize);
      const rows = Math.floor(settings.height / settings.gridSize);

      tempCanvas.width = cols;
      tempCanvas.height = rows;
      tempCtx.drawImage(img, 0, 0, cols, rows);

      const data = tempCtx.getImageData(0, 0, cols, rows).data;
      coloredBoxes.clear();

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          if (data[i + 3] > 10) {
            const rgba = `rgba(${data[i]}, ${data[i + 1]}, ${data[i + 2]}, ${
              settings.drawOpacity
            })`;
            coloredBoxes.set(`${x},${y}`, rgba);
          }
        }
      }
      updateUI();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function handleDraw(e) {
  const rect = canvas.getBoundingClientRect();
  const zoom = parseFloat(document.getElementById("zoomLevel").value);
  const x = Math.floor((e.clientX - rect.left) / zoom / settings.gridSize);
  const y = Math.floor((e.clientY - rect.top) / zoom / settings.gridSize);

  if (
    x < 0 ||
    y < 0 ||
    x >= canvas.width / settings.gridSize ||
    y >= canvas.height / settings.gridSize
  )
    return;

  const key = `${x},${y}`;
  if (isErasing) {
    coloredBoxes.delete(key);
  } else {
    const rgb = hexToRgb(settings.drawColor);
    coloredBoxes.set(
      key,
      `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${settings.drawOpacity})`
    );
  }
  updateUI();
}

function updateUI() {
  const snappedWidth =
    Math.floor(settings.width / settings.gridSize) * settings.gridSize;
  const snappedHeight =
    Math.floor(settings.height / settings.gridSize) * settings.gridSize;

  canvas.width = snappedWidth;
  canvas.height = snappedHeight;

  document.getElementById("widthValue").textContent = snappedWidth;
  document.getElementById("heightValue").textContent = snappedHeight;
  document.getElementById("gridSizeValue").textContent = settings.gridSize;
  document.getElementById("drawOpacityValue").textContent =
    settings.drawOpacity;
  document.getElementById(
    "coloredBoxes"
  ).textContent = `Colored boxes: ${coloredBoxes.size}`;

  const sx = Math.floor(snappedWidth / (settings.gridSize * 10));
  const sy = Math.floor(snappedHeight / (settings.gridSize * 10));
  document.getElementById("superboxCount").textContent = `Superboxes: ${
    sx * sy
  }`;
  document.getElementById("boxCount").textContent = `Total boxes: ${
    Math.floor(snappedWidth / settings.gridSize) *
    Math.floor(snappedHeight / settings.gridSize)
  }`;

  // Sync zoom style with internal dimensions
  const zoom = document.getElementById("zoomLevel").value;
  canvas.style.width = snappedWidth * zoom + "px";
  canvas.style.height = snappedHeight * zoom + "px";

  drawGraph();
}

function drawGraph() {
  ctx.fillStyle = settings.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Superboxes (10x10 grid clusters)
  const sz = settings.gridSize * 10;
  for (let i = 0; i < canvas.width; i += sz) {
    for (let j = 0; j < canvas.height; j += sz) {
      if ((i / sz + j / sz) % 2 === 0) {
        ctx.fillStyle = settings.superboxColor;
        ctx.fillRect(i, j, sz, sz);
      }
    }
  }

  // Drawing
  coloredBoxes.forEach((color, key) => {
    const [x, y] = key.split(",").map(Number);
    ctx.fillStyle = color;
    ctx.fillRect(
      x * settings.gridSize,
      y * settings.gridSize,
      settings.gridSize,
      settings.gridSize
    );
  });

  // Grid Lines
  ctx.strokeStyle = settings.gridColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= canvas.width; x += settings.gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
  }
  for (let y = 0; y <= canvas.height; y += settings.gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
  }
  ctx.stroke();
}

function updateMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  const zoom = parseFloat(document.getElementById("zoomLevel").value);
  const x = Math.floor((e.clientX - rect.left) / zoom / settings.gridSize);
  const y = Math.floor((e.clientY - rect.top) / zoom / settings.gridSize);
  mousePosDisplay.textContent = `Grid: ${x}, ${y}`;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

function updateToolUI() {
  const ind = document.getElementById("toolIndicator");
  ind.textContent = isErasing ? "Erasing" : "Drawing";
  ind.style.backgroundColor = isErasing ? "#fff3cd" : "#e3f2fd";
}

function download() {
  const link = document.createElement("a");
  link.download = "graph-design.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}
