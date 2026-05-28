import type { Session } from "@supabase/supabase-js";
import { apiBaseUrl } from "@/lib/env";
import type { LayoutItem } from "@typography-forge/shared";

type ApiOptions = {
  session: Session | null;
};

export type ProjectResponse = {
  id: string;
  title: string;
  status: string;
  selected_genre_id: string | null;
};

export type WorkListItemResponse = {
  project_id: string;
  version_id: string | null;
  title: string;
  genre: string | null;
  status: string;
  thumbnail_asset_id: string | null;
  thumbnail_expired: boolean;
  active_job_id: string | null;
  updated_at: string | null;
  completed_at: string | null;
};

export type ProjectVersionResponse = {
  id: string;
  project_id: string;
  title_text: string;
  layout_json?: {
    items?: LayoutItem[];
    canvas?: {
      width: number;
      height: number;
    };
  };
  style_resolved_json?: Record<string, unknown>;
  selected_candidate_id?: string | null;
};

export type JobResponse = {
  id: string;
  project_id: string;
  version_id: string;
  type: string;
  status: string;
  result_json: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
};

export type SignedUrlResponse = {
  asset_id: string;
  url: string;
  expires_in: number;
};

export type MeResponse = {
  id: string;
  email: string;
  display_name: string | null;
};

export type CreditSummaryResponse = {
  free_generation_remaining: number;
  free_generation_limit: number;
  free_generation_used_today: number;
  paid_credit_balance: number;
  usage_date: string;
};

export type CreditLedgerItemResponse = {
  id: string;
  credit_type: string;
  type: string;
  amount: number;
  balance_after: number;
  reason: string | null;
  memo: string | null;
  created_at: string | null;
};

export type ExportClaimResponse = {
  id: string;
  export_type: "final_png" | "transparent_png" | "layer_zip" | "watermark_removed_png";
  credit_source: "free" | "paid";
  paid_credit_spent: number;
  license_type: string;
  watermark_applied: boolean;
  status: string;
};

async function requestJson<T>(
  path: string,
  options: ApiOptions & {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
  }
): Promise<T> {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  if (options.session?.access_token) {
    headers.set("Authorization", `Bearer ${options.session.access_token}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : typeof payload?.message === "string"
          ? payload.message
          : "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
    throw new Error(detail);
  }
  return payload as T;
}

export async function createProject(
  session: Session,
  input: {
    title: string;
    selectedGenreId?: string | null;
  }
) {
  return requestJson<ProjectResponse>("/projects", {
    session,
    method: "POST",
    body: {
      title: input.title,
      selected_genre_id: input.selectedGenreId ?? null
    }
  });
}

export async function listProjects(session: Session) {
  return requestJson<WorkListItemResponse[]>("/projects", { session });
}

export async function getProject(session: Session, projectId: string) {
  return requestJson<ProjectResponse>(`/projects/${projectId}`, { session });
}

export async function createProjectVersion(
  session: Session,
  input: {
    projectId: string;
    titleText: string;
    genreId?: string | null;
    coverAssetId?: string | null;
  }
) {
  return requestJson<ProjectVersionResponse>(`/projects/${input.projectId}/versions`, {
    session,
    method: "POST",
    body: {
      title_text: input.titleText,
      genre_id: input.genreId ?? null,
      cover_asset_id: input.coverAssetId ?? null
    }
  });
}

export async function getProjectVersion(session: Session, projectId: string, versionId: string) {
  return requestJson<ProjectVersionResponse>(`/projects/${projectId}/versions/${versionId}`, { session });
}

export async function createJob(
  session: Session,
  input: {
    projectId: string;
    versionId: string;
    type: "layout_generation" | "style_resolution" | "typography_generation";
    inputJson: Record<string, unknown>;
  }
) {
  return requestJson<JobResponse>("/jobs", {
    session,
    method: "POST",
    body: {
      project_id: input.projectId,
      version_id: input.versionId,
      type: input.type,
      input_json: input.inputJson
    }
  });
}

export async function getJob(session: Session, jobId: string) {
  return requestJson<JobResponse>(`/jobs/${jobId}`, { session });
}

export async function getActiveJob(
  session: Session,
  input: {
    projectId: string;
    versionId: string;
    type?: "typography_generation";
  }
) {
  const params = new URLSearchParams({
    project_id: input.projectId,
    version_id: input.versionId,
    type: input.type ?? "typography_generation"
  });
  return requestJson<JobResponse>(`/jobs/active?${params.toString()}`, { session });
}

export async function getMe(session: Session) {
  return requestJson<MeResponse>("/me", { session });
}

export async function getCreditSummary(session: Session) {
  return requestJson<CreditSummaryResponse>("/me/credits", { session });
}

export async function listCreditLedger(session: Session, limit = 20) {
  return requestJson<CreditLedgerItemResponse[]>(`/me/credit-ledger?limit=${limit}`, { session });
}

export async function claimExport(
  session: Session,
  input: {
    projectId: string;
    versionId: string;
    exportType: "final_png" | "transparent_png" | "layer_zip" | "watermark_removed_png";
    creditSource: "free" | "paid";
    paidCreditCost?: number;
  }
) {
  return requestJson<ExportClaimResponse>("/exports/claim", {
    session,
    method: "POST",
    body: {
      project_id: input.projectId,
      version_id: input.versionId,
      export_type: input.exportType,
      credit_source: input.creditSource,
      paid_credit_cost: input.paidCreditCost ?? 0
    }
  });
}

export async function getAssetSignedUrl(session: Session, assetId: string) {
  return requestJson<SignedUrlResponse>(`/assets/${assetId}/signed-url`, { session });
}
