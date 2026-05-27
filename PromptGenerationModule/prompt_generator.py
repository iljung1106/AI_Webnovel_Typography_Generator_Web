"""
prompt_generator.py
===================
OpenRouter-backed prompt generation for Korean webnovel typography rendering.

This module uses OpenRouter's OpenAI-compatible chat completions API with:
    google/gemini-3.1-flash-lite-preview

It converts short user style cues into an English prompt tailored for the
typography image workflow.
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
_ENDING_LINE = "Change character composition dynamically while keeping a pure black silhouette vector look."
_BLACK_VECTOR_RULE = (
    "The result must be pure black silhouette vector typography: solid black shapes on a plain white background, "
    "with no color, no texture, no lighting, no shadow, no glow, no gradient, and no material effect."
)

_SYSTEM_PROMPT = """You write English prompts for a Korean webnovel title typography image-edit model.

Return exactly one final prompt and nothing else.
Do not use markdown fences.
Do not explain your reasoning.
Use short English tokens or short English phrases, not descriptive sentences.
Do not copy Korean source words, raw user input, or parenthetical translations.
The output must always be pure black silhouette vector typography.
Do not add glow, shadow, lighting, color, gradients, textures, material effects, or colored backgrounds.
Use the exact section labels:
ELEMENTS TO ADD:
STYLE:
"""

_FEW_SHOT_EXAMPLES = """Prompt example A:
Transform this plain Korean text into a decorative Korean webnovel title typography artwork.

ELEMENTS TO ADD:
- fracture marks
- slim tiara
- pocket watch
- vertical katana
- city skyline

STYLE:
- thick italic lettering
- angular geometry
- clean edges
- dynamic interlacing
- pure black silhouette vector
- plain white background

Change character composition dynamically while keeping a pure black silhouette vector look.

Prompt example B:
Transform this plain Korean text into a decorative Korean webnovel title typography artwork.

ELEMENTS TO ADD:
- globe icon
- rough hands
- four-point stars
- cursive line

STYLE:
- rough gothic
- jagged edges
- irregular composition
- pure black silhouette vector
- plain white background

Change character composition dynamically while keeping a pure black silhouette vector look.

Prompt example C:
Transform this plain Korean text into a decorative Korean webnovel title typography artwork.

ELEMENTS TO ADD:
- royal crown
- rose vines
- butterfly
- decorative ribbon
- diamond sparkles

STYLE:
- ornate serif
- graceful flourishes
- balanced symmetry
- refined edges
- pure black silhouette vector
- plain white background

Change character composition dynamically while keeping a pure black silhouette vector look.

Prompt example D:
Transform this plain Korean text into a decorative Korean webnovel title typography artwork. Keep original text visible.

ELEMENTS TO ADD:
- tentacles
- eldritch book
- stylized eyes
- coiling chains

STYLE:
- occult fantasy
- sharp accents
- structured chaos
- clean edges
- pure black silhouette vector
- plain white background

Change character composition dynamically while keeping a pure black silhouette vector look.
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
    genre_profile: str = ""


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
            "- Each bullet must be a short token or short phrase, usually 1 to 4 words.\n"
            "- Avoid descriptive sentence bullets.\n"
            "- Do not include parentheses, source words, translations, quotes, or labels inside bullets.\n"
            "- Do not echo Korean input words or raw user input in any output bullet.\n"
            f"- {_BLACK_VECTOR_RULE}\n"
            "- Do not mention glow, shadow, lighting effects, colors, gradients, textures, material effects, or colored backgrounds.\n"
            "- Use the internal genre direction only as bias; do not output it as a genre label.\n"
            "- The style should reflect the provided intent without copying it verbatim.\n"
            "- If user intent is empty, infer restrained generic webnovel typography cues.\n"
            "- Keep the result concise and production-ready.\n\n"
            "Title:\n"
            f"- {title_line}\n\n"
            "User intent tokens:\n"
            f"{keyword_lines}\n\n"
            "Required elements:\n"
            f"{element_lines}\n\n"
            "Internal genre direction:\n"
            f"{request.genre_profile.strip() or '(none)'}\n\n"
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

    element_lines = _clean_prompt_bullets(_extract_section_bullets(prompt, "ELEMENTS TO ADD:"))
    style_lines = _clean_prompt_bullets(_extract_section_bullets(prompt, "STYLE:"))
    has_explicit_ending_line = _ENDING_LINE in prompt
    style_lines = [
        line for line in style_lines if line.strip().lower() != f"- {_ENDING_LINE}".lower()
    ]

    if not style_lines:
        style_lines = [
            "- Strong Korean webnovel title typography composition.",
            "- Pure black silhouette vector typography with solid black shapes on a plain white background.",
        ]

    style_lines = _remove_forbidden_rendering_terms(style_lines)
    if not any("pure black silhouette vector" in line.lower() for line in style_lines):
        style_lines.append(
            "- Pure black silhouette vector typography with solid black shapes on a plain white background."
        )
    if not any("no color" in line.lower() for line in style_lines):
        style_lines.append(
            "- No color, texture, lighting, shadow, glow, gradient, or material effect."
        )

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


def _remove_forbidden_rendering_terms(lines: Sequence[str]) -> List[str]:
    forbidden = (
        "glow",
        "shadow",
        "lighting",
        "light",
        "color",
        "gradient",
        "texture",
        "metallic",
        "material",
        "gold",
        "silver",
        "red",
        "blue",
        "green",
        "purple",
    )
    cleaned = []
    for line in lines:
        lower_line = line.lower()
        if any(term in lower_line for term in forbidden):
            continue
        cleaned.append(line)
    return cleaned


def _clean_prompt_bullets(lines: Sequence[str]) -> List[str]:
    cleaned: List[str] = []
    for line in lines:
        item = line[2:].strip() if line.strip().startswith("- ") else line.strip()
        item = re.sub(r"\([^)]*\)", "", item)
        item = re.sub(r"\[[^\]]*\]", "", item)
        item = re.sub(r"[\"'`]", "", item)
        item = re.sub(r"\s+", " ", item).strip(" .,:;-/")
        if not item:
            continue
        if re.search(r"[\u3131-\u318E\uAC00-\uD7A3]", item):
            continue
        if len(item) > 48:
            continue
        if len(item.split()) > 6:
            continue
        cleaned.append(f"- {item}")
    return list(dict.fromkeys(cleaned))[:8]


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
