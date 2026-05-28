from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

FONT_PATH = ROOT_DIR / "LayoutModule" / "BookkMyungjo_Bold.ttf"
CANVAS_WIDTH = 2000
CANVAS_HEIGHT = 1000


@dataclass(frozen=True)
class CandidateGenerationFailure:
    seed: int
    error_code: str
    error_message: str


def generate_layout_items(title: str) -> list[dict[str, Any]]:
    """Compatibility wrapper around the existing LayoutModule behavior."""
    from LayoutModule.typography_layout import generate_items

    return generate_items(title)


def layout_items_from_payload(raw_items: Any) -> list[dict[str, Any]]:
    """Normalize layout items the same way the prototype generation route does."""
    if not isinstance(raw_items, list) or not raw_items:
        raise ValueError("items must be a non-empty list.")

    items: list[dict[str, Any]] = []
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


def render_layout_items_to_png(items: list[dict[str, Any]], output_path: Path) -> Path:
    """Render layout items to the same plain PNG shape used by PrototypeWebApp."""
    from PIL import Image, ImageDraw, ImageFont

    resample_bicubic = getattr(Image, "Resampling", Image).BICUBIC
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

        rotated = layer.rotate(-rotation, resample=resample_bicubic, expand=True)
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


def create_transparent_bw_mask(
    input_path: Path,
    output_path: Path,
    *,
    black_threshold: int = 84,
    white_threshold: int = 178,
    transparency_gamma: float = 1.35,
) -> Path:
    """Convert a generated typography image into anti-aliased black-on-alpha art."""
    from PIL import Image, ImageFilter

    if black_threshold >= white_threshold:
        raise ValueError("black_threshold must be lower than white_threshold.")
    if transparency_gamma <= 0:
        raise ValueError("transparency_gamma must be positive.")

    image = Image.open(input_path).convert("RGBA")
    grayscale = image.convert("L").filter(ImageFilter.GaussianBlur(radius=0.35))
    pixels = grayscale.load()
    width, height = grayscale.size
    alpha = Image.new("L", (width, height), 0)
    alpha_pixels = alpha.load()

    span = max(1, white_threshold - black_threshold)
    for y in range(height):
        for x in range(width):
            value = pixels[x, y]
            if value <= black_threshold:
                opacity = 255
            elif value >= white_threshold:
                opacity = 0
            else:
                t = (value - black_threshold) / span
                smooth = t * t * (3 - 2 * t)
                opacity = int(round(((1 - smooth) ** transparency_gamma) * 255))
            alpha_pixels[x, y] = opacity

    result = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    result.putalpha(alpha)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result.save(output_path, format="PNG")
    return output_path


def create_watermarked_preview(
    input_path: Path,
    output_path: Path,
    *,
    watermark_text: str = "fontasy.ai.kr",
) -> Path:
    """Bake a small attribution mark into a preview image."""
    from PIL import Image, ImageDraw, ImageFont

    image = Image.open(input_path).convert("RGBA")
    width, height = image.size
    draw = ImageDraw.Draw(image)
    font_size = max(18, int(max(width, height) * 0.018))
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", font_size)
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), watermark_text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    padding = max(18, int(max(width, height) * 0.018))
    box_width = text_width + int(padding * 1.2)
    box_height = text_height + int(padding * 0.9)
    x = width - box_width - padding
    y = height - box_height - padding
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rounded_rectangle(
        (x, y, x + box_width, y + box_height),
        radius=max(8, padding // 3),
        fill=(255, 255, 255, 92),
    )
    overlay_draw.text(
        (x + int(padding * 0.6), y + int(padding * 0.35)),
        watermark_text,
        font=font,
        fill=(15, 23, 42, 92),
    )
    output = Image.alpha_composite(image, overlay)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.convert("RGB").save(output_path, format="PNG")
    return output_path


def resolve_style_prompt(
    *,
    title: str,
    keywords: list[str],
    required_elements: list[str],
    genre_profile: str = "",
    extra_instructions: str = "",
    keep_original_text_visible: bool = True,
) -> str:
    """Compatibility wrapper around the existing PromptGenerationModule."""
    from PromptGenerationModule.prompt_generator import (
        TypographyPromptGenerator,
        TypographyPromptRequest,
    )

    generator = TypographyPromptGenerator()
    return generator.generate(
        TypographyPromptRequest(
            title=title,
            keywords=keywords,
            required_elements=required_elements,
            genre_profile=genre_profile,
            keep_original_text_visible=keep_original_text_visible,
            extra_instructions=extra_instructions,
        )
    )


def generate_typography_candidates(
    *,
    input_image_path: Path,
    prompt: str,
    seeds: list[int],
    output_dir: Path,
    filename_prefix: str,
) -> Any:
    """Compatibility wrapper around the existing Comfy Cloud generator."""
    from ImageGenerationModule.typography_image_generator import TypographyImageGenerator

    generator = TypographyImageGenerator()
    return generator.generate_batch_parallel(
        input_image_path=input_image_path,
        prompt=prompt,
        seeds=seeds,
        output_dir=output_dir,
        filename_prefix=filename_prefix,
        max_workers=len(seeds),
    )


def generate_typography_candidates_resilient(
    *,
    input_image_path: Path,
    prompt: str,
    seeds: list[int],
    output_dir: Path,
    filename_prefix: str,
) -> list[Any]:
    """Generate each slot independently so one failed sample does not sink the batch."""
    from ImageGenerationModule.typography_image_generator import TypographyImageGenerator

    generator = TypographyImageGenerator()
    uploaded_input_filename = generator.upload_input_image(input_image_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    results: list[Any] = [None] * len(seeds)

    def run_slot_with_seed(index: int, seed: int) -> Any:
        prefix = f"{filename_prefix}_{index}"
        isolated = generator._spawn_isolated_generator()
        return isolated.generate_from_uploaded_input(
            uploaded_input_filename=uploaded_input_filename,
            prompt=prompt,
            output_dir=output_dir / f"sample_{index}",
            filename_prefix=prefix,
            timeout=300.0,
            poll_interval=2.0,
            overwrite_outputs=True,
            noise_seed=seed,
        )

    with ThreadPoolExecutor(max_workers=max(1, len(seeds))) as executor:
        futures = {
            executor.submit(run_slot_with_seed, index, seed): (index, seed)
            for index, seed in enumerate(seeds, start=1)
        }
        for future in as_completed(futures):
            index, seed = futures[future]
            try:
                results[index - 1] = future.result()
            except Exception as exc:
                results[index - 1] = CandidateGenerationFailure(
                    seed=seed,
                    error_code=type(exc).__name__ or "GenerationFailed",
                    error_message=str(exc),
                )

    return results
