# TypoEffector

TypoEffector is a static WebGL2 prototype for applying material effects to existing
transparent typography or shape images. The input image is treated as a mask; the
black pixels are not edited as text, they are used as the silhouette for a shader.

## Current scope

- Upload PNG, WebP, or JPEG images.
- Extract the shape mask from alpha, black luminance, or both.
- Render two material templates:
  - Gemstone
  - Metal
- Preview against checker, dark, or light backgrounds.
- Export the rendered result as a transparent PNG.

## Run

Open `index.html` directly in a browser, or serve the folder with any static server.

```bash
npx serve .
```

No build step is required for this prototype.

## Architecture

```text
index.html
src/main.js       UI state, upload, export
src/effects.js    presets and parameter schema
src/renderer.js   WebGL2 shader renderer
src/styles.css    editor layout
```

The renderer is intentionally isolated from the UI so the same core can later be
wrapped in React, Vite, Electron, or a server-driven batch exporter.
