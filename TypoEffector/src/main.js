import { effectPresets, getDefaultParams, paramSchema } from "./effects.js";
import { WebGLMaterialRenderer } from "./renderer.js";
import {
  composeLayers,
  createDefaultLayerState,
  downloadCanvas,
  getPlacedTypographyRect,
  layerControls as layerSchema,
  renderGlowLayer,
  renderShadowLayer,
} from "./layer-effects.js";

const canvas = document.querySelector("#renderCanvas");
const previewCanvas = document.querySelector("#previewCanvas");
const canvasWrap = document.querySelector("#canvasWrap");
const selectionOverlay = document.querySelector("#selectionOverlay");
const imageInput = document.querySelector("#imageInput");
const backgroundInput = document.querySelector("#backgroundInput");
const effectSelect = document.querySelector("#effectSelect");
const presetSelect = document.querySelector("#presetSelect");
const maskModeSelect = document.querySelector("#maskMode");
const globalControls = document.querySelector("#globalControls");
const controls = document.querySelector("#controls");
const layerControls = document.querySelector("#layerControls");
const performanceControls = document.querySelector("#performanceControls");
const demoButton = document.querySelector("#demoButton");
const resetButton = document.querySelector("#resetButton");
const zoomOutButton = document.querySelector("#zoomOutButton");
const zoomResetButton = document.querySelector("#zoomResetButton");
const zoomInButton = document.querySelector("#zoomInButton");
const exportCompositeButton = document.querySelector("#exportCompositeButton");
const exportMaterialButton = document.querySelector("#exportMaterialButton");
const exportGlowButton = document.querySelector("#exportGlowButton");
const exportShadowButton = document.querySelector("#exportShadowButton");
const imageMeta = document.querySelector("#imageMeta");
const emptyState = document.querySelector("#emptyState");

const state = {
  effectName: "gemstone",
  presetId: "rose-diamond",
  maskMode: "luminance",
  params: getDefaultParams("gemstone"),
  layers: createDefaultLayerState(),
  globalLightAngle: getDefaultParams("gemstone").lightAngle,
  lightOffsets: {
    satin: getDefaultParams("gemstone").satinAngle - getDefaultParams("gemstone").lightAngle,
    shadow: createDefaultLayerState().shadowAngle - getDefaultParams("gemstone").lightAngle,
  },
  performance: {
    maxRenderDimension: 2048,
    previewFps: 18,
    draftWhileDragging: true,
  },
  filename: "typo-effect",
};

const renderer = new WebGLMaterialRenderer(canvas);
let renderTimer = 0;
let dragState = null;
let previewTimer = 0;
let previewFrame = 0;
let lastPreviewAt = 0;
let queuedDraftPreview = false;
let compositeTimer = 0;

const performanceSchema = [
  { key: "maxRenderDimension", label: "Max render px", type: "range", min: 1024, max: 4096, step: 256 },
  { key: "previewFps", label: "Preview FPS", type: "range", min: 5, max: 60, step: 1 },
  { key: "draftWhileDragging", label: "Draft while dragging", type: "checkbox" },
];

const globalLightSchema = [
  { key: "globalLightAngle", label: "Direction", type: "range", min: -180, max: 180, step: 1 },
];

function normalizeAngle(angle) {
  let normalized = Number(angle) || 0;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return Math.round(normalized);
}

function syncLightOffsetsFromCurrent() {
  state.globalLightAngle = normalizeAngle(state.params.lightAngle ?? state.globalLightAngle);
  state.lightOffsets = {
    satin: normalizeAngle((state.params.satinAngle ?? state.globalLightAngle) - state.globalLightAngle),
    shadow: normalizeAngle((state.layers.shadowAngle ?? state.globalLightAngle) - state.globalLightAngle),
  };
}

function applyGlobalLightAngle(angle) {
  state.globalLightAngle = normalizeAngle(angle);
  state.params.lightAngle = state.globalLightAngle;
  state.params.satinAngle = normalizeAngle(state.globalLightAngle + state.lightOffsets.satin);
  state.layers.shadowAngle = normalizeAngle(state.globalLightAngle + state.lightOffsets.shadow);
}

function scheduleRender(delay = 1000) {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    render();
  }, delay);
}

function renderPresetOptions() {
  presetSelect.innerHTML = "";
  for (const preset of effectPresets[state.effectName]) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    presetSelect.append(option);
  }
  presetSelect.value = state.presetId;
}

function currentPreset() {
  return effectPresets[state.effectName].find((preset) => preset.id === state.presetId) || effectPresets[state.effectName][0];
}

function renderControls() {
  controls.innerHTML = "";
  for (const item of paramSchema) {
    const field = document.createElement("label");
    field.className = item.type === "color" ? "field field-color" : "field";

    const top = document.createElement("span");
    top.className = "field-top";
    top.textContent = item.label;

    const value = document.createElement("output");
    value.textContent = item.type === "checkbox" ? "" : String(state.params[item.key]);

    const input = document.createElement("input");
    input.type = item.type;
    input.dataset.key = item.key;

    if (item.type === "checkbox") {
      input.checked = Boolean(state.params[item.key]);
      field.classList.add("field-toggle");
    } else {
      input.value = state.params[item.key];
    }

    if (item.type === "range") {
      input.min = item.min;
      input.max = item.max;
      input.step = item.step;
      input.value = state.params[item.key];
      value.textContent = String(state.params[item.key]);
      top.append(value);
    }

    input.addEventListener("input", () => {
      state.params[item.key] = item.type === "range"
        ? Number(input.value)
        : item.type === "checkbox"
          ? input.checked
          : input.value;
      if (item.key === "lightAngle") {
        state.globalLightAngle = normalizeAngle(state.params.lightAngle);
        syncLightOffsetsFromCurrent();
        renderGlobalControls();
      } else if (item.key === "satinAngle") {
        syncLightOffsetsFromCurrent();
      }
      value.textContent = item.type === "checkbox" ? "" : String(state.params[item.key]);
      scheduleRender(item.type === "checkbox" ? 0 : 1000);
    });

    field.append(top, input);
    controls.append(field);
  }
}

function renderControlSet(container, schema, values, onChange) {
  container.innerHTML = "";
  for (const item of schema) {
    const field = document.createElement("label");
    field.className = item.type === "color" ? "field field-color" : "field";

    const top = document.createElement("span");
    top.className = "field-top";
    top.textContent = item.label;

    const value = document.createElement("output");
    value.textContent = item.type === "checkbox" || item.type === "select" ? "" : String(values[item.key]);

    let input;
    if (item.type === "select") {
      input = document.createElement("select");
      for (const option of item.options) {
        const optionEl = document.createElement("option");
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        input.append(optionEl);
      }
      input.value = values[item.key];
    } else {
      input = document.createElement("input");
      input.type = item.type;
      if (item.type === "checkbox") {
        input.checked = Boolean(values[item.key]);
        field.classList.add("field-toggle");
      } else {
        input.value = values[item.key];
      }
    }

    input.dataset.key = item.key;
    if (item.type === "range") {
      input.min = item.min;
      input.max = item.max;
      input.step = item.step;
      input.value = values[item.key];
      value.textContent = String(values[item.key]);
      top.append(value);
    }

    input.addEventListener("input", () => {
      const nextValue = item.type === "range"
        ? Number(input.value)
        : item.type === "checkbox"
          ? input.checked
          : input.value;
      values[item.key] = nextValue;
      value.textContent = item.type === "checkbox" || item.type === "select" ? "" : String(nextValue);
      onChange(item);
    });

    field.append(top, input);
    container.append(field);
  }
}

function applyPreset(preset) {
  state.presetId = preset.id;
  state.params = { ...preset.params };
  syncLightOffsetsFromCurrent();
  syncGlowColorsWithPreset(state.params);
  renderPresetOptions();
  renderGlobalControls();
  renderControls();
  renderLayerControls();
  render();
}

function syncGlowColorsWithPreset(params) {
  state.layers.glowStartColor = params.colorA;
  state.layers.glowMidColor = params.colorB;
  state.layers.glowEndColor = params.colorC;
}

function renderLayerControls() {
  renderControlSet(layerControls, layerSchema, state.layers, (item) => {
    if (item.key === "shadowAngle") {
      syncLightOffsetsFromCurrent();
    }
    if (item.type === "checkbox" || item.type === "select") {
      requestCompositePreview({ force: true });
      return;
    }
    scheduleCompositePreview(320);
  });
}

function renderGlobalControls() {
  renderControlSet(globalControls, globalLightSchema, state, (item) => {
    applyGlobalLightAngle(state.globalLightAngle);
    renderControls();
    renderLayerControls();
    scheduleRender(item.type === "checkbox" ? 0 : 1000);
  });
}

function render() {
  window.clearTimeout(renderTimer);
  renderer.render({
    effectName: state.effectName,
    maskMode: state.maskMode,
    params: state.params,
  });
  updateCompositePreview();
}

function requestCompositePreview({ draft = false, force = false } = {}) {
  if (force) {
    window.clearTimeout(previewTimer);
    window.cancelAnimationFrame(previewFrame);
    previewTimer = 0;
    previewFrame = 0;
    updateCompositePreview({ draft });
    return;
  }

  queuedDraftPreview = queuedDraftPreview && draft;
  if (!previewTimer && !previewFrame) {
    queuedDraftPreview = draft;
  } else if (!draft) {
    queuedDraftPreview = false;
  }

  const fps = Math.max(1, Number(state.performance.previewFps) || 18);
  const interval = 1000 / fps;
  const now = globalThis.performance.now();
  const delay = Math.max(0, interval - (now - lastPreviewAt));

  if (previewTimer || previewFrame) {
    return;
  }

  previewTimer = window.setTimeout(() => {
    previewTimer = 0;
    previewFrame = window.requestAnimationFrame(() => {
      previewFrame = 0;
      lastPreviewAt = globalThis.performance.now();
      updateCompositePreview({ draft: queuedDraftPreview });
    });
  }, delay);
}

function scheduleCompositePreview(delay = 250) {
  window.clearTimeout(compositeTimer);
  compositeTimer = window.setTimeout(() => {
    requestCompositePreview({ force: true });
  }, delay);
}

function updateCompositePreview({ draft = false } = {}) {
  syncOutputSize();
  if (!renderer.imageLoaded && !state.layers.backgroundImage) {
    return;
  }
  if (renderer.imageLoaded) {
    composeLayers(canvas, previewCanvas, state.layers, { includeBackground: true, skipEffects: draft });
    applyPreviewZoom();
    updateSelectionOverlay();
  } else {
    drawBackgroundOnly();
    applyPreviewZoom();
    hideSelectionOverlay();
  }
  emptyState.hidden = true;
}

function syncOutputSize() {
  if (state.layers.backgroundImage) {
    state.layers.outputWidth = state.layers.backgroundWidth;
    state.layers.outputHeight = state.layers.backgroundHeight;
  } else {
    state.layers.outputWidth = canvas.width;
    state.layers.outputHeight = canvas.height;
  }
}

function fitTypographyToBackground() {
  if (!renderer.imageLoaded) {
    return;
  }
  syncOutputSize();
  const maxWidth = state.layers.outputWidth * 0.82;
  const maxHeight = state.layers.outputHeight * 0.62;
  const fitScale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
  const scale = Math.min(Math.max(fitScale, 0.18), 1.25);
  state.layers.typoScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  state.layers.typoX = (state.layers.outputWidth - canvas.width * state.layers.typoScale) * 0.5;
  state.layers.typoY = (state.layers.outputHeight - canvas.height * state.layers.typoScale) * 0.5;
  state.layers.typoRotation = 0;
}

function applyPreviewZoom() {
  const zoom = state.layers.zoom || 1;
  if (zoom === 1) {
    previewCanvas.style.width = "auto";
    previewCanvas.style.height = "auto";
    previewCanvas.style.maxWidth = "100%";
    previewCanvas.style.maxHeight = "calc(100vh - 128px)";
    return;
  }
  previewCanvas.style.maxWidth = "none";
  previewCanvas.style.maxHeight = "none";
  previewCanvas.style.width = `${previewCanvas.width * zoom}px`;
  previewCanvas.style.height = `${previewCanvas.height * zoom}px`;
}

function getMinimumBackgroundSize(image) {
  const minWidth = 1280;
  const minHeight = 720;
  const scale = Math.max(1, minWidth / image.width, minHeight / image.height);
  return {
    width: Math.round(image.width * scale),
    height: Math.round(image.height * scale),
    scale,
  };
}

function drawBackgroundOnly() {
  previewCanvas.width = state.layers.outputWidth || 1280;
  previewCanvas.height = state.layers.outputHeight || 720;
  const ctx = previewCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  if (state.layers.backgroundImage) {
    ctx.drawImage(state.layers.backgroundImage, 0, 0, previewCanvas.width, previewCanvas.height);
  }
}

function getTypographyCorners(rect) {
  const angle = (rect.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfW = rect.width * 0.5;
  const halfH = rect.height * 0.5;
  return [
    { x: -halfW, y: -halfH, handle: "nw" },
    { x: halfW, y: -halfH, handle: "ne" },
    { x: halfW, y: halfH, handle: "se" },
    { x: -halfW, y: halfH, handle: "sw" },
  ].map((point) => ({
    x: rect.cx + point.x * cos - point.y * sin,
    y: rect.cy + point.x * sin + point.y * cos,
    handle: point.handle,
  }));
}

function getPreviewDisplayScale() {
  const box = previewCanvas.getBoundingClientRect();
  return box.width > 0 ? box.width / previewCanvas.width : 1;
}

function getRotateHandlePoint(rect, displayScale) {
  const angle = (rect.rotation * Math.PI) / 180;
  const localX = 0;
  const localY = -rect.height * 0.5 - 48 / displayScale;
  return {
    x: rect.cx + localX * Math.cos(angle) - localY * Math.sin(angle),
    y: rect.cy + localX * Math.sin(angle) + localY * Math.cos(angle),
  };
}

function hideSelectionOverlay() {
  selectionOverlay.hidden = true;
}

function updateSelectionOverlay() {
  if (!renderer.imageLoaded) {
    hideSelectionOverlay();
    return;
  }
  const rect = getPlacedTypographyRect(canvas, state.layers);
  const previewBox = previewCanvas.getBoundingClientRect();
  const wrapBox = canvasWrap.getBoundingClientRect();
  const scale = getPreviewDisplayScale();
  const left = previewBox.left - wrapBox.left + rect.x * scale;
  const top = previewBox.top - wrapBox.top + rect.y * scale;
  selectionOverlay.hidden = false;
  selectionOverlay.style.left = `${left}px`;
  selectionOverlay.style.top = `${top}px`;
  selectionOverlay.style.width = `${rect.width * scale}px`;
  selectionOverlay.style.height = `${rect.height * scale}px`;
  selectionOverlay.style.transform = `rotate(${rect.rotation}deg)`;
}

function screenToCanvasPoint(event) {
  const box = previewCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * previewCanvas.width,
    y: ((event.clientY - box.top) / box.height) * previewCanvas.height,
  };
}

function pointToLocal(point, rect) {
  const angle = (-rect.rotation * Math.PI) / 180;
  const dx = point.x - rect.cx;
  const dy = point.y - rect.cy;
  return {
    x: dx * Math.cos(angle) - dy * Math.sin(angle),
    y: dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

function hitTestTypography(point) {
  if (!renderer.imageLoaded) {
    return null;
  }
  const rect = getPlacedTypographyRect(canvas, state.layers);
  const corners = getTypographyCorners(rect);
  const displayScale = getPreviewDisplayScale();
  const rotateHandle = getRotateHandlePoint(rect, displayScale);
  const handleRadius = 14 / displayScale;

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  if (distance(point, rotateHandle) <= handleRadius * 1.2) {
    return { mode: "rotate", rect };
  }

  for (const corner of corners) {
    if (distance(point, corner) <= handleRadius) {
      return { mode: "resize", rect, handle: corner.handle };
    }
  }

  const local = pointToLocal(point, rect);
  if (Math.abs(local.x) <= rect.width * 0.5 && Math.abs(local.y) <= rect.height * 0.5) {
    return { mode: "move", rect };
  }

  return null;
}

async function loadFile(file) {
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    await loadSvgFile(file);
    return;
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    renderer.setMaxRenderDimension(state.performance.maxRenderDimension);
    const rendered = renderer.setImage(image, { upscale: 4 });
    state.filename = file.name.replace(/\.[^.]+$/, "") || "typo-effect";
    imageMeta.textContent = `${image.width} x ${image.height}px -> ${rendered.width} x ${rendered.height}px`;
    emptyState.hidden = true;
    fitTypographyToBackground();
    render();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadBackgroundFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    state.layers.backgroundImage = image;
    state.layers.backgroundName = file.name;
    const backgroundSize = getMinimumBackgroundSize(image);
    state.layers.backgroundWidth = backgroundSize.width;
    state.layers.backgroundHeight = backgroundSize.height;
    syncOutputSize();
    fitTypographyToBackground();
    imageMeta.textContent = renderer.imageLoaded
      ? `${image.width} x ${image.height}px background -> ${state.layers.backgroundWidth} x ${state.layers.backgroundHeight}px`
      : `${image.width} x ${image.height}px background -> ${state.layers.backgroundWidth} x ${state.layers.backgroundHeight}px`;
    updateCompositePreview();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function parseSvgLength(value) {
  if (!value) {
    return 0;
  }
  const match = String(value).trim().match(/^([0-9.]+)/);
  return match ? Number(match[1]) : 0;
}

function getSvgDimensions(svgText) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;
  const width = parseSvgLength(svg.getAttribute("width"));
  const height = parseSvgLength(svg.getAttribute("height"));
  if (width > 0 && height > 0) {
    return { width, height };
  }

  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  return { width: 1600, height: 900 };
}

function ensureSvgSize(svgText, dimensions) {
  return svgText.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    const hasWidth = /\bwidth\s*=/.test(attrs);
    const hasHeight = /\bheight\s*=/.test(attrs);
    const widthAttr = hasWidth ? "" : ` width="${dimensions.width}"`;
    const heightAttr = hasHeight ? "" : ` height="${dimensions.height}"`;
    return `<svg${attrs}${widthAttr}${heightAttr}>`;
  });
}

async function loadSvgFile(file) {
  const svgText = await file.text();
  const dimensions = getSvgDimensions(svgText);
  const sizedSvg = ensureSvgSize(svgText, dimensions);
  const blob = new Blob([sizedSvg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    renderer.setMaxRenderDimension(state.performance.maxRenderDimension);
    const rendered = renderer.setImage(image, { upscale: 4 });
    state.filename = file.name.replace(/\.[^.]+$/, "") || "typo-effect";
    imageMeta.textContent = `${Math.round(dimensions.width)} x ${Math.round(dimensions.height)}px SVG -> ${rendered.width} x ${rendered.height}px`;
    emptyState.hidden = true;
    fitTypographyToBackground();
    render();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function createDemoMask() {
  const demo = document.createElement("canvas");
  demo.width = 1400;
  demo.height = 780;
  const ctx = demo.getContext("2d");
  ctx.clearRect(0, 0, demo.width, demo.height);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.save();
  ctx.translate(140, 140);
  ctx.rotate(-0.055);
  ctx.fillRect(0, 82, 1120, 190);
  ctx.fillRect(84, 328, 1060, 188);
  ctx.fillRect(222, 570, 820, 78);
  ctx.restore();

  ctx.lineWidth = 78;
  ctx.beginPath();
  ctx.moveTo(220, 560);
  ctx.bezierCurveTo(340, 390, 530, 420, 625, 535);
  ctx.bezierCurveTo(730, 665, 945, 635, 1078, 438);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(1190, 230, 82, 0, Math.PI * 2);
  ctx.arc(180, 530, 70, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 44;
  for (let i = 0; i < 8; i += 1) {
    const x = 230 + i * 132;
    ctx.beginPath();
    ctx.moveTo(x, 108);
    ctx.lineTo(x + 92, 304);
    ctx.stroke();
  }

  return demo;
}

imageInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) {
    loadFile(file);
  }
});

backgroundInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) {
    loadBackgroundFile(file);
  }
});

demoButton.addEventListener("click", () => {
  const demo = createDemoMask();
  renderer.setMaxRenderDimension(state.performance.maxRenderDimension);
  const rendered = renderer.setImage(demo, { upscale: 4 });
  state.filename = "demo-mask";
  imageMeta.textContent = `${demo.width} x ${demo.height}px demo -> ${rendered.width} x ${rendered.height}px`;
  emptyState.hidden = true;
  fitTypographyToBackground();
  render();
});

effectSelect.addEventListener("change", () => {
  state.effectName = effectSelect.value;
  const preset = effectPresets[state.effectName][0];
  applyPreset(preset);
});

presetSelect.addEventListener("change", () => {
  state.presetId = presetSelect.value;
  applyPreset(currentPreset());
});

maskModeSelect.addEventListener("change", () => {
  state.maskMode = maskModeSelect.value;
  render();
});

zoomOutButton.addEventListener("click", () => {
  state.layers.zoom = Math.max(0.1, (state.layers.zoom || 1) / 1.2);
  applyPreviewZoom();
});

zoomResetButton.addEventListener("click", () => {
  state.layers.zoom = 1;
  applyPreviewZoom();
});

zoomInButton.addEventListener("click", () => {
  state.layers.zoom = Math.min(4, (state.layers.zoom || 1) * 1.2);
  applyPreviewZoom();
});

resetButton.addEventListener("click", () => {
  applyPreset(currentPreset());
});

exportCompositeButton.addEventListener("click", () => {
  if (!renderer.imageLoaded) {
    return;
  }
  composeLayers(canvas, previewCanvas, state.layers, { includeBackground: true });
  downloadCanvas(previewCanvas, `${state.filename}-composite.png`);
  updateCompositePreview();
});

exportMaterialButton.addEventListener("click", () => {
  if (!renderer.imageLoaded) {
    return;
  }
  downloadCanvas(canvas, `${state.filename}-${state.effectName}-type-layer.png`);
});

exportGlowButton.addEventListener("click", () => {
  if (!renderer.imageLoaded) {
    return;
  }
  downloadCanvas(renderGlowLayer(canvas, state.layers), `${state.filename}-glow-layer.png`);
});

exportShadowButton.addEventListener("click", () => {
  if (!renderer.imageLoaded) {
    return;
  }
  downloadCanvas(renderShadowLayer(canvas, state.layers), `${state.filename}-shadow-layer.png`);
});

for (const button of document.querySelectorAll("[data-bg]")) {
  button.addEventListener("click", () => {
    for (const other of document.querySelectorAll("[data-bg]")) {
      other.classList.toggle("active", other === button);
    }
    canvasWrap.classList.remove("checker", "dark", "light");
    canvasWrap.classList.add(button.dataset.bg);
  });
}

canvasWrap.addEventListener("dragover", (event) => {
  event.preventDefault();
  canvasWrap.classList.add("dragging");
});

canvasWrap.addEventListener("dragleave", () => {
  canvasWrap.classList.remove("dragging");
});

canvasWrap.addEventListener("drop", (event) => {
  event.preventDefault();
  canvasWrap.classList.remove("dragging");
  const [file] = event.dataTransfer.files;
  if (file) {
    loadFile(file);
  }
});

canvasWrap.addEventListener("pointerdown", (event) => {
  if (!renderer.imageLoaded) {
    return;
  }
  const point = screenToCanvasPoint(event);
  const hit = hitTestTypography(point);
  if (!hit) {
    return;
  }
  canvasWrap.setPointerCapture(event.pointerId);
  canvasWrap.classList.add("dragging-typo");
  const startAngle = Math.atan2(point.y - hit.rect.cy, point.x - hit.rect.cx);
  const startDistance = Math.max(1, Math.hypot(point.x - hit.rect.cx, point.y - hit.rect.cy));
  dragState = {
    pointerId: event.pointerId,
    mode: hit.mode,
    startPoint: point,
    centerX: hit.rect.cx,
    centerY: hit.rect.cy,
    startAngle,
    startDistance,
    typoX: state.layers.typoX,
    typoY: state.layers.typoY,
    typoScale: state.layers.typoScale,
    typoRotation: state.layers.typoRotation || 0,
  };
});

canvasWrap.addEventListener("pointermove", (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }
  const point = screenToCanvasPoint(event);
  if (dragState.mode === "move") {
    state.layers.typoX = dragState.typoX + point.x - dragState.startPoint.x;
    state.layers.typoY = dragState.typoY + point.y - dragState.startPoint.y;
  } else if (dragState.mode === "resize") {
    const distance = Math.max(1, Math.hypot(point.x - dragState.centerX, point.y - dragState.centerY));
    const nextScale = Math.max(0.03, Math.min(6, dragState.typoScale * (distance / dragState.startDistance)));
    const sourceCenterX = canvas.width * nextScale * 0.5;
    const sourceCenterY = canvas.height * nextScale * 0.5;
    state.layers.typoScale = nextScale;
    state.layers.typoX = dragState.centerX - sourceCenterX;
    state.layers.typoY = dragState.centerY - sourceCenterY;
  } else if (dragState.mode === "rotate") {
    const angle = Math.atan2(point.y - dragState.centerY, point.x - dragState.centerX);
    state.layers.typoRotation = dragState.typoRotation + ((angle - dragState.startAngle) * 180) / Math.PI;
  }
  requestCompositePreview({ draft: state.performance.draftWhileDragging });
});

function endPreviewDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }
  dragState = null;
  canvasWrap.classList.remove("dragging-typo");
  requestCompositePreview({ force: true });
}

canvasWrap.addEventListener("pointerup", endPreviewDrag);
canvasWrap.addEventListener("pointercancel", endPreviewDrag);

renderPresetOptions();
syncLightOffsetsFromCurrent();
renderGlobalControls();
renderControls();
maskModeSelect.value = state.maskMode;
syncGlowColorsWithPreset(state.params);
renderLayerControls();
renderControlSet(performanceControls, performanceSchema, state.performance, (item) => {
  if (item.key === "maxRenderDimension") {
    const oldRect = renderer.imageLoaded ? getPlacedTypographyRect(canvas, state.layers) : null;
    const rendered = renderer.setMaxRenderDimension(state.performance.maxRenderDimension);
    if (rendered) {
      imageMeta.textContent = `${renderer.sourceImage.width} x ${renderer.sourceImage.height}px -> ${rendered.width} x ${rendered.height}px`;
      if (oldRect) {
        state.layers.typoScale = Math.max(0.03, oldRect.width / canvas.width);
        state.layers.typoX = oldRect.cx - canvas.width * state.layers.typoScale * 0.5;
        state.layers.typoY = oldRect.cy - canvas.height * state.layers.typoScale * 0.5;
      } else {
        fitTypographyToBackground();
      }
      render();
    }
    return;
  }

  requestCompositePreview({ force: item.key === "draftWhileDragging" });
});
render();
