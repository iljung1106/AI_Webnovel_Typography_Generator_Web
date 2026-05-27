const TEXTURE_SIZE = 2048;

export const TILEABLE_TEXTURE_PROMPTS = {
  gemstone:
    "Create a seamless tileable gemstone texture, square 2048x2048, no text, no border, no vignette, large crystalline facets, strong visible brightness contrast, colored refractions, clear dark and bright zones, no pure white pixels, no overexposed areas, designed to repeat cleanly in 2x2 scale over typography masks.",
  metal:
    "Create a seamless tileable polished metal texture, square 2048x2048, no text, no border, no vignette, broad reflection bands, subtle brushed grain, moderate contrast, no pure white pixels, no overexposed areas, designed to repeat cleanly in 2x2 scale over typography masks.",
};

function hexToRgb255(hex) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function drawWrapped(ctx, draw, x, y, size = TEXTURE_SIZE) {
  for (let ox = -size; ox <= size; ox += size) {
    for (let oy = -size; oy <= size; oy += size) {
      draw(x + ox, y + oy);
    }
  }
}

function toneLimitTexture(ctx, maxLuma = 0.82, shoulder = 0.62) {
  const imageData = ctx.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    const compressed = luma <= shoulder
      ? luma
      : shoulder + (maxLuma - shoulder) * (1.0 - Math.exp(-(luma - shoulder) / 0.22));
    const scale = luma > 0.0001 ? compressed / luma : 1;
    data[i] = Math.round(Math.min(255, r * scale * 255));
    data[i + 1] = Math.round(Math.min(255, g * scale * 255));
    data[i + 2] = Math.round(Math.min(255, b * scale * 255));
  }
  ctx.putImageData(imageData, 0, 0);
}

function fillGemstoneTexture(ctx, params) {
  const highlight = hexToRgb255(params.colorA);
  const mid = hexToRgb255(params.colorB);
  const shadow = hexToRgb255(params.colorC);
  const rng = makeRng(0xdecafbad);

  const imageData = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const data = imageData.data;
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const u = x / TEXTURE_SIZE;
      const v = y / TEXTURE_SIZE;
      const waveA = Math.sin(Math.PI * 2 * (u * 2 + v * 1));
      const waveB = Math.sin(Math.PI * 2 * (u * 1 - v * 2));
      const waveC = Math.sin(Math.PI * 2 * (u * 3 + v * 3));
      let tone = 0.5 + waveA * 0.28 + waveB * 0.22 + waveC * 0.16;
      tone = Math.max(0, Math.min(1, (tone - 0.5) * 1.38 + 0.5));
      const prism = Math.max(0, Math.min(1, 0.5 + Math.sin(Math.PI * 2 * (u * 2 - v * 2)) * 0.5));
      const base = tone > 0.58
        ? mixColor(mid, highlight, Math.pow((tone - 0.58) / 0.42, 1.25) * 0.52)
        : mixColor(shadow, mid, Math.pow(tone / 0.58, 1.08) * 0.86);
      const color = mixColor(base, mixColor(mid, shadow, prism), 0.12);
      const i = (y * TEXTURE_SIZE + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  ctx.globalCompositeOperation = "soft-light";
  for (let i = 0; i < 95; i += 1) {
    const x = rng() * TEXTURE_SIZE;
    const y = rng() * TEXTURE_SIZE;
    const radius = 220 + rng() * 520;
    const color = rng() > 0.62 ? highlight : rng() > 0.35 ? mid : shadow;
    const alpha = 0.07 + rng() * 0.13;
    drawWrapped(ctx, (px, py) => {
      const wrappedGrad = ctx.createRadialGradient(px, py, 0, px, py, radius);
      wrappedGrad.addColorStop(0, `rgba(${color.join(",")}, ${alpha})`);
      wrappedGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = wrappedGrad;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }, x, y);
  }

  ctx.globalCompositeOperation = "overlay";
  for (let i = 0; i < 54; i += 1) {
    const x = rng() * TEXTURE_SIZE;
    const y = rng() * TEXTURE_SIZE;
    const sides = 3 + Math.floor(rng() * 4);
    const radius = 160 + rng() * 420;
    const rotation = rng() * Math.PI * 2;
    const alpha = 0.1 + rng() * 0.24;
    const color = rng() > 0.48 ? mixColor(mid, highlight, 0.28) : mixColor(shadow, mid, 0.55);
    const points = Array.from({ length: sides }, (_, j) => {
      const a = rotation + (j / sides) * Math.PI * 2;
      const r = radius * (0.55 + rng() * 0.65);
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
    ctx.fillStyle = `rgba(${color.join(",")}, ${alpha})`;
    drawWrapped(ctx, (px, py) => {
      ctx.beginPath();
      for (let j = 0; j < points.length; j += 1) {
        const vx = px + points[j][0];
        const vy = py + points[j][1];
        if (j === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.fill();
    }, x, y);
  }

  ctx.globalCompositeOperation = "screen";
  ctx.lineWidth = 3;
  for (let i = 0; i < 34; i += 1) {
    const x = rng() * TEXTURE_SIZE;
    const y = rng() * TEXTURE_SIZE;
    const length = 180 + rng() * 520;
    const angle = rng() * Math.PI * 2;
    ctx.strokeStyle = `rgba(${highlight.join(",")},${0.04 + rng() * 0.08})`;
    drawWrapped(ctx, (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px - Math.cos(angle) * length, py - Math.sin(angle) * length);
      ctx.lineTo(px + Math.cos(angle) * length, py + Math.sin(angle) * length);
      ctx.stroke();
    }, x, y);
  }

  ctx.globalCompositeOperation = "source-over";
  toneLimitTexture(ctx, 0.78, 0.56);
}

function fillMetalTexture(ctx, params) {
  const highlight = hexToRgb255(params.colorA);
  const mid = hexToRgb255(params.colorB);
  const shadow = hexToRgb255(params.colorC);
  const rng = makeRng(0xbadc0de);

  const imageData = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const data = imageData.data;
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const u = x / TEXTURE_SIZE;
      const v = y / TEXTURE_SIZE;
      const band =
        0.5 +
        0.24 * Math.sin(Math.PI * 2 * (v * 4 + 0.12 * Math.sin(Math.PI * 2 * u * 2))) +
        0.14 * Math.sin(Math.PI * 2 * (v * 11 + u * 1.5)) +
        0.07 * Math.sin(Math.PI * 2 * u * 96);
      const t = Math.max(0, Math.min(1, band));
      const color = t > 0.62
        ? mixColor(mid, highlight, ((t - 0.62) / 0.38) * 0.74)
        : mixColor(shadow, mid, t / 0.62);
      const i = (y * TEXTURE_SIZE + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 18; i += 1) {
    const y = rng() * TEXTURE_SIZE;
    const height = 30 + rng() * 140;
    const grad = ctx.createLinearGradient(0, y - height, 0, y + height);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, `rgba(${highlight.join(",")}, ${0.1 + rng() * 0.18})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - height, TEXTURE_SIZE, height * 2);
  }
  ctx.globalCompositeOperation = "source-over";
  toneLimitTexture(ctx, 0.8, 0.58);
}

export function createMaterialTextureCanvas(effectName, params) {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  if (effectName === "metal") {
    fillMetalTexture(ctx, params);
  } else {
    fillGemstoneTexture(ctx, params);
  }

  return canvas;
}
