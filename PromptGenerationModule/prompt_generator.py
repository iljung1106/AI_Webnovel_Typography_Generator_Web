"""
prompt_generator.py
===================
OpenRouter-backed prompt generation for Korean webnovel typography rendering.

This module uses OpenRouter's OpenAI-compatible chat completions API with:
    google/gemini-3.1-flash-lite-preview

It converts:
    - style keywords
    - mandatory decorative elements
into an English prompt tailored for the typography image workflow.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import List, Optional, Sequence

import requests

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()


_MODEL = "google/gemini-3.1-flash-lite-preview"
_API_URL = "https://openrouter.ai/api/v1/chat/completions"
_DEFAULT_TIMEOUT = 60
_OPENING_LINE = "Transform this plain Korean text into a decorative Korean webnovel title typography artwork."
_ENDING_LINE = "Change character composition dynamically. White glow around text."

_SYSTEM_PROMPT = """You write English prompts for a Korean webnovel title typography image-edit model.

Return exactly one final prompt and nothing else.
Do not use markdown fences.
Do not explain your reasoning.
Write concrete visual instructions.
Preserve all mandatory elements explicitly.
Do not add instructions about glow, shadow, lighting, color, gradients, or colored backgrounds,
except for the exact final sentence that must remain unchanged.
Use the exact section labels:
ELEMENTS TO ADD:
STYLE:
"""

_FEW_SHOT_EXAMPLES = """Prompt example A:
Transform this plain Korean text into a decorative Korean webnovel title typography artwork.

ELEMENTS TO ADD:
- Fragments on the first letter.
- Tiara on middle right.
- Big pocket watch with clockworks. On left.
- Modern katana vertically embedded on bottom right. Sword replacing text.
- Cityscape.

STYLE:
- Modern style. The lettering is thick and speedy tilted italic.
- Rectangular and octagonal.
- Clean edges.
- Small fractured texture on first character's top left side.
- Modern factory style and dynamic interlaced text character composition.
- Angled and straight.
- Solid black glyphs on a clean white background.

Change character composition dynamically. White glow around text.

Prompt example B:
Transform this plain Korean text into a decorative Korean webnovel title typography artwork.

ELEMENTS TO ADD:
- Earth globe icon.
- Black rough hands at side.
- Four pointed stars around text.
- Cursive line on first letter.

STYLE:
- Sharp, rough gothic font with jagged edges.
- Jagged irregular random composition.
- Solid black glyphs on a clean white background.

Change character composition dynamically. White glow around text.

Prompt example C:
Transform this plain Korean text into a decorative Korean webnovel title typography artwork.

ELEMENTS TO ADD:
- Elegant royal crown on top center.
- Climbing rose vines wrapping around the first and last letters.
- A delicate butterfly landing on the top right.
- Flowing decorative ribbon intertwined with the bottom text.
- Small diamond sparkles around the flourishes.

STYLE:
- Elegant and ornate serif style. The lettering features graceful swooshes and flourishes.
- Flowing and harmonious composition with curved and sweeping lines.
- Crisp, sharp serifs and refined edges.
- Classic romantic vintage aesthetic with balanced symmetry.
- Solid black glyphs on a clean white background.

Change character composition dynamically. White glow around text.

Prompt example D:
Transform this plain Korean text into a decorative Korean webnovel title typography artwork. Keep original text visible.

ELEMENTS TO ADD:
- tentacles
- big eldritch magic book
- stylized eyes around text
- chains strongly coiling text

STYLE:
- Dark fantasy occult style. The lettering is sharp with mystical and slightly jagged accents.
- Chaotic yet structured interlaced text character composition.
- Clean, sharp edges with flat geometric shapes.
- Solid black glyphs on a clean white background.

Change character composition dynamically. White glow around text.
"""


class PromptGenerationError(RuntimeError):
    """Raised when prompt generation fails."""


@dataclass(frozen=True)
class TypographyPromptRequest:
    title: str = ""
    keywords: Sequence[str] = ()
    required_elements: Sequence[str] = ()
    keep_original_text_visible: bool = True
    extra_instructions: str = ""


class TypographyPromptGenerator:
    """OpenRouter client for typography prompt generation."""

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        model: str = _MODEL,
        timeout: int = _DEFAULT_TIMEOUT,
    ) -> None:
        key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not key:
            raise PromptGenerationError("OPENROUTER_API_KEY is not set.")

        self.api_key = key
        self.model = model
        self.timeout = timeout

    def _build_user_prompt(self, request: TypographyPromptRequest) -> str:
        keyword_lines = "\n".join(f"- {keyword}" for keyword in request.keywords) or "- none"
        element_lines = (
            "\n".join(f"- {element}" for element in request.required_elements) or "- none"
        )
        title_line = request.title.strip() or "(not provided)"
        visibility_rule = (
            "Include the exact sentence `Keep original text visible.` in the opening line."
            if request.keep_original_text_visible
            else "Do not mention text visibility unless absolutely needed."
        )
        extra = request.extra_instructions.strip() or "(none)"

        return (
            "Create one new prompt in the same spirit as the examples below.\n\n"
            "Requirements:\n"
            f"- Start with: {_OPENING_LINE}\n"
            f"- {visibility_rule}\n"
            "- Add a blank line after the opening line.\n"
            "- Include `ELEMENTS TO ADD:` followed by bullet points.\n"
            "- Include `STYLE:` followed by bullet points.\n"
            f"- End with: {_ENDING_LINE}\n"
            "- Output only the final prompt.\n"
            "- The prompt must be in English.\n"
            "- Do not mention glow, shadow, lighting effects, colors, gradients, or colored backgrounds anywhere except in the exact final sentence.\n"
            "- Use the title meaning to infer fitting mood, symbolism, and composition cues.\n"
            "- The required elements must appear explicitly in the prompt.\n"
            "- The style should reflect the provided keywords.\n"
            "- If keywords or required elements are empty, infer suitable ones from the title.\n"
            "- Keep the result concise but visually specific.\n\n"
            "Title:\n"
            f"- {title_line}\n\n"
            "Style keywords:\n"
            f"{keyword_lines}\n\n"
            "Required elements:\n"
            f"{element_lines}\n\n"
            "Additional instructions:\n"
            f"{extra}\n\n"
            f"{_FEW_SHOT_EXAMPLES}"
        )

    def _call_openrouter(self, messages: List[dict]) -> str:
        response = requests.post(
            _API_URL,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 700,
            },
            timeout=self.timeout,
        )
        if response.status_code != 200:
            raise PromptGenerationError(
                f"OpenRouter API error {response.status_code}: {response.text[:300]}"
            )

        payload = response.json()
        choices = payload.get("choices") or []
        if not choices:
            raise PromptGenerationError("OpenRouter returned no choices.")

        content = choices[0].get("message", {}).get("content", "")
        if not content:
            raise PromptGenerationError("OpenRouter returned empty content.")
        return str(content)

    def generate(self, request: TypographyPromptRequest) -> str:
        raw = self._call_openrouter(
            [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": self._build_user_prompt(request)},
            ]
        )
        return normalize_prompt(
            raw,
            keep_original_text_visible=request.keep_original_text_visible,
        )


def normalize_prompt(
    raw_prompt: str,
    *,
    keep_original_text_visible: bool,
) -> str:
    """Strip wrappers and rebuild the expected prompt skeleton."""
    prompt = raw_prompt.strip()
    prompt = re.sub(r"^```[a-zA-Z0-9_-]*\n?", "", prompt)
    prompt = re.sub(r"\n?```$", "", prompt).strip()

    lines = [line.rstrip() for line in prompt.splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    prompt = "\n".join(lines).strip()

    opening_line = _OPENING_LINE
    if keep_original_text_visible:
        opening_line += " Keep original text visible."

    element_lines = _extract_section_bullets(prompt, "ELEMENTS TO ADD:")
    style_lines = _extract_section_bullets(prompt, "STYLE:")
    has_explicit_ending_line = _ENDING_LINE in prompt
    style_lines = [
        line for line in style_lines if line.strip().lower() != f"- {_ENDING_LINE}".lower()
    ]

    if not style_lines:
        style_lines = [
            "- Strong Korean webnovel title typography composition.",
            "- Solid black glyphs on a clean white background.",
        ]

    if not any("solid black glyphs on a clean white background" in line.lower() for line in style_lines):
        style_lines.append("- Solid black glyphs on a clean white background.")

    parts = [
        opening_line,
        "",
        "ELEMENTS TO ADD:",
        *(element_lines or ["- No extra decorative elements beyond the requested style."]),
        "",
        "STYLE:",
        *style_lines,
    ]
    if has_explicit_ending_line:
        parts.extend(["", _ENDING_LINE])
    return "\n".join(parts).strip()


def _extract_section_bullets(prompt: str, header: str) -> List[str]:
    pattern = rf"{re.escape(header)}\s*(.*?)(?=\n[A-Z][A-Z:\s]+:|\Z)"
    match = re.search(pattern, prompt, flags=re.DOTALL)
    if not match:
        return []

    body = match.group(1).strip()
    if not body:
        return []

    bullets: List[str] = []
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("- "):
            bullets.append(line)
        else:
            bullets.append(f"- {line.lstrip('-').strip()}")
    return bullets
