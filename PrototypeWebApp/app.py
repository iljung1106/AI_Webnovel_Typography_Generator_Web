from __future__ import annotations

import base64
import random
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, List

ROOT_DIR = Path(__file__).resolve().parent.parent
APP_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from flask import Flask, jsonify, render_template, request, send_file
from PIL import Image, ImageDraw, ImageFont

from ImageGenerationModule.typography_image_generator import TypographyImageGenerator
from LayoutModule.typography_layout import LayoutError, generate_items
from PromptGenerationModule.prompt_generator import (
    PromptGenerationError,
    TypographyPromptGenerator,
    TypographyPromptRequest,
)

FONT_PATH = ROOT_DIR / "LayoutModule" / "BookkMyungjo_Bold.ttf"
OUTPUT_ROOT = ROOT_DIR / "prototype_output"
CANVAS_WIDTH = 2000
CANVAS_HEIGHT = 1000
RESAMPLE_BICUBIC = getattr(Image, "Resampling", Image).BICUBIC

app = Flask(
    __name__,
    template_folder=str(APP_DIR / "templates"),
    static_folder=str(APP_DIR / "static"),
)


def _error(message: str, status_code: int = 400):
    response = jsonify({"error": message})
    response.status_code = status_code
    return response


def _safe_slug(raw: str) -> str:
    text = re.sub(r"[^\w\u3131-\u318E\uAC00-\uD7A3-]+", "_", raw.strip(), flags=re.UNICODE)
    return text.strip("_")[:80] or "typography"


def _session_dir(title: str) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    path = OUTPUT_ROOT / f"{stamp}_{_safe_slug(title)}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _items_from_payload(raw_items: Any) -> List[dict]:
    if not isinstance(raw_items, list) or not raw_items:
        raise ValueError("items must be a non-empty list.")

    items: List[dict] = []
    for index, raw in enumerate(raw_items):
        if not isinstance(raw, dict):
            raise ValueError(f"item {index} must be an object.")
        char = str(raw.get("char", "")).strip()
        if not char:
            raise ValueError(f"item {index} is missing char.")
        try:
            item = {
                "char": char[0],
                "x": float(raw.get("x", 0)),
                "y": float(raw.get("y", 0)),
                "fs": max(8, int(round(float(raw.get("fs", 8))))),
                "rotation": float(raw.get("rotation", 0)),
            }
        except (TypeError, ValueError) as exc:
            raise ValueError(f"item {index} has invalid numeric fields.") from exc
        items.append(item)
    return items


def _items_to_png(items: List[dict], output_path: Path) -> Path:
    canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (255, 255, 255, 255))

    for item in items:
        char = item["char"]
        fs = max(8, int(item["fs"]))
        x = float(item["x"])
        y = float(item["y"])
        rotation = float(item.get("rotation", 0))

        try:
            font = ImageFont.truetype(str(FONT_PATH), fs)
        except OSError:
            font = ImageFont.load_default()

        layer_size = max(fs * 4, 256)
        layer = Image.new("RGBA", (layer_size, layer_size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        bbox = draw.textbbox((0, 0), char, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        text_x = (layer_size - text_w) / 2 - bbox[0]
        text_y = (layer_size - text_h) / 2 - bbox[1]
        draw.text((text_x, text_y), char, fill=(0, 0, 0, 255), font=font)

        rotated = layer.rotate(-rotation, resample=RESAMPLE_BICUBIC, expand=True)
        center_x = x + fs / 2
        center_y = y - fs / 2
        dest = (
            int(round(center_x - rotated.width / 2)),
            int(round(center_y - rotated.height / 2)),
        )
        canvas.alpha_composite(rotated, dest=dest)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output_path, format="PNG")
    return output_path


def _path_to_data_url(path: Path) -> str:
    suffix = path.suffix.lower().lstrip(".") or "png"
    if suffix == "jpg":
        suffix = "jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/{suffix};base64,{encoded}"


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/assets/bookk-myungjo-bold.ttf")
def font_asset():
    return send_file(FONT_PATH, mimetype="font/ttf", max_age=3600)


@app.post("/api/layout")
def api_layout():
    payload = request.get_json(silent=True) or {}
    title = str(payload.get("title", "")).strip()
    if not title:
        return _error("title is required.")

    try:
        items = generate_items(title)
    except LayoutError as exc:
        return _error(str(exc), 400)
    except Exception as exc:  # pragma: no cover
        return _error(f"layout generation failed: {exc}", 500)

    return jsonify(
        {
            "title": title,
            "canvas": {"width": CANVAS_WIDTH, "height": CANVAS_HEIGHT},
            "items": items,
        }
    )


@app.post("/api/prompt")
def api_prompt():
    payload = request.get_json(silent=True) or {}
    title = str(payload.get("title", "")).strip()
    if not title:
        return _error("title is required.")

    keywords = payload.get("keywords") or []
    required_elements = payload.get("required_elements") or []
    if not isinstance(keywords, list) or not isinstance(required_elements, list):
        return _error("keywords and required_elements must be arrays.")

    try:
        generator = TypographyPromptGenerator()
        prompt = generator.generate(
            TypographyPromptRequest(
                title=title,
                keywords=[str(keyword).strip() for keyword in keywords if str(keyword).strip()],
                required_elements=[
                    str(element).strip()
                    for element in required_elements
                    if str(element).strip()
                ],
                keep_original_text_visible=bool(
                    payload.get("keep_original_text_visible", True)
                ),
                extra_instructions=str(payload.get("extra_instructions", "")).strip(),
            )
        )
    except PromptGenerationError as exc:
        return _error(str(exc), 400)
    except Exception as exc:  # pragma: no cover
        return _error(f"prompt generation failed: {exc}", 500)

    return jsonify({"prompt": prompt})


@app.post("/api/generate")
def api_generate():
    payload = request.get_json(silent=True) or {}
    title = str(payload.get("title", "")).strip()
    prompt = str(payload.get("prompt", "")).strip()
    if not title:
        return _error("title is required.")
    if not prompt:
        return _error("prompt is required.")

    try:
        items = _items_from_payload(payload.get("items"))
    except ValueError as exc:
        return _error(str(exc))

    try:
        sample_count = int(payload.get("sample_count", 3))
    except (TypeError, ValueError):
        return _error("sample_count must be an integer.")
    if sample_count < 1 or sample_count > 4:
        return _error("sample_count must be between 1 and 4.")

    try:
        generator = TypographyImageGenerator()
        session_dir = _session_dir(title)
        input_image_path = _items_to_png(items, session_dir / "edited_layout.png")
        uploaded_input_filename = generator.upload_input_image(input_image_path)

        base_seed = random.randint(10_000_000, 99_999_999)
        seeds = [base_seed + index * 104_729 for index in range(sample_count)]
        results = generator.generate_batch_parallel_from_uploaded_input(
            uploaded_input_filename=uploaded_input_filename,
            prompt=prompt,
            seeds=seeds,
            output_dir=session_dir,
            filename_prefix=_safe_slug(title),
            max_workers=sample_count,
        )

        samples = []
        for index, (seed, result) in enumerate(zip(seeds, results), start=1):
            image_path = next(
                (
                    path
                    for path in result.downloaded_files
                    if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
                ),
                None,
            )
            if image_path is None:
                raise RuntimeError(f"sample {index + 1} produced no image file.")

            samples.append(
                {
                    "index": index + 1,
                    "seed": seed,
                    "prompt_id": result.prompt_id,
                    "image_data_url": _path_to_data_url(image_path),
                    "image_path": str(image_path.resolve()),
                }
            )
    except Exception as exc:  # pragma: no cover
        return _error(f"sample generation failed: {exc}", 500)

    return jsonify({"samples": samples})


if __name__ == "__main__":
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    app.run(debug=True, host="127.0.0.1", port=5000)
