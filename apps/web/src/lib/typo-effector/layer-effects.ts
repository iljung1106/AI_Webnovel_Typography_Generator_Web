// @ts-nocheck
export const blendModes = [
  { value: "source-over", label: "Normal" },
  { value: "screen", label: "Screen" },
  { value: "lighter", label: "Add" },
  { value: "multiply", label: "Multiply" },
  { value: "overlay", label: "Overlay" },
];

export const layerControls = [
  { key: "shadowEnabled", label: "Shadow", type: "checkbox" },
  { key: "shadowColor", label: "Shadow color", type: "color" },
  { key: "shadowOpacity", label: "Shadow opacity", type: "range", min: 0, max: 1, step: 0.01 },
  { key: "shadowBlur", label: "Shadow blur", type: "range", min: 0, max: 96, step: 1 },
  { key: "shadowSpread", label: "Shadow spread", type: "range", min: 0, max: 64, step: 1 },
  { key: "shadowDistance", label: "Shadow distance", type: "range", min: 0, max: 120, step: 1 },
  { key: "shadowAngle", label: "Shadow angle", type: "range", min: -180, max: 180, step: 1 },
  { key: "shadowBlend", label: "Shadow blend", type: "select", options: blendModes },
  { key: "glowEnabled", label: "Outer glow", type: "checkbox" },
  { key: "glowStartColor", label: "Glow inner color", type: "color" },
  { key: "glowMidColor", label: "Glow mid color", type: "color" },
  { key: "glowEndColor", label: "Glow outer color", type: "color" },
  { key: "glowOpacity", label: "Glow opacity", type: "range", min: 0, max: 1, step: 0.01 },
  { key: "glowBlur", label: "Glow blur", type: "range", min: 0, max: 120, step: 1 },
  { key: "glowSpread", label: "Glow spread", type: "range", min: 0, max: 40, step: 1 },
  { key: "glowBlend", label: "Glow blend", type: "select", options: blendModes },
  { key: "flareEnabled", label: "Shape flare", type: "checkbox" },
  { key: "flareOpacity", label: "Flare opacity", type: "range", min: 0, max: 1, step: 0.01 },
  { key: "flareRadius", label: "Flare radius", type: "range", min: 10, max: 500, step: 1 },
  { key: "flareRays", label: "Flare rays", type: "range", min: 0, max: 48, step: 1 },
  { key: "rayBeamCount", label: "Ray count", type: "range", min: 0, max: 64, step: 1 },
  { key: "rayBeamOpacity", label: "Ray opacity", type: "range", min: 0, max: 1, step: 0.01 },
  { key: "rayBeamSize", label: "Ray size", type: "range", min: 0.1, max: 4, step: 0.01 },
  { key: "flareBlend", label: "Flare blend", type: "select", options: blendModes },
  { key: "backgroundFit", label: "Background fit", type: "select", options: [
    { value: "cover", label: "Cover" },
    { value: "contain", label: "Contain" },
    { value: "stretch", label: "Stretch" },
  ] },
];

export function createDefaultLayerState() {
  return {
    backgroundImage: null,
    backgroundName: "",
    backgroundWidth: 0,
    backgroundHeight: 0,
    backgroundFit: "cover",
    typoX: 0,
    typoY: 0,
    typoScale: 1,
    typoRotation: 0,
    zoom: 1,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowOpacity: 0.56,
    shadowBlur: 18,
    shadowSpread: 6,
    shadowDistance: 18,
    shadowAngle: 42,
    shadowBlend: "multiply",
    glowEnabled: true,
    glowStartColor: "#ffe8fb",
    glowMidColor: "#ff63b4",
    glowEndColor: "#71d9ff",
    glowOpacity: 0.42,
    glowBlur: 18,
    glowSpread: 2,
    glowBlend: "screen",
    flareEnabled: true,
    flareOpacity: 0.18,
    flareRadius: 160,
    flareRays: 16,
    rayBeamCount: 18,
    rayBeamOpacity: 0.92,
    rayBeamSize: 3.1,
    flareBlend: "lighter",
  };
}

function createCanvasLike(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  return canvas;
}

function createSizedCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function hexToRgba(hex, alpha = 1) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawFittedImage(ctx, image, width, height, fit) {
  if (!image) {
    return;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (fit === "stretch") {
    ctx.drawImage(image, 0, 0, width, height);
    return;
  }

  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  const useCover = fit === "cover";
  const fitByWidth = useCover ? sourceRatio < targetRatio : sourceRatio > targetRatio;
  const drawWidth = fitByWidth ? width : height * sourceRatio;
  const drawHeight = fitByWidth ? width / sourceRatio : height;
  const x = (width - drawWidth) * 0.5;
  const y = (height - drawHeight) * 0.5;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
}

export function getAlphaBounds(source) {
  const probe = createCanvasLike(source);
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
  let minX = probe.width;
  let minY = probe.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < probe.height; y += 2) {
    for (let x = 0; x < probe.width; x += 2) {
      const alpha = data[(y * probe.width + x) * 4 + 3];
      if (alpha > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0) {
    return { x: source.width / 2, y: source.height / 2, width: 1, height: 1, cx: source.width / 2, cy: source.height / 2 };
  }

  const width = maxX - minX;
  const height = maxY - minY;
  return { x: minX, y: minY, width, height, cx: minX + width / 2, cy: minY + height / 2 };
}

function createTintedMask(source, fillStyle) {
  const canvas = createCanvasLike(source);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = fillStyle;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

const DESIGN_TYPOGRAPHY_WIDTH = 1536;

export function getPlacedTypographyRect(materialCanvas, params) {
  const width = materialCanvas.width * params.typoScale;
  const height = materialCanvas.height * params.typoScale;
  const x = params.typoX;
  const y = params.typoY;
  return {
    x,
    y,
    width,
    height,
    cx: x + width * 0.5,
    cy: y + height * 0.5,
    rotation: params.typoRotation || 0,
  };
}

function getEffectScale(materialCanvas, params) {
  const rect = getPlacedTypographyRect(materialCanvas, params);
  return Math.max(0.18, Math.min(2.5, rect.width / DESIGN_TYPOGRAPHY_WIDTH));
}

function scaledPx(materialCanvas, params, value, min = 0) {
  return Math.max(min, Number(value || 0) * getEffectScale(materialCanvas, params));
}

function getEffectPadding(materialCanvas, params) {
  if (!params || params.skipEffects) {
    return 8;
  }

  const shadow = params.shadowEnabled
    ? scaledPx(materialCanvas, params, params.shadowDistance, 0) + scaledPx(materialCanvas, params, params.shadowBlur, 0) + scaledPx(materialCanvas, params, params.shadowSpread, 0)
    : 0;
  const glow = params.glowEnabled
    ? scaledPx(materialCanvas, params, params.glowBlur, 0) + scaledPx(materialCanvas, params, params.glowSpread, 0)
    : 0;
  const flare = params.flareEnabled
    ? scaledPx(materialCanvas, params, params.flareRadius, 0) * Math.max(1, Number(params.rayBeamSize ?? 1)) + scaledPx(materialCanvas, params, params.glowBlur, 0)
    : 0;
  return Math.ceil(Math.max(12, shadow, glow, flare) + 24);
}

function drawTransformed(ctx, source, params, offsetX = 0, offsetY = 0) {
  const rect = getPlacedTypographyRect(source, params);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(rect.cx + offsetX, rect.cy + offsetY);
  ctx.rotate(((params.typoRotation || 0) * Math.PI) / 180);
  ctx.drawImage(source, -rect.width * 0.5, -rect.height * 0.5, rect.width, rect.height);
  ctx.restore();
}

const flareAnalysisCache = new WeakMap();

function transformLocalPoint(source, params, x, y) {
  const rect = getPlacedTypographyRect(source, params);
  const angle = ((params.typoRotation || 0) * Math.PI) / 180;
  const scaledX = (x - source.width * 0.5) * params.typoScale;
  const scaledY = (y - source.height * 0.5) * params.typoScale;
  return {
    x: rect.cx + scaledX * Math.cos(angle) - scaledY * Math.sin(angle),
    y: rect.cy + scaledX * Math.sin(angle) + scaledY * Math.cos(angle),
  };
}

function transformLocalDirection(params, x, y) {
  const angle = ((params.typoRotation || 0) * Math.PI) / 180;
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle),
  };
}

function analyzeFlareComponents(source) {
  const cached = flareAnalysisCache.get(source);
  if (cached) {
    return cached;
  }

  const maxSample = 220;
  const sampleScale = Math.min(1, maxSample / Math.max(source.width, source.height));
  const sampleWidth = Math.max(1, Math.round(source.width * sampleScale));
  const sampleHeight = Math.max(1, Math.round(source.height * sampleScale));
  const probe = createSizedCanvas(sampleWidth, sampleHeight);
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, sampleWidth, sampleHeight);
  const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
  const total = sampleWidth * sampleHeight;
  const mask = new Uint8Array(total);
  const visited = new Uint8Array(total);

  for (let i = 0; i < total; i += 1) {
    mask[i] = data[i * 4 + 3] > 18 ? 1 : 0;
  }

  const components = [];
  const queue = new Int32Array(total);
  const stride = sampleWidth;

  for (let start = 0; start < total; start += 1) {
    if (!mask[start] || visited[start]) {
      continue;
    }

    let head = 0;
    let tail = 0;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    const outline = [];
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head];
      head += 1;
      const x = index % stride;
      const y = Math.floor(index / stride);
      area += 1;
      sumX += x;
      sumY += y;

      let edgeScore = 0;
      const neighbors = [
        index - 1,
        index + 1,
        index - stride,
        index + stride,
      ];

      for (let n = 0; n < neighbors.length; n += 1) {
        const next = neighbors[n];
        const isHorizontalWrap = (n === 0 && x === 0) || (n === 1 && x === sampleWidth - 1);
        if (isHorizontalWrap || next < 0 || next >= total || !mask[next]) {
          edgeScore += 1;
          continue;
        }
        if (!visited[next]) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }

      if (edgeScore > 0 && outline.length < 900) {
        outline.push({
          x: x / sampleScale,
          y: y / sampleScale,
          edgeScore,
        });
      }
    }

    if (area > 10 && outline.length > 0) {
      const cx = (sumX / area) / sampleScale;
      const cy = (sumY / area) / sampleScale;
      const smoothedOutline = outline.map((point) => {
        let bestX = 0;
        let bestY = 0;
        let count = 0;
        const radius = Math.max(8, Math.min(source.width, source.height) * 0.018);
        for (const other of outline) {
          const dx = other.x - point.x;
          const dy = other.y - point.y;
          if (dx * dx + dy * dy <= radius * radius) {
            bestX += other.x;
            bestY += other.y;
            count += 1;
          }
        }
        return {
          x: count ? bestX / count : point.x,
          y: count ? bestY / count : point.y,
          edgeScore: point.edgeScore,
        };
      });
      components.push({
        area,
        cx,
        cy,
        outline: smoothedOutline,
      });
    }
  }

  components.sort((a, b) => b.area - a.area);
  const result = components.slice(0, 48);
  flareAnalysisCache.set(source, result);
  return result;
}

function pickWeightedComponent(components, unit) {
  const totalWeight = components.reduce((sum, component) => sum + Math.sqrt(component.area), 0) || 1;
  let pick = unit * totalWeight;
  for (const component of components) {
    pick -= Math.sqrt(component.area);
    if (pick <= 0) {
      return component;
    }
  }
  return components[0];
}

function deterministicNoise(seed) {
  return (Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1;
}

function pickRayOrigin(components, centerX, centerY, angle, seed) {
  const targetX = Math.cos(angle);
  const targetY = Math.sin(angle);
  let best = null;
  let bestComponent = null;
  let bestScore = -Infinity;

  for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
    const component = components[componentIndex];
    for (let pointIndex = 0; pointIndex < component.outline.length; pointIndex += 1) {
      const point = component.outline[pointIndex];
      const globalDx = point.x - centerX;
      const globalDy = point.y - centerY;
      const globalLength = Math.max(1, Math.hypot(globalDx, globalDy));
      const globalNx = globalDx / globalLength;
      const globalNy = globalDy / globalLength;
      const globalAlignment = globalNx * targetX + globalNy * targetY;
      const outerWeight = Math.min(1, globalLength / 360);
      const noise = Math.abs(deterministicNoise(seed + componentIndex * 17.13 + pointIndex * 0.071));
      const score = globalAlignment * 4.4 + outerWeight * 1.15 + point.edgeScore * 0.025 + noise * 0.035;
      if (score > bestScore) {
        bestScore = score;
        best = point;
        bestComponent = component;
      }
    }
  }

  return best ? { point: best, component: bestComponent } : null;
}

function renderShapeFlare(materialCanvas, params, width, height) {
  const layer = createSizedCanvas(width, height);
  const ctx = layer.getContext("2d");
  const rays = Math.round(params.flareRays);
  const rayBeamCount = Math.round(params.rayBeamCount ?? rays);
  const flareOpacity = Number(params.flareOpacity || 0);
  const rayOpacity = Number(params.rayBeamOpacity ?? flareOpacity);
  const raySize = Number(params.rayBeamSize ?? 1);
  const flareRadius = scaledPx(materialCanvas, params, params.flareRadius, 1);
  const glowSpread = scaledPx(materialCanvas, params, params.glowSpread, 0);
  const glowBlur = scaledPx(materialCanvas, params, params.glowBlur, 0);
  if (!params.flareEnabled || (flareOpacity <= 0 && rayOpacity <= 0) || (rays <= 0 && rayBeamCount <= 0)) {
    return layer;
  }

  const sourceBounds = getAlphaBounds(materialCanvas);
  const relativeArea = Math.max(0.08, Math.min(1, (sourceBounds.width * sourceBounds.height) / (materialCanvas.width * materialCanvas.height)));
  const rayScale = 0.7 + relativeArea * 0.55;
  const steps = 5;
  const startMask = createTintedMask(materialCanvas, hexToRgba(params.glowStartColor, 1));
  const midMask = createTintedMask(materialCanvas, hexToRgba(params.glowMidColor, 1));
  const endMask = createTintedMask(materialCanvas, hexToRgba(params.glowEndColor, 1));
  const masks = [startMask, midMask, endMask];
  const components = analyzeFlareComponents(materialCanvas);

  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < rays; i += 1) {
    const angle = (i / rays) * Math.PI * 2;
    const jitter = 0.78 + ((i * 37) % 17) / 42;
    const length = flareRadius * jitter * rayScale;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const eased = t * t * (3 - 2 * t);
      const mask = masks[Math.min(2, Math.floor(t * 3))];
      const spread = 1 - t;
      ctx.globalAlpha = flareOpacity * Math.pow(spread, 1.55) * (0.12 + 0.06 * (i % 3));
      ctx.filter = `blur(${Math.max(1, glowSpread * 0.32 + flareRadius * 0.006 * t)}px)`;
      drawTransformed(ctx, mask, params, dirX * length * eased, dirY * length * eased);
    }
  }

  ctx.filter = "none";
  const sourceBoundsCenterX = sourceBounds.cx;
  const sourceBoundsCenterY = sourceBounds.cy;
  for (let i = 0; i < rayBeamCount && rayOpacity > 0; i += 1) {
    const goldenJitter = (0.5 - Math.abs(deterministicNoise(i * 4.31 + rayBeamCount * 1.7))) * 0.045;
    const unit = (i + 0.5 + goldenJitter) / rayBeamCount;
    const targetAngle = unit * Math.PI * 2;
    const origin = pickRayOrigin(components, sourceBoundsCenterX, sourceBoundsCenterY, targetAngle, i + rayBeamCount * 3.11);
    if (!origin) {
      continue;
    }

    const { point } = origin;
    const localNormalX = point.x - sourceBoundsCenterX;
    const localNormalY = point.y - sourceBoundsCenterY;
    const normalLength = Math.max(1, Math.hypot(localNormalX, localNormalY));
    const radialX = Math.cos(targetAngle);
    const radialY = Math.sin(targetAngle);
    const outlineX = localNormalX / normalLength;
    const outlineY = localNormalY / normalLength;
    const localDirX = radialX * 0.94 + outlineX * 0.06;
    const localDirY = radialY * 0.94 + outlineY * 0.06;
    const start = transformLocalPoint(materialCanvas, params, point.x, point.y);
    const direction = transformLocalDirection(params, localDirX, localDirY);
    const dirLength = Math.max(0.001, Math.hypot(direction.x, direction.y));
    const dirX = direction.x / dirLength;
    const dirY = direction.y / dirLength;
    const jitter = 0.78 + ((i * 29) % 13) / 36;
    const endDistance = flareRadius * raySize * (0.42 + jitter * 0.5) * (0.86 + Math.min(0.35, point.edgeScore * 0.07));
    const startX = start.x + dirX * Math.max(1, glowSpread * 0.35);
    const startY = start.y + dirY * Math.max(1, glowSpread * 0.35);
    const endX = start.x + dirX * endDistance;
    const endY = start.y + dirY * endDistance;
    const beam = ctx.createLinearGradient(startX, startY, endX, endY);
    beam.addColorStop(0, hexToRgba(params.glowStartColor, rayOpacity * 0.95));
    beam.addColorStop(0.28, hexToRgba(params.glowMidColor, rayOpacity * 0.52));
    beam.addColorStop(0.68, hexToRgba(params.glowEndColor, rayOpacity * 0.12));
    beam.addColorStop(1, hexToRgba(params.glowEndColor, 0));

    ctx.save();
    ctx.globalAlpha = 0.76 + (i % 4) * 0.06;
    ctx.strokeStyle = beam;
    ctx.lineWidth = Math.max(1.8, flareRadius * raySize * (0.0064 + (i % 3) * 0.0022));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.globalAlpha *= 0.52;
    ctx.filter = `blur(${Math.max(1.8, flareRadius * raySize * 0.005)}px)`;
    ctx.lineWidth *= 2.7;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
  }

  ctx.globalAlpha = flareOpacity * 0.18;
  ctx.filter = `blur(${Math.max(4, glowBlur * 0.34)}px)`;
  drawTransformed(ctx, startMask, params);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
  return layer;
}

export function renderShadowLayer(materialCanvas, params) {
  const layer = createSizedCanvas(params.outputWidth || materialCanvas.width, params.outputHeight || materialCanvas.height);
  const ctx = layer.getContext("2d");
  if (!params.shadowEnabled || params.shadowOpacity <= 0) {
    return layer;
  }

  const angle = (params.shadowAngle * Math.PI) / 180;
  const shadowDistance = scaledPx(materialCanvas, params, params.shadowDistance, 0);
  const shadowBlur = scaledPx(materialCanvas, params, params.shadowBlur, 0);
  const shadowSpread = scaledPx(materialCanvas, params, params.shadowSpread, 0);
  const offsetX = Math.cos(angle) * shadowDistance;
  const offsetY = Math.sin(angle) * shadowDistance;
  const tinted = createTintedMask(materialCanvas, hexToRgba(params.shadowColor, params.shadowOpacity));
  ctx.filter = `blur(${shadowBlur}px)`;
  ctx.globalAlpha = params.shadowOpacity;
  if (shadowSpread > 0.1) {
    const spreadSteps = 10;
    for (let i = 0; i < spreadSteps; i += 1) {
      const spreadAngle = (i / spreadSteps) * Math.PI * 2;
      const spreadX = Math.cos(spreadAngle) * shadowSpread;
      const spreadY = Math.sin(spreadAngle) * shadowSpread;
      drawTransformed(ctx, tinted, params, offsetX + spreadX, offsetY + spreadY);
    }
    drawTransformed(ctx, tinted, params, offsetX, offsetY);
  } else {
    drawTransformed(ctx, tinted, params, offsetX, offsetY);
  }
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  return layer;
}

function renderFlareLayer(materialCanvas, params) {
  const layer = createSizedCanvas(params.outputWidth || materialCanvas.width, params.outputHeight || materialCanvas.height);
  const ctx = layer.getContext("2d");
  if (!params.flareEnabled || (params.flareOpacity <= 0 && params.rayBeamOpacity <= 0)) {
    return layer;
  }

  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(renderShapeFlare(materialCanvas, params, layer.width, layer.height), 0, 0);
  ctx.globalCompositeOperation = "source-over";
  return layer;
}

export function renderGlowLayer(materialCanvas, params, options = {}) {
  const layer = createSizedCanvas(params.outputWidth || materialCanvas.width, params.outputHeight || materialCanvas.height);
  const ctx = layer.getContext("2d");
  const hasGlow = params.glowEnabled && params.glowOpacity > 0;
  if (!hasGlow && !options.includeFlare) {
    return layer;
  }

  if (!hasGlow) {
    return options.includeFlare ? renderFlareLayer(materialCanvas, params) : layer;
  }

  const bounds = getPlacedTypographyRect(materialCanvas, params);
  const glowBlur = scaledPx(materialCanvas, params, params.glowBlur, 0);
  const glowSpread = scaledPx(materialCanvas, params, params.glowSpread, 0);
  const maxRadius = Math.max(bounds.width, bounds.height) * 0.52 + glowBlur + glowSpread;
  const gradient = ctx.createRadialGradient(bounds.cx, bounds.cy, Math.max(1, glowSpread), bounds.cx, bounds.cy, maxRadius);
  gradient.addColorStop(0, hexToRgba(params.glowStartColor, params.glowOpacity));
  gradient.addColorStop(0.48, hexToRgba(params.glowMidColor, params.glowOpacity * 0.72));
  gradient.addColorStop(1, hexToRgba(params.glowEndColor, 0));

  const placedMask = createSizedCanvas(layer.width, layer.height);
  const placedMaskCtx = placedMask.getContext("2d");
  drawTransformed(placedMaskCtx, materialCanvas, params);
  const gradientMask = createTintedMask(placedMask, gradient);
  ctx.filter = `blur(${glowBlur}px)`;
  ctx.drawImage(gradientMask, 0, 0);
  ctx.filter = "none";

  if (options.includeFlare) {
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(renderFlareLayer(materialCanvas, params), 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  return layer;
}

export function createNormalizedTypographyGroup(materialCanvas, params, options = {}) {
  const rect = getPlacedTypographyRect(materialCanvas, params);
  const normalizedScale = DESIGN_TYPOGRAPHY_WIDTH / Math.max(1, materialCanvas.width);
  const normalizedWidth = DESIGN_TYPOGRAPHY_WIDTH;
  const normalizedHeight = materialCanvas.height * normalizedScale;
  const paddingProbeParams = {
    ...params,
    typoX: 0,
    typoY: 0,
    typoScale: normalizedScale,
    typoRotation: 0,
  };
  const padding = options.skipEffects ? 8 : getEffectPadding(materialCanvas, paddingProbeParams);
  const group = createSizedCanvas(normalizedWidth + padding * 2, normalizedHeight + padding * 2);
  const flareGroup = createSizedCanvas(group.width, group.height);
  const groupParams = {
    ...params,
    outputWidth: group.width,
    outputHeight: group.height,
    typoX: padding,
    typoY: padding,
    typoScale: normalizedScale,
    typoRotation: 0,
  };
  const groupCtx = group.getContext("2d");
  groupCtx.imageSmoothingEnabled = true;
  groupCtx.imageSmoothingQuality = "high";
  groupCtx.clearRect(0, 0, group.width, group.height);

  if (!options.skipEffects) {
    const shadow = renderShadowLayer(materialCanvas, groupParams);
    const glow = renderGlowLayer(materialCanvas, groupParams);
    groupCtx.globalCompositeOperation = params.shadowBlend;
    groupCtx.drawImage(shadow, 0, 0);
    groupCtx.globalCompositeOperation = params.glowBlend;
    groupCtx.drawImage(glow, 0, 0);
  }

  groupCtx.globalCompositeOperation = "source-over";
  drawTransformed(groupCtx, materialCanvas, groupParams);

  if (!options.skipEffects) {
    const flare = renderFlareLayer(materialCanvas, groupParams);
    const flareCtx = flareGroup.getContext("2d");
    flareCtx.imageSmoothingEnabled = true;
    flareCtx.imageSmoothingQuality = "high";
    flareCtx.globalCompositeOperation = "source-over";
    flareCtx.drawImage(flare, 0, 0);
  }

  return {
    group,
    flareGroup,
    rect,
    finalScale: rect.width / normalizedWidth,
  };
}

function drawGroupToContext(ctx, group, rect, finalScale, rotation = 0) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(rect.cx, rect.cy);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(
    group,
    -group.width * finalScale * 0.5,
    -group.height * finalScale * 0.5,
    group.width * finalScale,
    group.height * finalScale,
  );
  ctx.restore();
}

function drawTypographyGroup(ctx, materialCanvas, params, options = {}) {
  const normalized = createNormalizedTypographyGroup(materialCanvas, params, options);
  drawGroupToContext(ctx, normalized.group, normalized.rect, normalized.finalScale, params.typoRotation || 0);
}

export function composeLayers(materialCanvas, targetCanvas, params, options = {}) {
  targetCanvas.width = params.outputWidth || materialCanvas.width;
  targetCanvas.height = params.outputHeight || materialCanvas.height;
  const ctx = targetCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

  if (options.includeBackground && params.backgroundImage) {
    drawFittedImage(ctx, params.backgroundImage, targetCanvas.width, targetCanvas.height, params.backgroundFit);
  }

  if (options.skipEffects) {
    drawTypographyGroup(ctx, materialCanvas, params, { skipEffects: true });
  } else {
    const normalized = createNormalizedTypographyGroup(materialCanvas, params);
    drawGroupToContext(ctx, normalized.group, normalized.rect, normalized.finalScale, params.typoRotation || 0);
    ctx.globalCompositeOperation = params.flareBlend || "lighter";
    drawGroupToContext(ctx, normalized.flareGroup, normalized.rect, normalized.finalScale, params.typoRotation || 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  return {};
}

export function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
