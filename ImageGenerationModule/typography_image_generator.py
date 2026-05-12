"""
typography_image_generator.py
=============================
Workflow-specific wrapper around Comfy Cloud for typography image generation.

This module assumes `comfy_api_workflow.json` has a fixed structure and only:
    1. the positive prompt
    2. the primary input image
need to change per request.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Sequence

try:
    from ImageGenerationModule.comfy_cloud import (
        ComfyCloudClient,
        ComfyCloudError,
        JobResult,
        load_workflow,
        set_workflow_inputs,
    )
except ImportError:
    from comfy_cloud import (
        ComfyCloudClient,
        ComfyCloudError,
        JobResult,
        load_workflow,
        set_workflow_inputs,
    )


DEFAULT_WORKFLOW_PATH = Path(__file__).with_name("comfy_api_workflow.json")

SAVE_IMAGE_NODE_ID = "9"
PRIMARY_INPUT_IMAGE_NODE_ID = "143"
POSITIVE_PROMPT_NODE_ID = "167:118"
NOISE_SEED_NODE_ID = "167:177"


@dataclass(frozen=True)
class TypographyWorkflowSpec:
    workflow_path: Path = DEFAULT_WORKFLOW_PATH
    save_image_node_id: str = SAVE_IMAGE_NODE_ID
    primary_input_image_node_id: str = PRIMARY_INPUT_IMAGE_NODE_ID
    positive_prompt_node_id: str = POSITIVE_PROMPT_NODE_ID
    noise_seed_node_id: str = NOISE_SEED_NODE_ID
    prompt_input_name: str = "prompt"
    image_input_name: str = "image"
    filename_prefix_input_name: str = "filename_prefix"
    noise_seed_input_name: str = "noise_seed"


def _validate_workflow_shape(workflow: dict, spec: TypographyWorkflowSpec) -> None:
    checks = (
        (spec.save_image_node_id, "SaveImage"),
        (spec.primary_input_image_node_id, "LoadImage"),
        (spec.positive_prompt_node_id, "TextEncodeQwenImageEditPlus"),
        (spec.noise_seed_node_id, "KSamplerAdvanced"),
    )
    for node_id, expected_class_type in checks:
        node = workflow.get(node_id)
        if not isinstance(node, dict):
            raise ComfyCloudError(f"Expected node {node_id} in workflow.")
        actual = node.get("class_type")
        if actual != expected_class_type:
            raise ComfyCloudError(
                f"Workflow node {node_id} expected class_type={expected_class_type}, got {actual}"
            )


def build_typography_workflow(
    *,
    prompt: str,
    uploaded_input_filename: str,
    filename_prefix: Optional[str] = None,
    noise_seed: Optional[int] = None,
    workflow_path: Path | str = DEFAULT_WORKFLOW_PATH,
    spec: TypographyWorkflowSpec = TypographyWorkflowSpec(),
) -> dict:
    """Load and patch the fixed typography workflow."""
    workflow = load_workflow(workflow_path)
    _validate_workflow_shape(workflow, spec)

    updates = {
        spec.primary_input_image_node_id: {
            spec.image_input_name: uploaded_input_filename,
        },
        spec.positive_prompt_node_id: {
            spec.prompt_input_name: prompt,
        },
    }
    if filename_prefix:
        updates[spec.save_image_node_id] = {
            spec.filename_prefix_input_name: filename_prefix,
        }
    if noise_seed is not None:
        updates[spec.noise_seed_node_id] = {
            spec.noise_seed_input_name: int(noise_seed),
        }

    return set_workflow_inputs(workflow, updates)


class TypographyImageGenerator:
    """High-level helper for the fixed typography image generation workflow."""

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        workflow_path: Path | str = DEFAULT_WORKFLOW_PATH,
        spec: TypographyWorkflowSpec = TypographyWorkflowSpec(),
    ) -> None:
        self.client = ComfyCloudClient(api_key=api_key)
        self.workflow_path = Path(workflow_path)
        self.spec = spec

    def _spawn_isolated_generator(self) -> "TypographyImageGenerator":
        return TypographyImageGenerator(
            api_key=self.client.api_key,
            workflow_path=self.workflow_path,
            spec=self.spec,
        )

    def generate(
        self,
        *,
        input_image_path: Path | str,
        prompt: str,
        output_dir: Path | str = "comfy_outputs",
        filename_prefix: Optional[str] = None,
        timeout: float = 300.0,
        poll_interval: float = 2.0,
        overwrite_outputs: bool = True,
        include_api_key_for_partner_nodes: bool = False,
        noise_seed: Optional[int] = None,
    ) -> JobResult:
        uploaded_input_filename = self.upload_input_image(input_image_path)
        return self.generate_from_uploaded_input(
            uploaded_input_filename=uploaded_input_filename,
            prompt=prompt,
            output_dir=output_dir,
            filename_prefix=filename_prefix,
            timeout=timeout,
            poll_interval=poll_interval,
            overwrite_outputs=overwrite_outputs,
            include_api_key_for_partner_nodes=include_api_key_for_partner_nodes,
            noise_seed=noise_seed,
        )

    def upload_input_image(self, input_image_path: Path | str) -> str:
        uploaded = self.client.upload_image(input_image_path)
        return uploaded.filename

    def generate_from_uploaded_input(
        self,
        *,
        uploaded_input_filename: str,
        prompt: str,
        output_dir: Path | str = "comfy_outputs",
        filename_prefix: Optional[str] = None,
        timeout: float = 300.0,
        poll_interval: float = 2.0,
        overwrite_outputs: bool = True,
        include_api_key_for_partner_nodes: bool = False,
        noise_seed: Optional[int] = None,
    ) -> JobResult:
        workflow = build_typography_workflow(
            prompt=prompt,
            uploaded_input_filename=uploaded_input_filename,
            filename_prefix=filename_prefix,
            noise_seed=noise_seed,
            workflow_path=self.workflow_path,
            spec=self.spec,
        )
        return self.client.run_workflow(
            workflow,
            include_api_key_for_partner_nodes=include_api_key_for_partner_nodes,
            timeout=timeout,
            poll_interval=poll_interval,
            download_output_dir=output_dir,
            overwrite_outputs=overwrite_outputs,
        )

    def generate_batch(
        self,
        *,
        input_image_path: Path | str,
        prompt: str,
        seeds: Sequence[int],
        output_dir: Path | str = "comfy_outputs",
        filename_prefix: Optional[str] = None,
        timeout: float = 300.0,
        poll_interval: float = 2.0,
        overwrite_outputs: bool = True,
        include_api_key_for_partner_nodes: bool = False,
    ) -> List[JobResult]:
        uploaded_input_filename = self.upload_input_image(input_image_path)
        results: List[JobResult] = []
        for index, seed in enumerate(seeds, start=1):
            prefix = filename_prefix
            if prefix:
                prefix = f"{prefix}_{index}"
            results.append(
                self.generate_from_uploaded_input(
                    uploaded_input_filename=uploaded_input_filename,
                    prompt=prompt,
                    output_dir=output_dir,
                    filename_prefix=prefix,
                    timeout=timeout,
                    poll_interval=poll_interval,
                    overwrite_outputs=overwrite_outputs,
                    include_api_key_for_partner_nodes=include_api_key_for_partner_nodes,
                    noise_seed=seed,
                )
            )
        return results

    def generate_batch_parallel(
        self,
        *,
        input_image_path: Path | str,
        prompt: str,
        seeds: Sequence[int],
        output_dir: Path | str = "comfy_outputs",
        filename_prefix: Optional[str] = None,
        timeout: float = 300.0,
        poll_interval: float = 2.0,
        overwrite_outputs: bool = True,
        include_api_key_for_partner_nodes: bool = False,
        max_workers: Optional[int] = None,
    ) -> List[JobResult]:
        uploaded_input_filename = self.upload_input_image(input_image_path)
        return self.generate_batch_parallel_from_uploaded_input(
            uploaded_input_filename=uploaded_input_filename,
            prompt=prompt,
            seeds=seeds,
            output_dir=output_dir,
            filename_prefix=filename_prefix,
            timeout=timeout,
            poll_interval=poll_interval,
            overwrite_outputs=overwrite_outputs,
            include_api_key_for_partner_nodes=include_api_key_for_partner_nodes,
            max_workers=max_workers,
        )

    def generate_batch_parallel_from_uploaded_input(
        self,
        *,
        uploaded_input_filename: str,
        prompt: str,
        seeds: Sequence[int],
        output_dir: Path | str = "comfy_outputs",
        filename_prefix: Optional[str] = None,
        timeout: float = 300.0,
        poll_interval: float = 2.0,
        overwrite_outputs: bool = True,
        include_api_key_for_partner_nodes: bool = False,
        max_workers: Optional[int] = None,
    ) -> List[JobResult]:
        output_root = Path(output_dir)
        output_root.mkdir(parents=True, exist_ok=True)

        seeds_list = list(seeds)
        if not seeds_list:
            return []

        worker_count = max_workers or len(seeds_list)
        results: List[Optional[JobResult]] = [None] * len(seeds_list)

        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            futures = {}
            for index, seed in enumerate(seeds_list, start=1):
                prefix = filename_prefix
                if prefix:
                    prefix = f"{prefix}_{index}"
                future = executor.submit(
                    self._generate_parallel_worker,
                    uploaded_input_filename=uploaded_input_filename,
                    prompt=prompt,
                    output_dir=output_root / f"sample_{index}",
                    filename_prefix=prefix,
                    timeout=timeout,
                    poll_interval=poll_interval,
                    overwrite_outputs=overwrite_outputs,
                    include_api_key_for_partner_nodes=include_api_key_for_partner_nodes,
                    noise_seed=seed,
                )
                futures[future] = index - 1

            for future in as_completed(futures):
                result_index = futures[future]
                results[result_index] = future.result()

        return [result for result in results if result is not None]

    def _generate_parallel_worker(
        self,
        *,
        uploaded_input_filename: str,
        prompt: str,
        output_dir: Path | str,
        filename_prefix: Optional[str],
        timeout: float,
        poll_interval: float,
        overwrite_outputs: bool,
        include_api_key_for_partner_nodes: bool,
        noise_seed: int,
    ) -> JobResult:
        isolated = self._spawn_isolated_generator()
        return isolated.generate_from_uploaded_input(
            uploaded_input_filename=uploaded_input_filename,
            prompt=prompt,
            output_dir=output_dir,
            filename_prefix=filename_prefix,
            timeout=timeout,
            poll_interval=poll_interval,
            overwrite_outputs=overwrite_outputs,
            include_api_key_for_partner_nodes=include_api_key_for_partner_nodes,
            noise_seed=noise_seed,
        )
