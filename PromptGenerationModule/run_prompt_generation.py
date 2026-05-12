"""
run_prompt_generation.py
========================
CLI for generating typography prompts from keywords and mandatory elements.

Example:
    python run_prompt_generation.py ^
        --keyword dark fantasy ^
        --keyword occult ^
        --element tentacles ^
        --element "big eldritch magic book" ^
        --element "stylized eyes around text"
"""

from __future__ import annotations

import argparse

try:
    from PromptGenerationModule.prompt_generator import (
        PromptGenerationError,
        TypographyPromptGenerator,
        TypographyPromptRequest,
    )
except ImportError:
    from prompt_generator import (
        PromptGenerationError,
        TypographyPromptGenerator,
        TypographyPromptRequest,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate a typography image prompt with OpenRouter."
    )
    parser.add_argument(
        "--title",
        default="",
        help="Optional Korean title to guide tone and symbolic motif selection.",
    )
    parser.add_argument(
        "--keyword",
        action="append",
        default=[],
        help="Style keyword or phrase. Repeat this flag for multiple keywords.",
    )
    parser.add_argument(
        "--element",
        action="append",
        default=[],
        help="Mandatory visual element. Repeat this flag for multiple elements.",
    )
    parser.add_argument(
        "--extra-instructions",
        default="",
        help="Optional extra directions for the prompt generator.",
    )
    parser.add_argument(
        "--api-key",
        help="Optional OpenRouter API key. If omitted, OPENROUTER_API_KEY is used.",
    )
    parser.add_argument(
        "--no-keep-original-text-visible",
        action="store_true",
        help="Do not force the opening line to include `Keep original text visible.`",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    generator = TypographyPromptGenerator(api_key=args.api_key)
    request = TypographyPromptRequest(
        title=args.title,
        keywords=args.keyword,
        required_elements=args.element,
        keep_original_text_visible=not args.no_keep_original_text_visible,
        extra_instructions=args.extra_instructions,
    )
    print(generator.generate(request))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PromptGenerationError as exc:
        raise SystemExit(f"[FAIL] {exc}")
