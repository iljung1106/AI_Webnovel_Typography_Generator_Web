import { createMaterialTextureCanvas } from "./material-textures.js";

const vertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform sampler2D u_material;
uniform vec2 u_resolution;
uniform int u_effect;
uniform int u_maskMode;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_colorC;
uniform float u_intensity;
uniform float u_facetScale;
uniform float u_contrast;
uniform float u_rim;
uniform float u_rimWidth;
uniform float u_textureScale;
uniform float u_textureAngle;
uniform float u_lightAngle;
uniform float u_bevel;
uniform float u_bevelSize;
uniform int u_satinEnabled;
uniform vec3 u_satinColor;
uniform float u_satinStrength;
uniform float u_satinAngle;
uniform float u_satinDistance;
uniform float u_satinSize;

in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += valueNoise(p) * amp;
    p = p * 2.03 + vec2(17.7, 9.2);
    amp *= 0.5;
  }
  return value;
}

float cellFacet(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  float h = hash(cell);
  vec2 a = normalize(vec2(cos(h * 6.28318), sin(h * 6.28318)));
  vec2 b = normalize(vec2(cos((h + 0.37) * 6.28318), sin((h + 0.37) * 6.28318)));
  float planeA = dot(local - 0.5, a);
  float planeB = dot(local - 0.5, b);
  float cut = max(abs(planeA), abs(planeB));
  return smoothstep(0.06, 0.44, cut);
}

float maskAt(vec2 uv) {
  vec4 s = texture(u_image, clamp(uv, vec2(0.0), vec2(1.0)));
  float alphaMask = s.a;
  float blackMask = 1.0 - dot(s.rgb, vec3(0.299, 0.587, 0.114));
  blackMask *= smoothstep(0.02, 0.25, s.a);

  if (u_maskMode == 1) {
    return blackMask;
  }
  if (u_maskMode == 2) {
    return max(alphaMask, blackMask);
  }
  return alphaMask;
}

float shapeMaskAt(vec2 uv) {
  return smoothstep(0.18, 0.82, maskAt(uv));
}

float smoothShapeMaskAt(vec2 uv, float radius) {
  vec2 px = radius / u_resolution;
  float total = 0.0;
  total += shapeMaskAt(uv) * 0.18;
  total += shapeMaskAt(uv + vec2(px.x, 0.0)) * 0.11;
  total += shapeMaskAt(uv - vec2(px.x, 0.0)) * 0.11;
  total += shapeMaskAt(uv + vec2(0.0, px.y)) * 0.11;
  total += shapeMaskAt(uv - vec2(0.0, px.y)) * 0.11;
  total += shapeMaskAt(uv + px) * 0.095;
  total += shapeMaskAt(uv - px) * 0.095;
  total += shapeMaskAt(uv + vec2(px.x, -px.y)) * 0.095;
  total += shapeMaskAt(uv + vec2(-px.x, px.y)) * 0.095;
  return total;
}

float erodedMaskAtRadius(vec2 uv, float radius) {
  vec2 px = 1.0 / u_resolution;
  float eroded = 1.0;
  eroded = min(eroded, shapeMaskAt(uv + vec2(px.x * radius, 0.0)));
  eroded = min(eroded, shapeMaskAt(uv - vec2(px.x * radius, 0.0)));
  eroded = min(eroded, shapeMaskAt(uv + vec2(0.0, px.y * radius)));
  eroded = min(eroded, shapeMaskAt(uv - vec2(0.0, px.y * radius)));
  eroded = min(eroded, shapeMaskAt(uv + px * radius));
  eroded = min(eroded, shapeMaskAt(uv - px * radius));
  eroded = min(eroded, shapeMaskAt(uv + vec2(px.x, -px.y) * radius));
  eroded = min(eroded, shapeMaskAt(uv + vec2(-px.x, px.y) * radius));
  return eroded;
}

float bevelHeightAt(vec2 uv) {
  float size = max(u_bevelSize, 1.0);
  float height = 0.0;
  float total = 0.0;
  for (int i = 1; i <= 20; i++) {
    float t = float(i) / 20.0;
    float radius = size * t;
    float weight = pow(1.0 - t * 0.28, 1.25);
    height += erodedMaskAtRadius(uv, radius) * weight;
    total += weight;
  }
  float h = clamp(height / max(total, 0.0001), 0.0, 1.0);
  return smoothstep(0.02, 0.98, h);
}

vec3 bevelNormalFromHeight(vec2 uv) {
  vec2 px = max(u_bevelSize * 0.16, 1.25) / u_resolution;
  float l = bevelHeightAt(uv - vec2(px.x, 0.0));
  float r = bevelHeightAt(uv + vec2(px.x, 0.0));
  float b = bevelHeightAt(uv - vec2(0.0, px.y));
  float t = bevelHeightAt(uv + vec2(0.0, px.y));
  return normalize(vec3((l - r) * 2.8, (b - t) * 2.8, 1.0));
}

float innerGlow(vec2 uv, float mask) {
  float glow = 0.0;
  float totalWeight = 0.0;
  for (int i = 1; i <= 18; i++) {
    float stepIndex = float(i);
    float radius = stepIndex * 1.35 * u_rimWidth;
    float edgeReach = clamp(mask - erodedMaskAtRadius(uv, radius), 0.0, 1.0);
    float weight = pow(1.0 - stepIndex / 19.0, 1.65);
    glow += edgeReach * weight;
    totalWeight += weight;
  }
  return smoothstep(0.0, 0.82, glow / max(totalWeight, 0.0001));
}

vec2 materialUv(vec2 uv) {
  float angle = radians(u_textureAngle);
  mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  return rot * (uv - 0.5) * u_textureScale + 0.5;
}

vec3 gemstone(vec2 uv, float mask, vec3 lightDir) {
  vec3 tex = texture(u_material, materialUv(uv)).rgb;
  tex = min(tex, vec3(0.86));
  float texLuma = dot(tex, vec3(0.299, 0.587, 0.114));
  float angular = 0.5 + 0.5 * sin((uv.x - uv.y) * 8.0 + texLuma * 6.283);
  float spec = pow(max(dot(vec3(0.0, 0.0, 1.0), lightDir), 0.0), 20.0);

  vec3 color = mix(tex, u_colorB, 0.08);
  color += u_colorA * spec * 0.42;
  color += mix(u_colorC, u_colorA, angular) * smoothstep(0.74, 1.0, texLuma) * 0.1;

  float shade = 0.76 + u_intensity * 0.25 + u_contrast * (texLuma - 0.5) * 0.26;
  return color * shade;
}

vec3 metal(vec2 uv, float mask, vec3 lightDir) {
  float angle = radians(u_lightAngle);
  vec2 dir = normalize(vec2(cos(angle), sin(angle)));
  vec2 crossDir = vec2(-dir.y, dir.x);
  float along = dot(uv, dir);
  float across = dot(uv, crossDir);

  vec3 tex = texture(u_material, materialUv(uv)).rgb;
  tex = min(tex, vec3(0.86));
  float texLuma = dot(tex, vec3(0.299, 0.587, 0.114));
  float broad = 0.5 + 0.5 * sin(across * 11.0 + sin(along * 7.0) * 1.2);
  float brush = fbm(vec2(along * 260.0, across * 18.0)) * 0.18;
  float reflect = pow(max(dot(reflect(-lightDir, vec3(0.0, 0.0, 1.0)), vec3(0.0, 0.0, 1.0)), 0.0), 7.0);
  float proceduralTone = broad * 0.38 + brush + reflect * 0.52;
  float textureTone = (texLuma - 0.5) * 0.18;
  float tone = clamp(0.18 + proceduralTone + textureTone, 0.0, 1.0);

  tone = smoothstep(0.12, 0.92, tone + (u_contrast - 0.5) * 0.34);
  vec3 color = mix(u_colorC, u_colorB, tone);
  color = mix(color, tex * u_colorB, 0.08);
  color = mix(color, u_colorA, pow(tone, 2.9) * 0.72);
  color += u_colorA * reflect * u_intensity * 0.34;
  return color * (0.68 + u_intensity * 0.26);
}

float blurredMask(vec2 uv, float radius) {
  return smoothShapeMaskAt(uv, max(radius, 2.0));
}

vec3 applySatin(vec3 color, vec2 uv, float mask) {
  if (u_satinEnabled == 0 || u_satinStrength <= 0.001) {
    return color;
  }

  float angle = radians(u_satinAngle);
  vec2 dir = vec2(cos(angle), sin(angle));
  vec2 px = 1.0 / u_resolution;
  vec2 offset = dir * px * u_satinDistance;
  float size = max(u_satinSize, 1.0);

  float a = blurredMask(uv + offset, size);
  float b = blurredMask(uv - offset, size);
  float c = blurredMask(uv, size * 0.55);
  float shiftedShape = max(a, b);
  float interference = abs(a - b) * 0.82 + max(shiftedShape - c, 0.0) * 0.5;
  float glossCurve = pow(max(interference, 0.0), 0.72);
  float satin = (glossCurve / (glossCurve + 0.34)) * mask;
  float strength = u_satinStrength * u_satinStrength * (1.85 - 0.55 * u_satinStrength);

  return color + u_satinColor * satin * strength;
}

vec3 applyBevel(vec3 color, vec2 uv, vec3 lightDir, float mask) {
  if (u_bevel <= 0.001) {
    return color;
  }

  float height = bevelHeightAt(uv);
  float band = (1.0 - smoothstep(0.9, 1.0, height)) * smoothstep(0.02, 0.9, mask);
  vec3 n = bevelNormalFromHeight(uv);
  float facing = dot(n, lightDir);
  float highlight = smoothstep(0.08, 0.88, max(facing, 0.0)) * band;
  float shadow = smoothstep(0.06, 0.78, max(-facing, 0.0)) * band;

  vec3 lit = color;
  lit += u_colorA * highlight * u_bevel * 0.46;
  lit *= 1.0 - shadow * u_bevel * 0.22;
  return mix(color, lit, band);
}

void main() {
  vec2 uv = v_uv;
  float mask = shapeMaskAt(uv);
  if (mask <= 0.001) {
    outColor = vec4(0.0);
    return;
  }

  float angle = radians(u_lightAngle);
  vec3 lightDir = normalize(vec3(cos(angle), -sin(angle), 0.72));
  float rim = innerGlow(uv, mask);

  vec3 color = u_effect == 0
    ? gemstone(uv, mask, lightDir)
    : metal(uv, mask, lightDir);

  color = applyBevel(color, uv, lightDir, mask);
  color += u_colorA * rim * u_rim * 0.72;
  color = applySatin(color, uv, mask);
  color = clamp(color, 0.0, 1.0);
  outColor = vec4(color * mask, mask);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info || "Shader compilation failed");
  }
  return shader;
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(info || "Program linking failed");
  }
  return program;
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

export class WebGLMaterialRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });

    if (!this.gl) {
      throw new Error("WebGL2 is not available in this browser.");
    }

    this.program = createProgram(this.gl);
    this.locations = this.getLocations();
    this.texture = this.createTexture();
    this.materialTexture = this.createTexture({ repeat: true });
    this.materialCacheKey = "";
    this.imageLoaded = false;
    this.maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
    this.maxRenderDimension = 2048;
    this.sourceImage = null;
    this.sourceUpscale = 4;
    this.setupGeometry();
  }

  prepareImageSource(image, upscale = 4) {
    const requestedScale = Math.max(1, upscale);
    const maxDimension = Math.min(this.maxTextureSize || this.maxRenderDimension, this.maxRenderDimension);
    const dimensionScale = maxDimension / Math.max(image.width, image.height);
    const scale = Math.max(1, Math.min(requestedScale, dimensionScale));
    if (scale === 1) {
      return image;
    }

    const source = document.createElement("canvas");
    source.width = Math.max(1, Math.round(image.width * scale));
    source.height = Math.max(1, Math.round(image.height * scale));
    const ctx = source.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, source.width, source.height);
    ctx.drawImage(image, 0, 0, source.width, source.height);
    return source;
  }

  getLocations() {
    const gl = this.gl;
    const program = this.program;
    return {
      position: gl.getAttribLocation(program, "a_position"),
      image: gl.getUniformLocation(program, "u_image"),
      material: gl.getUniformLocation(program, "u_material"),
      resolution: gl.getUniformLocation(program, "u_resolution"),
      effect: gl.getUniformLocation(program, "u_effect"),
      maskMode: gl.getUniformLocation(program, "u_maskMode"),
      colorA: gl.getUniformLocation(program, "u_colorA"),
      colorB: gl.getUniformLocation(program, "u_colorB"),
      colorC: gl.getUniformLocation(program, "u_colorC"),
      intensity: gl.getUniformLocation(program, "u_intensity"),
      facetScale: gl.getUniformLocation(program, "u_facetScale"),
      contrast: gl.getUniformLocation(program, "u_contrast"),
      rim: gl.getUniformLocation(program, "u_rim"),
      rimWidth: gl.getUniformLocation(program, "u_rimWidth"),
      textureScale: gl.getUniformLocation(program, "u_textureScale"),
      textureAngle: gl.getUniformLocation(program, "u_textureAngle"),
      lightAngle: gl.getUniformLocation(program, "u_lightAngle"),
      bevel: gl.getUniformLocation(program, "u_bevel"),
      bevelSize: gl.getUniformLocation(program, "u_bevelSize"),
      satinEnabled: gl.getUniformLocation(program, "u_satinEnabled"),
      satinColor: gl.getUniformLocation(program, "u_satinColor"),
      satinStrength: gl.getUniformLocation(program, "u_satinStrength"),
      satinAngle: gl.getUniformLocation(program, "u_satinAngle"),
      satinDistance: gl.getUniformLocation(program, "u_satinDistance"),
      satinSize: gl.getUniformLocation(program, "u_satinSize"),
    };
  }

  setupGeometry() {
    const gl = this.gl;
    const vertices = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);
  }

  createTexture({ repeat = false } = {}) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  updateMaterialTexture(effectName, params) {
    const textureKeys = ["colorA", "colorB", "colorC", "contrast"];
    const cacheKey = JSON.stringify([effectName, ...textureKeys.map((key) => params[key])]);
    if (cacheKey === this.materialCacheKey) {
      return;
    }

    const gl = this.gl;
    const canvas = createMaterialTextureCanvas(effectName, params);
    gl.bindTexture(gl.TEXTURE_2D, this.materialTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    this.materialCacheKey = cacheKey;
  }

  uploadImageSource(source) {
    const gl = this.gl;
    this.canvas.width = source.width;
    this.canvas.height = source.height;
    gl.viewport(0, 0, source.width, source.height);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.imageLoaded = true;
    return { width: source.width, height: source.height };
  }

  setImage(image, options = {}) {
    this.sourceImage = image;
    this.sourceUpscale = options.upscale ?? 4;
    return this.uploadImageSource(this.prepareImageSource(image, this.sourceUpscale));
  }

  setMaxRenderDimension(maxRenderDimension) {
    this.maxRenderDimension = Math.max(512, Number(maxRenderDimension) || 2048);
    if (!this.sourceImage) {
      return null;
    }
    return this.uploadImageSource(this.prepareImageSource(this.sourceImage, this.sourceUpscale));
  }

  render({ effectName, maskMode, params }) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!this.imageLoaded) {
      return;
    }

    this.updateMaterialTexture(effectName, params);

    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.locations.image, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.materialTexture);
    gl.uniform1i(this.locations.material, 1);
    gl.uniform2f(this.locations.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1i(this.locations.effect, effectName === "metal" ? 1 : 0);
    gl.uniform1i(this.locations.maskMode, maskMode === "luminance" ? 1 : maskMode === "alpha-luminance" ? 2 : 0);

    gl.uniform3fv(this.locations.colorA, hexToRgb(params.colorA));
    gl.uniform3fv(this.locations.colorB, hexToRgb(params.colorB));
    gl.uniform3fv(this.locations.colorC, hexToRgb(params.colorC));
    gl.uniform1f(this.locations.intensity, Number(params.intensity));
    gl.uniform1f(this.locations.facetScale, Number(params.facetScale));
    gl.uniform1f(this.locations.contrast, Number(params.contrast));
    gl.uniform1f(this.locations.rim, Number(params.rim));
    gl.uniform1f(this.locations.rimWidth, Number(params.rimWidth ?? 1));
    gl.uniform1f(this.locations.textureScale, Number(params.textureScale ?? 2));
    gl.uniform1f(this.locations.textureAngle, Number(params.textureAngle ?? 0));
    gl.uniform1f(this.locations.lightAngle, Number(params.lightAngle));
    gl.uniform1f(this.locations.bevel, Number(params.bevel ?? 0));
    gl.uniform1f(this.locations.bevelSize, Number(params.bevelSize ?? 2));
    gl.uniform1i(this.locations.satinEnabled, params.satinEnabled ? 1 : 0);
    gl.uniform3fv(this.locations.satinColor, hexToRgb(params.satinColor ?? "#ffffff"));
    gl.uniform1f(this.locations.satinStrength, Number(params.satinStrength ?? 0));
    gl.uniform1f(this.locations.satinAngle, Number(params.satinAngle ?? 0));
    gl.uniform1f(this.locations.satinDistance, Number(params.satinDistance ?? 0));
    gl.uniform1f(this.locations.satinSize, Number(params.satinSize ?? 1));

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
