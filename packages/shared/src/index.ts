export type WorkflowStepId =
  | "genre"
  | "cover"
  | "title"
  | "layout"
  | "style"
  | "candidates"
  | "effects"
  | "export";

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "timed_out"
  | "cancelled";

export type GenerationSlotStatus =
  | "queued"
  | "uploading_input"
  | "submitted_to_comfy"
  | "running"
  | "image_downloaded"
  | "postprocessing"
  | "succeeded"
  | "comfy_failed"
  | "download_failed"
  | "postprocess_failed"
  | "timed_out"
  | "refunded";

export interface LayoutItem {
  char: string;
  x: number;
  y: number;
  fs: number;
  rotation: number;
}

export interface GenreOption {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export interface ProjectSummary {
  id: string;
  title: string;
  status: "draft" | "active" | "expired" | "deleted";
  selectedGenreId?: string;
}

export interface JobSummary {
  id: string;
  projectId: string;
  versionId: string;
  type:
    | "cover_analysis"
    | "layout_generation"
    | "style_resolution"
    | "typography_generation"
    | "export";
  status: JobStatus;
}
