"""
run_comfy_cloud_job.py
======================
CLI for the fixed typography Comfy Cloud workflow.

Examples:
    python run_comfy_cloud_job.py ^
        --input-image layout.png ^
        --prompt "외신에게 집착받는 천재 마법사" ^
        --output-dir outputs

The script assumes:
    - `ImageGenerationModule/comfy_api_workflow.json` is the workflow template
    - only the prompt and the primary input image change per request
    - COMFY_CLOUD_API_KEY is available via .env, environment variable, or --api-key
"""

from __future__ import annotations

import argparse
from pathlib import Path

try:
    from ImageGenerationModule.comfy_cloud import ComfyCloudError
    from ImageGenerationModule.typography_image_generator import (
        DEFAULT_WORKFLOW_PATH,
        TypographyImageGenerator,
    )
except ImportError:
    from comfy_cloud import ComfyCloudError
    from typography_image_generator import DEFAULT_WORKFLOW_PATH, TypographyImageGenerator


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the typography Comfy Cloud workflow and download generated outputs."
    )
    parser.add_argument(
        "--input-image",
        required=True,
        help="Local typography layout image to upload into the workflow",
    )
    parser.add_argument(
        "--prompt",
        required=True,
        help="Positive prompt to write into the fixed workflow template",
    )
    parser.add_argument(
        "--workflow",
        default=str(DEFAULT_WORKFLOW_PATH),
        help="Path to workflow template JSON. Default: ImageGenerationModule/comfy_api_workflow.json",
    )
    parser.add_argument(
        "--api-key",
        help="Optional Comfy Cloud API key. If omitted, COMFY_CLOUD_API_KEY is used.",
    )
    parser.add_argument(
        "--filename-prefix",
        help="Optional SaveImage filename_prefix override",
    )
    parser.add_argument(
        "--output-dir",
        default="comfy_outputs",
        help="Directory for downloaded Comfy Cloud outputs",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=300.0,
        help="Seconds to wait for completion before failing",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=2.0,
        help="Seconds between status checks",
    )
    parser.add_argument(
        "--partner-nodes",
        action="store_true",
        help="Also send api_key_comfy_org in extra_data for workflows using partner nodes",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    generator = TypographyImageGenerator(
        api_key=args.api_key,
        workflow_path=args.workflow,
    )
    result = generator.generate(
        input_image_path=args.input_image,
        prompt=args.prompt,
        filename_prefix=args.filename_prefix,
        output_dir=args.output_dir,
        include_api_key_for_partner_nodes=args.partner_nodes,
        timeout=args.timeout,
        poll_interval=args.poll_interval,
    )

    print(f"prompt_id={result.prompt_id}")
    print(f"status={result.status}")
    print("downloaded_files=")
    for path in result.downloaded_files:
        print(f"  {Path(path).resolve()}")

    if not result.downloaded_files:
        print("  (none)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ComfyCloudError as exc:
        raise SystemExit(f"[FAIL] {exc}")
