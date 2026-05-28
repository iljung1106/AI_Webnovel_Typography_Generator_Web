import { effectPresets } from "./effects";
import { createDefaultLayerState, createNormalizedTypographyGroup, downloadCanvas, renderGlowLayer, renderShadowLayer } from "./layer-effects";
import { WebGLMaterialRenderer } from "./renderer";

type EffectName = keyof typeof effectPresets;

type RenderTypoEffectInput = {
  imageUrl: string;
  presetId: string;
  targetCanvas: HTMLCanvasElement;
  backgroundUrl?: string | null;
  effectParams?: TypoEffectParams | null;
  layerParams?: TypoLayerParams | null;
  placement?: TypoEffectPlacement | null;
};

type DownloadTypoEffectInput = Omit<RenderTypoEffectInput, "targetCanvas"> & {
  filename: string;
  watermark?: WatermarkOptions | null;
};

type LayerState = Omit<ReturnType<typeof createDefaultLayerState>, "backgroundImage"> & {
  backgroundImage: HTMLImageElement | HTMLCanvasElement | null;
  outputWidth: number;
  outputHeight: number;
};

export type TypoEffectParams = Record<string, string | number | boolean>;
export type TypoLayerParams = Record<string, string | number | boolean>;

export type TypoEffectPlacement = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

export type TypoEffectRenderResult = {
  outputWidth: number;
  outputHeight: number;
  materialWidth: number;
  materialHeight: number;
  placement: TypoEffectPlacement;
};

export type WatermarkOptions = {
  enabled: boolean;
  text?: string;
};

const maxRenderDimension = 2048;
const minimumBackgroundLongEdge = 2000;
const materialCache = new Map<string, Promise<PreparedTypography>>();

type PreparedTypography = {
  effectName: EffectName;
  flareGroup: HTMLCanvasElement;
  group: HTMLCanvasElement;
  materialCanvas: HTMLCanvasElement;
  normalizedWidth: number;
};

export async function renderTypoEffectToCanvas({
  backgroundUrl,
  effectParams,
  imageUrl,
  layerParams,
  placement,
  presetId,
  targetCanvas
}: RenderTypoEffectInput): Promise<TypoEffectRenderResult> {
  const prepared = await getPreparedTypography({ effectParams, imageUrl, layerParams, presetId });
  const backgroundImage = backgroundUrl ? await loadUpscaledBackground(backgroundUrl) : null;
  const layers = createLayerState({
    effectParams,
    layerParams,
    presetId
  });

  if (backgroundImage) {
    layers.backgroundImage = backgroundImage;
    layers.backgroundWidth = backgroundImage.width;
    layers.backgroundHeight = backgroundImage.height;
    layers.outputWidth = layers.backgroundWidth;
    layers.outputHeight = layers.backgroundHeight;
    layers.backgroundFit = "cover";
    applyPlacement(prepared.materialCanvas, layers, placement);
  } else {
    layers.outputWidth = prepared.materialCanvas.width;
    layers.outputHeight = prepared.materialCanvas.height;
    if (placement) {
      applyPlacement(prepared.materialCanvas, layers, placement);
    } else {
      layers.typoX = 0;
      layers.typoY = 0;
      layers.typoScale = 1;
      layers.typoRotation = 0;
    }
  }

  composePreparedTypography(prepared, targetCanvas, layers, Boolean(backgroundImage));
  return {
    outputWidth: layers.outputWidth,
    outputHeight: layers.outputHeight,
    materialWidth: prepared.materialCanvas.width,
    materialHeight: prepared.materialCanvas.height,
    placement: {
      x: layers.typoX,
      y: layers.typoY,
      scale: layers.typoScale,
      rotation: layers.typoRotation
    }
  };
}

export async function exportTypoLayerZip(input: DownloadTypoEffectInput) {
  const prepared = await getPreparedTypography({
    effectParams: input.effectParams,
    imageUrl: input.imageUrl,
    layerParams: input.layerParams,
    presetId: input.presetId
  });
  const backgroundImage = input.backgroundUrl ? await loadUpscaledBackground(input.backgroundUrl) : null;
  const layers = createLayerState(input);
  if (backgroundImage) {
    layers.backgroundImage = backgroundImage;
    layers.backgroundWidth = backgroundImage.width;
    layers.backgroundHeight = backgroundImage.height;
    layers.outputWidth = layers.backgroundWidth;
    layers.outputHeight = layers.backgroundHeight;
    layers.backgroundFit = "cover";
  } else {
    layers.outputWidth = prepared.materialCanvas.width;
    layers.outputHeight = prepared.materialCanvas.height;
  }
  applyPlacement(prepared.materialCanvas, layers, input.placement);

  const composite = document.createElement("canvas");
  composePreparedTypography(prepared, composite, layers, Boolean(backgroundImage));
  const material = createOutputLayer(prepared.materialCanvas, layers);
  const shadow = renderShadowLayer(prepared.materialCanvas, { ...layers, backgroundImage: null });
  const glow = renderGlowLayer(prepared.materialCanvas, { ...layers, backgroundImage: null });
  const flare = createFlareLayer(prepared, layers);
  const files = [
    ["composite.png", composite],
    ["typography-material.png", material],
    ["shadow.png", shadow],
    ["glow.png", glow],
    ["flare-ray.png", flare]
  ] as const;
  const zipBlob = await createStoredZip(files);
  downloadBlob(zipBlob, input.filename.replace(/\.png$/i, ".zip"));
}

export async function downloadTypoEffectPng(input: DownloadTypoEffectInput) {
  const canvas = document.createElement("canvas");
  await renderTypoEffectToCanvas({ ...input, targetCanvas: canvas });
  if (input.watermark?.enabled) {
    drawWatermark(canvas, input.watermark.text ?? "fontasy.ai.kr");
  }
  downloadCanvas(canvas, input.filename);
}

function drawWatermark(canvas: HTMLCanvasElement, text: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const longEdge = Math.max(canvas.width, canvas.height);
  const fontSize = Math.max(18, Math.round(longEdge * 0.018));
  const padding = Math.max(18, Math.round(longEdge * 0.018));
  ctx.save();
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textBaseline = "alphabetic";
  const metrics = ctx.measureText(text);
  const boxWidth = metrics.width + padding * 1.1;
  const boxHeight = fontSize + padding * 0.5;
  const x = canvas.width - boxWidth - padding;
  const y = canvas.height - boxHeight - padding;
  ctx.fillStyle = "rgba(255, 255, 255, 0.48)";
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.fillStyle = "rgba(15, 23, 42, 0.34)";
  ctx.fillText(text, x + padding * 0.55, y + boxHeight - padding * 0.34);
  ctx.restore();
}

async function getPreparedTypography({
  effectParams,
  imageUrl,
  layerParams,
  presetId
}: {
  effectParams?: TypoEffectParams | null;
  imageUrl: string;
  layerParams?: TypoLayerParams | null;
  presetId: string;
}) {
  const presetMatch = getPresetMatch(presetId);
  const params = { ...presetMatch.preset.params, ...(effectParams ?? {}) };
  const layers = createLayerState({ effectParams: params, layerParams, presetId });
  const cacheKey = JSON.stringify([imageUrl, presetId, params, layerParams]);
  let prepared = materialCache.get(cacheKey);
  if (!prepared) {
    prepared = prepareTypography({
      effectName: presetMatch.effectName,
      imageUrl,
      layers,
      params
    });
    materialCache.set(cacheKey, prepared);
  }
  return prepared;
}

async function prepareTypography({
  effectName,
  imageUrl,
  layers,
  params
}: {
  effectName: EffectName;
  imageUrl: string;
  layers: LayerState;
  params: TypoEffectParams;
}): Promise<PreparedTypography> {
  const sourceImage = await loadImageElement(imageUrl);
  const materialCanvas = document.createElement("canvas");
  const renderer = new WebGLMaterialRenderer(materialCanvas);
  renderer.setMaxRenderDimension(maxRenderDimension);
  renderer.setImage(sourceImage, { upscale: 4 });
  renderer.render({
    effectName,
    maskMode: "alpha-luminance",
    params
  });
  const normalized = createNormalizedTypographyGroup(materialCanvas, layers);
  return {
    effectName,
    flareGroup: normalized.flareGroup,
    group: normalized.group,
    materialCanvas,
    normalizedWidth: 1536
  };
}

function composePreparedTypography(prepared: PreparedTypography, targetCanvas: HTMLCanvasElement, layers: LayerState, includeBackground: boolean) {
  targetCanvas.width = layers.outputWidth || prepared.materialCanvas.width;
  targetCanvas.height = layers.outputHeight || prepared.materialCanvas.height;
  const ctx = targetCanvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

  if (includeBackground && layers.backgroundImage) {
    drawFittedImage(ctx, layers.backgroundImage, targetCanvas.width, targetCanvas.height, layers.backgroundFit);
  }

  const rect = getPlacedRect(prepared.materialCanvas, layers);
  const finalScale = rect.width / prepared.normalizedWidth;
  drawGroup(ctx, prepared.group, rect, finalScale, layers.typoRotation || 0);
  ctx.globalCompositeOperation = (layers.flareBlend || "lighter") as GlobalCompositeOperation;
  drawGroup(ctx, prepared.flareGroup, rect, finalScale, layers.typoRotation || 0);
  ctx.globalCompositeOperation = "source-over";
}

function createLayerState({
  effectParams,
  layerParams,
  presetId
}: {
  effectParams?: TypoEffectParams | null;
  layerParams?: TypoLayerParams | null;
  presetId: string;
}) {
  const presetMatch = getPresetMatch(presetId);
  const params = { ...presetMatch.preset.params, ...(effectParams ?? {}) };
  const layers = {
    ...(createDefaultLayerState() as LayerState),
    ...(layerParams ?? {})
  };
  layers.glowStartColor = String(params.colorA ?? layers.glowStartColor);
  layers.glowMidColor = String(params.colorB ?? layers.glowMidColor);
  layers.glowEndColor = String(params.colorC ?? layers.glowEndColor);
  layers.shadowAngle = normalizeAngle(180 - Number(params.lightAngle));
  return layers;
}

function getPresetMatch(presetId: string) {
  for (const [effectName, presets] of Object.entries(effectPresets) as [EffectName, (typeof effectPresets)[EffectName]][]) {
    const preset = presets.find((item) => item.id === presetId);
    if (preset) {
      return { effectName, preset };
    }
  }

  return {
    effectName: "gemstone" as EffectName,
    preset: effectPresets.gemstone[0]
  };
}

function applyPlacement(materialCanvas: HTMLCanvasElement, layers: LayerState, placement?: TypoEffectPlacement | null) {
  if (placement) {
    layers.typoScale = clamp(Number(placement.scale) || 1, 0.05, 8);
    layers.typoX = clamp(Number(placement.x) || 0, -materialCanvas.width * layers.typoScale, layers.outputWidth);
    layers.typoY = clamp(Number(placement.y) || 0, -materialCanvas.height * layers.typoScale, layers.outputHeight);
    layers.typoRotation = clamp(Number(placement.rotation) || 0, -180, 180);
    return;
  }

  const maxWidth = layers.outputWidth * 0.82;
  const maxHeight = layers.outputHeight * 0.62;
  const fitScale = Math.min(maxWidth / materialCanvas.width, maxHeight / materialCanvas.height);
  const scale = Math.min(Math.max(fitScale, 0.18), 1.25);
  layers.typoScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  layers.typoX = (layers.outputWidth - materialCanvas.width * layers.typoScale) * 0.5;
  layers.typoY = (layers.outputHeight - materialCanvas.height * layers.typoScale) * 0.5;
  layers.typoRotation = 0;
}

function getPlacedRect(materialCanvas: HTMLCanvasElement, layers: LayerState) {
  const width = materialCanvas.width * layers.typoScale;
  const height = materialCanvas.height * layers.typoScale;
  const x = layers.typoX;
  const y = layers.typoY;
  return {
    x,
    y,
    width,
    height,
    cx: x + width * 0.5,
    cy: y + height * 0.5
  };
}

function drawGroup(ctx: CanvasRenderingContext2D, group: HTMLCanvasElement, rect: ReturnType<typeof getPlacedRect>, finalScale: number, rotation = 0) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(rect.cx, rect.cy);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(group, -group.width * finalScale * 0.5, -group.height * finalScale * 0.5, group.width * finalScale, group.height * finalScale);
  ctx.restore();
}

function createOutputLayer(source: HTMLCanvasElement, layers: LayerState) {
  const canvas = document.createElement("canvas");
  canvas.width = layers.outputWidth;
  canvas.height = layers.outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const rect = getPlacedRect(source, layers);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(rect.cx, rect.cy);
  ctx.rotate((layers.typoRotation || 0) * Math.PI / 180);
  ctx.drawImage(source, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
  ctx.restore();
  return canvas;
}

function createFlareLayer(prepared: PreparedTypography, layers: LayerState) {
  const canvas = document.createElement("canvas");
  canvas.width = layers.outputWidth;
  canvas.height = layers.outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const rect = getPlacedRect(prepared.materialCanvas, layers);
  drawGroup(ctx, prepared.flareGroup, rect, rect.width / prepared.normalizedWidth, layers.typoRotation || 0);
  return canvas;
}

function drawFittedImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement | HTMLCanvasElement, width: number, height: number, fit: string) {
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

async function loadUpscaledBackground(src: string) {
  const image = await loadImageElement(src);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.max(1, minimumBackgroundLongEdge / Math.max(width, height));
  if (scale <= 1) {
    return image;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return image;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAngle(angle: number) {
  let normalized = Number(angle) || 0;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return Math.round(normalized);
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image load failed"));
    image.src = src;
  });
}

async function canvasToBytes(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
      } else {
        reject(new Error("canvas export failed"));
      }
    }, "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

async function createStoredZip(files: readonly (readonly [string, HTMLCanvasElement])[]) {
  const now = new Date();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const [name, canvas] of files) {
    const data = await canvasToBytes(canvas);
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const local = zipLocalHeader(nameBytes, data, crc, now);
    localParts.push(local, data);
    centralParts.push(zipCentralHeader(nameBytes, data, crc, now, offset));
    offset += local.length + data.length;
  }
  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = zipEndRecord(files.length, centralSize, centralOffset);
  const blobParts = [...localParts, ...centralParts, end].map(toArrayBuffer);
  return new Blob(blobParts, { type: "application/zip" });
}

function toArrayBuffer(part: Uint8Array) {
  const buffer = new ArrayBuffer(part.byteLength);
  new Uint8Array(buffer).set(part);
  return buffer;
}

function zipLocalHeader(nameBytes: Uint8Array, data: Uint8Array, crc: number, date: Date) {
  const buffer = new ArrayBuffer(30 + nameBytes.length);
  const view = new DataView(buffer);
  writeZipCommon(view, 0x04034b50, nameBytes, data, crc, date);
  new Uint8Array(buffer).set(nameBytes, 30);
  return new Uint8Array(buffer);
}

function zipCentralHeader(nameBytes: Uint8Array, data: Uint8Array, crc: number, date: Date, offset: number) {
  const buffer = new ArrayBuffer(46 + nameBytes.length);
  const view = new DataView(buffer);
  writeZipCommon(view, 0x02014b50, nameBytes, data, crc, date);
  view.setUint16(4, 20, true);
  view.setUint32(42, offset, true);
  new Uint8Array(buffer).set(nameBytes, 46);
  return new Uint8Array(buffer);
}

function writeZipCommon(view: DataView, signature: number, nameBytes: Uint8Array, data: Uint8Array, crc: number, date: Date) {
  view.setUint32(0, signature, true);
  view.setUint16(signature === 0x02014b50 ? 6 : 4, 20, true);
  const base = signature === 0x02014b50 ? 12 : 10;
  view.setUint16(base, zipTime(date), true);
  view.setUint16(base + 2, zipDate(date), true);
  view.setUint32(base + 4, crc, true);
  view.setUint32(base + 8, data.length, true);
  view.setUint32(base + 12, data.length, true);
  view.setUint16(base + 16, nameBytes.length, true);
}

function zipEndRecord(fileCount: number, centralSize: number, centralOffset: number) {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return new Uint8Array(buffer);
}

function zipTime(date: Date) {
  return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
}

function zipDate(date: Date) {
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

function crc32(data: Uint8Array) {
  let crc = -1;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
