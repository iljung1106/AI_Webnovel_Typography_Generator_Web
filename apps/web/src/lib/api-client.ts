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

export async function getAssetSignedUrl(session: Session, assetId: string) {
  return requestJson<SignedUrlResponse>(`/assets/${assetId}/signed-url`, { session });
}
