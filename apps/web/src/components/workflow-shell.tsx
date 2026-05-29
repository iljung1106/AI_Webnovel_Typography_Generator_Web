"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  FolderOpen,
  Gift,
  Home,
  ImageUp,
  Loader2,
  LogIn,
  LogOut,
  Sparkles,
  Settings,
  UserRound,
  Wand2,
  X
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { LayoutItem } from "@typography-forge/shared";
import { TypoEffectorCanvas } from "@/components/typo-effector-canvas";
import {
  createJob,
  createProject,
  createProjectVersion,
  getActiveJob,
  getAssetSignedUrl,
  getCreditSummary,
  getJob,
  getProject,
  getProjectVersion,
  patchProjectVersionState,
  type CreditSummaryResponse,
  claimExport,
  type JobResponse,
  type ProjectVersionResponse
} from "@/lib/api-client";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getTypoEffectPreset, typoEffectPresets } from "@/lib/typo-effector-presets";
import { effectPresets, paramSchema } from "@/lib/typo-effector/effects";
import { exportTypoLayerZip, downloadTypoEffectPng, type TypoEffectParams, type TypoEffectPlacement, type TypoLayerParams } from "@/lib/typo-effector/render";
import { workflowSteps, type WorkflowStepId } from "@/lib/workflow";

const draftStorageKey = "typography-forge:guest-draft:v1";
const completedStorageKey = "typography-forge:completed:v1";
const pollDelayMs = 1800;
const maxPollAttempts = 90;
const workflowSaveDebounceMs = 1500;
const defaultCanvas: LayoutCanvas = { width: 2000, height: 1000 };
const terminalJobStatuses = new Set(["succeeded", "partially_succeeded", "failed", "timed_out", "cancelled"]);
const typographyGenerationPaidCost = 1;
const layerZipPaidCost = 1;

const genres = [
  {
    id: "romance-fantasy",
    name: "로맨스 판타지",
    visualKey: "romance"
  },
  {
    id: "modern",
    name: "현대",
    visualKey: "modern"
  },
  {
    id: "fantasy",
    name: "판타지",
    visualKey: "fantasy"
  },
  {
    id: "martial-arts",
    name: "무협",
    visualKey: "wuxia"
  },
  {
    id: "healing",
    name: "힐링",
    visualKey: "healing"
  }
];

type CoverDraft = {
  name: string;
  size: number;
  previewDataUrl?: string | null;
};

type LayoutCanvas = {
  width: number;
  height: number;
};

type StyleResolution = {
  prompt: string;
  display: {
    elements: string[];
    style: string[];
  };
};

type GenerationSlot = {
  slotIndex: number;
  status: string;
  candidateAssetId: string | null;
  transparentAssetId: string | null;
  errorCode: string | null;
  creditRefunded: number;
};

type AssetUrlEntry = {
  url: string;
  expiresAt: number;
};

type GuestDraft = {
  ownerUserId: string | null;
  completedWorkId: string | null;
  activeStepId: WorkflowStepId;
  selectedGenreId: string;
  cover: CoverDraft | null;
  title: string;
  stylePrompt: string;
  selectedCandidateId: string;
  projectId: string | null;
  versionId: string | null;
  layoutJobId: string | null;
  layoutJobStatus: string | null;
  layoutItems: LayoutItem[];
  layoutCanvas: LayoutCanvas | null;
  styleJobId: string | null;
  styleJobStatus: string | null;
  styleResolution: StyleResolution | null;
  generationJobId: string | null;
  generationJobStatus: string | null;
  generationCreditSource: "free" | "paid" | null;
  generationSlots: GenerationSlot[];
  effectPresetId: string;
  effectParams: TypoEffectParams | null;
  effectLayerParams: TypoLayerParams | null;
  effectPlacement: TypoEffectPlacement | null;
  updatedAt: string | null;
};

type CompletedWorkRecord = {
  id: string;
  title: string;
  genre: string;
  presetId: string;
  ownerUserId?: string | null;
  createdAt: string;
  updatedAt?: string;
  draft?: GuestDraft;
};

const defaultDraft: GuestDraft = {
  ownerUserId: null,
  completedWorkId: null,
  activeStepId: "genre",
  selectedGenreId: genres[0].id,
  cover: null,
  title: "",
  stylePrompt: "",
  selectedCandidateId: "",
  projectId: null,
  versionId: null,
  layoutJobId: null,
  layoutJobStatus: null,
  layoutItems: [],
  layoutCanvas: null,
  styleJobId: null,
  styleJobStatus: null,
  styleResolution: null,
  generationJobId: null,
  generationJobStatus: null,
  generationCreditSource: null,
  generationSlots: [],
  effectPresetId: typoEffectPresets[0].id,
  effectParams: null,
  effectLayerParams: null,
  effectPlacement: null,
  updatedAt: null
};

function normalizeDraft(rawDraft: Record<string, unknown>): GuestDraft {
  const rawStepId = typeof rawDraft.activeStepId === "string" ? rawDraft.activeStepId : defaultDraft.activeStepId;
  const migratedStepId = rawStepId === "candidates" ? "generation" : rawStepId;
  const activeStepId = workflowSteps.some((step) => step.id === migratedStepId)
    ? (migratedStepId as WorkflowStepId)
    : defaultDraft.activeStepId;
  return {
    ...defaultDraft,
    ...(rawDraft as Partial<GuestDraft>),
    activeStepId
  };
}

function draftForBrowserStorage(draft: GuestDraft): GuestDraft {
  return {
    ...draft,
    cover: draft.cover
      ? {
          name: draft.cover.name,
          size: draft.cover.size,
          previewDataUrl: null
        }
      : null
  };
}

function completedRecordForBrowserStorage(record: CompletedWorkRecord): CompletedWorkRecord {
  return {
    ...record,
    draft: record.draft ? draftForBrowserStorage(record.draft) : undefined
  };
}

function persistJsonToBrowserStorage(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  try {
    window.localStorage.setItem(key, serialized);
    return true;
  } catch {
    try {
      window.localStorage.removeItem(key);
      window.localStorage.setItem(key, serialized);
      return true;
    } catch {
      if (key !== completedStorageKey && compactCompletedRecordsForStorage()) {
        try {
          window.localStorage.setItem(key, serialized);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }
}

function compactCompletedRecordsForStorage() {
  try {
    const records = readCompletedRecords().map(completedRecordForBrowserStorage).slice(0, 12);
    window.localStorage.removeItem(completedStorageKey);
    window.localStorage.setItem(completedStorageKey, JSON.stringify(records));
    return true;
  } catch {
    try {
      window.localStorage.removeItem(completedStorageKey);
    } catch {
      // Ignore browser storage cleanup failures.
    }
    return false;
  }
}

function readCompletedRecords(): CompletedWorkRecord[] {
  try {
    const saved = window.localStorage.getItem(completedStorageKey);
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is CompletedWorkRecord => Boolean(item?.id))
      .map(completedRecordForBrowserStorage);
  } catch {
    return [];
  }
}

function draftStorageKeyFor(ownerUserId: string | null) {
  return ownerUserId ? `${draftStorageKey}:${ownerUserId}` : `${draftStorageKey}:anonymous`;
}

function readCompletedDraft(workId: string, ownerUserId: string | null): GuestDraft | null {
  const record = readCompletedRecords().find((item) => item.id === workId && item.ownerUserId === ownerUserId);
  if (!record) {
    return null;
  }
  if (record.draft && typeof record.draft === "object") {
    return normalizeDraft({
      ...record.draft,
      ownerUserId,
      completedWorkId: record.id
    });
  }

  const genre = genres.find((item) => item.name === record.genre) ?? genres[0];
  return normalizeDraft({
    ...defaultDraft,
    ownerUserId,
    completedWorkId: record.id,
    selectedGenreId: genre.id,
    title: record.title,
    effectPresetId: record.presetId
  });
}

function findMatchingCompletedRecord(records: CompletedWorkRecord[], draft: GuestDraft, title: string, genre: string, ownerUserId: string) {
  return records.find((item) => isSameCompletedWork(item, draft, title, genre, draft.effectPresetId, ownerUserId));
}

function isSameCompletedWork(
  record: CompletedWorkRecord,
  draft: GuestDraft,
  title: string,
  genre: string,
  presetId: string,
  ownerUserId: string
) {
  if (record.ownerUserId !== ownerUserId) {
    return false;
  }
  if (draft.completedWorkId && record.id === draft.completedWorkId) {
    return true;
  }
  if (draft.versionId && record.draft?.versionId === draft.versionId) {
    return true;
  }
  if (draft.projectId && record.draft?.projectId === draft.projectId) {
    return true;
  }
  return record.title === title && record.genre === genre && record.presetId === presetId;
}

function buildWorkflowState(draft: GuestDraft): Record<string, unknown> {
  return {
    schemaVersion: 1,
    activeStepId: draft.activeStepId,
    selectedGenreId: draft.selectedGenreId,
    title: draft.title,
    cover: draft.cover
      ? {
          name: draft.cover.name,
          size: draft.cover.size
        }
      : null,
    layout: {
      canvas: draft.layoutCanvas,
      items: draft.layoutItems
    },
    style: {
      userPrompt: draft.stylePrompt,
      prompt: draft.styleResolution?.prompt ?? "",
      resolvedElements: draft.styleResolution?.display.elements ?? [],
      resolvedStyles: draft.styleResolution?.display.style ?? [],
      jobId: draft.styleJobId,
      status: draft.styleJobStatus
    },
    generation: {
      jobId: draft.generationJobId,
      status: draft.generationJobStatus,
      creditSource: draft.generationCreditSource,
      slots: draft.generationSlots,
      selectedCandidateId: draft.selectedCandidateId
    },
    effects: {
      presetId: draft.effectPresetId,
      params: draft.effectParams,
      layerParams: draft.effectLayerParams,
      placement: draft.effectPlacement
    },
    project: {
      projectId: draft.projectId,
      versionId: draft.versionId,
      completedWorkId: draft.completedWorkId
    }
  };
}

function draftFromWorkflowState(
  stateJson: Record<string, unknown> | undefined,
  fallback: Pick<GuestDraft, "ownerUserId" | "projectId" | "versionId" | "title">
): GuestDraft | null {
  const state = asRecord(stateJson);
  if (!state || state.schemaVersion !== 1) {
    return null;
  }

  const rawStepId = typeof state.activeStepId === "string" ? state.activeStepId : defaultDraft.activeStepId;
  const activeStepId = workflowSteps.some((step) => step.id === rawStepId)
    ? (rawStepId as WorkflowStepId)
    : defaultDraft.activeStepId;
  const selectedGenreId =
    typeof state.selectedGenreId === "string" && genres.some((genre) => genre.id === state.selectedGenreId)
      ? state.selectedGenreId
      : defaultDraft.selectedGenreId;
  const rawCover = asRecord(state.cover);
  const rawLayout = asRecord(state.layout);
  const rawStyle = asRecord(state.style);
  const rawGeneration = asRecord(state.generation);
  const rawEffects = asRecord(state.effects);
  const rawProject = asRecord(state.project);
  const layout = readLayoutResult({
    items: Array.isArray(rawLayout?.items) ? rawLayout.items : [],
    canvas: rawLayout?.canvas
  });
  const stylePrompt = typeof rawStyle?.userPrompt === "string" ? rawStyle.userPrompt : "";
  const styleResolution =
    rawStyle && (rawStyle.prompt || rawStyle.resolvedElements || rawStyle.resolvedStyles)
      ? {
          prompt: typeof rawStyle.prompt === "string" ? rawStyle.prompt : "",
          display: {
            elements: readStringList(rawStyle.resolvedElements),
            style: readStringList(rawStyle.resolvedStyles)
          }
        }
      : null;

  return normalizeDraft({
    ...defaultDraft,
    ownerUserId: fallback.ownerUserId,
    completedWorkId: readNullableString(rawProject?.completedWorkId),
    activeStepId,
    selectedGenreId,
    cover: rawCover
      ? {
          name: typeof rawCover.name === "string" ? rawCover.name : "cover",
          size: toNumber(rawCover.size, 0),
          previewDataUrl: null
        }
      : null,
    title: typeof state.title === "string" ? state.title : fallback.title,
    stylePrompt,
    selectedCandidateId: readNullableString(rawGeneration?.selectedCandidateId) ?? "",
    projectId: readNullableString(rawProject?.projectId) ?? fallback.projectId,
    versionId: readNullableString(rawProject?.versionId) ?? fallback.versionId,
    layoutJobId: null,
    layoutJobStatus: null,
    layoutItems: layout?.items ?? [],
    layoutCanvas: layout?.canvas ?? null,
    styleJobId: readNullableString(rawStyle?.jobId),
    styleJobStatus: readNullableString(rawStyle?.status),
    styleResolution,
    generationJobId: readNullableString(rawGeneration?.jobId),
    generationJobStatus: readNullableString(rawGeneration?.status),
    generationCreditSource:
      rawGeneration?.creditSource === "paid" ? "paid" : rawGeneration?.creditSource === "free" ? "free" : null,
    generationSlots: readGenerationSlots({
      slots: Array.isArray(rawGeneration?.slots) ? rawGeneration.slots : []
    }),
    effectPresetId: readNullableString(rawEffects?.presetId) ?? defaultDraft.effectPresetId,
    effectParams: asRecord(rawEffects?.params) as TypoEffectParams | null,
    effectLayerParams: asRecord(rawEffects?.layerParams) as TypoLayerParams | null,
    effectPlacement: asRecord(rawEffects?.placement) as TypoEffectPlacement | null,
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : new Date().toISOString()
  });
}

function draftFromProjectVersion(
  projectTitle: string,
  version: ProjectVersionResponse,
  ownerUserId: string
): GuestDraft {
  const fallbackDraft = {
    ownerUserId,
    projectId: String(version.project_id),
    versionId: String(version.id),
    title: version.title_text || projectTitle
  };
  const workflowDraft = draftFromWorkflowState(version.workflow_state_json, fallbackDraft);
  if (workflowDraft) {
    return normalizeDraft({
      ...workflowDraft,
      ownerUserId,
      projectId: String(version.project_id),
      versionId: String(version.id)
    });
  }

  const layout = readLayoutResult(version.layout_json ?? {});
  const styleResolution = readStyleResolution(version.style_resolved_json ?? {});
  return normalizeDraft({
    ...defaultDraft,
    ownerUserId,
    activeStepId: version.selected_candidate_id ? "effects" : layout?.items.length ? "layout" : "title",
    title: version.title_text || projectTitle,
    projectId: String(version.project_id),
    versionId: String(version.id),
    layoutItems: layout?.items ?? [],
    layoutCanvas: layout?.canvas ?? null,
    styleResolution,
    selectedCandidateId: version.selected_candidate_id ? String(version.selected_candidate_id) : "",
    updatedAt: new Date().toISOString()
  });
}

export function WorkflowShell() {
  const [draft, setDraft] = useState<GuestDraft>(defaultDraft);
  const [isHydrated, setIsHydrated] = useState(false);
  const [saveState, setSaveState] = useState("임시 저장 준비 중");
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(!supabase);
  const [pendingWorkId, setPendingWorkId] = useState<string | null>(null);
  const [pendingRemoteWork, setPendingRemoteWork] = useState<{ projectId: string; versionId: string } | null>(null);
  const [authState, setAuthState] = useState(isSupabaseConfigured ? "로그인 확인 중" : "로그인 준비 중");
  const [remoteState, setRemoteState] = useState("AI 작업을 시작할 수 있어요.");
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [isRemoteBusy, setIsRemoteBusy] = useState(false);
  const [assetUrls, setAssetUrls] = useState<Record<string, AssetUrlEntry>>({});
  const [creditSummary, setCreditSummary] = useState<CreditSummaryResponse | null>(null);
  const autoLayoutRequestKeyRef = useRef<string | null>(null);
  const resumedGenerationJobIdRef = useRef<string | null>(null);
  const serverSaveRevisionRef = useRef<number | null>(null);
  const lastServerSnapshotRef = useRef<string | null>(null);
  const serverSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let shouldMarkHydrated = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const workId = params.get("workId");
      const projectId = params.get("projectId");
      const versionId = params.get("versionId");
      const shouldStartNew = params.get("new") === "1";

      if (projectId && versionId) {
        setPendingRemoteWork({ projectId, versionId });
        shouldMarkHydrated = false;
        return;
      } else if (workId) {
        setPendingWorkId(workId);
        shouldMarkHydrated = false;
        return;
      } else if (shouldStartNew) {
        const nextDraft = { ...defaultDraft, ownerUserId: session?.user.id ?? null };
        setDraft(nextDraft);
        persistJsonToBrowserStorage(draftStorageKeyFor(nextDraft.ownerUserId), draftForBrowserStorage(nextDraft));
        window.history.replaceState(null, "", "/create");
      } else {
        const nextDraft = { ...defaultDraft, ownerUserId: session?.user.id ?? null };
        setDraft(nextDraft);
        persistJsonToBrowserStorage(draftStorageKeyFor(nextDraft.ownerUserId), draftForBrowserStorage(nextDraft));
      }
    } catch {
      setSaveState("임시 저장을 불러오지 못했어요");
    }
    if (shouldMarkHydrated) {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!pendingWorkId || !isAuthChecked) {
      return;
    }

    const completedDraft = readCompletedDraft(pendingWorkId, session?.user.id ?? null);
    if (completedDraft) {
      setDraft(completedDraft);
    } else {
      setDraft({ ...defaultDraft });
      setSaveState(session ? "최근 작업을 불러오지 못했어요" : "로그인 후 최근 작업을 열 수 있어요");
    }
    setIsHydrated(true);
  }, [isAuthChecked, pendingWorkId, session]);

  useEffect(() => {
    if (!pendingRemoteWork || !isAuthChecked) {
      return;
    }
    if (!session) {
      setDraft({ ...defaultDraft });
      setSaveState("로그인 후 작업을 열 수 있어요");
      setIsHydrated(true);
      return;
    }
    let isCancelled = false;
    Promise.all([
      getProject(session, pendingRemoteWork.projectId),
      getProjectVersion(session, pendingRemoteWork.projectId, pendingRemoteWork.versionId)
    ])
      .then(([project, version]) => {
        if (isCancelled) {
          return;
        }
        const restoredDraft = draftFromProjectVersion(project.title, version, session.user.id);
        serverSaveRevisionRef.current = version.save_revision ?? 0;
        lastServerSnapshotRef.current = JSON.stringify(buildWorkflowState(restoredDraft));
        setDraft(restoredDraft);
        setSaveState("저장됨");
        setIsHydrated(true);
      })
      .catch(() => {
        if (!isCancelled) {
          setDraft({ ...defaultDraft });
          setSaveState("작업을 불러오지 못했어요");
          setIsHydrated(true);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [isAuthChecked, pendingRemoteWork, session]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const ownerUserId = session?.user.id ?? draft.ownerUserId ?? null;
    const nextDraft = {
      ...draft,
      ownerUserId,
      updatedAt: new Date().toISOString()
    };

    if (persistJsonToBrowserStorage(draftStorageKeyFor(ownerUserId), draftForBrowserStorage(nextDraft))) {
      setSaveState("임시 저장됨");
    } else {
      setSaveState("저장 공간을 정리해주세요");
    }

    if (!session || !nextDraft.projectId || !nextDraft.versionId) {
      return;
    }

    const snapshot = JSON.stringify(buildWorkflowState(nextDraft));
    if (snapshot === lastServerSnapshotRef.current) {
      setSaveState("저장됨");
      return;
    }

    setSaveState("저장 중");
    serverSaveTimerRef.current = window.setTimeout(() => {
      void saveDraftStateToServer(nextDraft, snapshot);
    }, workflowSaveDebounceMs);

    return () => {
      if (serverSaveTimerRef.current !== null) {
        window.clearTimeout(serverSaveTimerRef.current);
        serverSaveTimerRef.current = null;
      }
    };
  }, [draft, isHydrated, session?.user.id]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) {
        return;
      }
      if (error) {
        setAuthState("로그인 상태 확인 실패");
        setIsAuthChecked(true);
        return;
      }
      setSession(data.session);
      setAuthState(authLabel(data.session));
      setIsAuthChecked(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthState(authLabel(nextSession));
      setIsAuthChecked(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setCreditSummary(null);
      return;
    }

    const assetIds = draft.generationSlots
      .flatMap((slot) => [slot.candidateAssetId, slot.transparentAssetId])
      .filter((assetId): assetId is string => Boolean(assetId));
    const refreshThreshold = Date.now() + 30_000;
    const missingAssetIds = Array.from(new Set(assetIds)).filter((assetId) => {
      const cachedAsset = assetUrls[assetId];
      return !cachedAsset || cachedAsset.expiresAt <= refreshThreshold;
    });

    if (!missingAssetIds.length) {
      return;
    }

    let isCancelled = false;
    Promise.all(
      missingAssetIds.map(async (assetId) => {
        try {
          const signedAsset = await getAssetSignedUrl(session, assetId);
          return [
            assetId,
            {
              url: signedAsset.url,
              expiresAt: Date.now() + Math.max(30, signedAsset.expires_in - 30) * 1000
            }
          ] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (isCancelled) {
        return;
      }
      const signedEntries = entries.filter((entry): entry is readonly [string, AssetUrlEntry] => Boolean(entry));
      if (!signedEntries.length) {
        return;
      }
      setAssetUrls((currentUrls) => {
        const nextUrls = { ...currentUrls };
        signedEntries.forEach((entry) => {
          nextUrls[entry[0]] = entry[1];
        });
        return nextUrls;
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [assetUrls, draft.generationSlots, session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    let isCancelled = false;
    refreshCreditSummary(session, (summary) => {
      if (!isCancelled) {
        setCreditSummary(summary);
      }
    })
      .catch(() => undefined);
    return () => {
      isCancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const refresh = () => {
      void refreshCreditSummary(session, setCreditSummary);
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("fontasy:credits-updated", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("fontasy:credits-updated", refresh);
    };
  }, [session]);

  useEffect(() => {
    if (draft.activeStepId !== "layout" || !isHydrated || !session || isRemoteBusy) {
      return;
    }
    const titleText = draft.title.trim();
    if (!titleText || draft.layoutItems.length || draft.layoutJobId) {
      return;
    }
    const requestKey = `${session.user.id}:${draft.projectId ?? "new"}:${titleText}`;
    if (autoLayoutRequestKeyRef.current === requestKey) {
      return;
    }
    autoLayoutRequestKeyRef.current = requestKey;
    void requestLayoutJob();
  }, [draft.activeStepId, draft.layoutItems.length, draft.layoutJobId, draft.projectId, draft.title, isHydrated, isRemoteBusy, session]);

  useEffect(() => {
    if (!session || !draft.generationJobId) {
      return;
    }
    const needsSlotRefresh = draft.generationSlots.some((slot) => slot.candidateAssetId && !slot.transparentAssetId);
    if (!needsSlotRefresh) {
      return;
    }
    let isCancelled = false;
    getJob(session, draft.generationJobId)
      .then((job) => {
        if (!isCancelled) {
          applyGenerationJob(job);
        }
      })
      .catch(() => undefined);
    return () => {
      isCancelled = true;
    };
  }, [draft.generationJobId, draft.generationSlots, session]);

  useEffect(() => {
    if (!session || !draft.projectId || !draft.versionId || draft.generationJobId) {
      return;
    }
    let isCancelled = false;
    getActiveJob(session, {
      projectId: draft.projectId,
      versionId: draft.versionId
    })
      .then((job) => {
        if (!isCancelled) {
          applyGenerationJob(job);
        }
      })
      .catch(() => undefined);
    return () => {
      isCancelled = true;
    };
  }, [draft.generationJobId, draft.projectId, draft.versionId, session]);

  useEffect(() => {
    if (
      !session ||
      !draft.generationJobId ||
      !isActiveJobStatus(draft.generationJobStatus) ||
      isRemoteBusy ||
      resumedGenerationJobIdRef.current === draft.generationJobId
    ) {
      return;
    }

    let isCancelled = false;
    resumedGenerationJobIdRef.current = draft.generationJobId;
    setIsRemoteBusy(true);
    setRemoteError(null);
    setRemoteState("진행 중인 시안 생성을 확인하는 중");

    pollJob(session, draft.generationJobId, (nextJob) => {
      if (!isCancelled) {
        applyGenerationJob(nextJob);
        setRemoteState(jobStatusMessage("시안", nextJob.status));
      }
    })
      .then((finalJob) => {
        if (!isCancelled && finalJob && !isSuccessfulTerminal(finalJob.status) && isTerminalJobStatus(finalJob.status)) {
          setRemoteError(jobFailureMessage(finalJob));
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setRemoteError(errorMessage(error));
          setRemoteState("진행 중인 시안을 확인하지 못했어요");
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsRemoteBusy(false);
        }
        resumedGenerationJobIdRef.current = null;
      });

    return () => {
      isCancelled = true;
    };
  }, [draft.generationJobId, draft.generationJobStatus, isRemoteBusy, session]);

  const activeStepIndex = workflowSteps.findIndex((step) => step.id === draft.activeStepId);
  const selectedGenre = genres.find((genre) => genre.id === draft.selectedGenreId) ?? genres[0];
  const freeGenerationCredits = creditSummary?.free_generation_remaining ?? null;
  const paidCredits = creditSummary?.paid_credit_balance ?? 0;

  const canGoBack = activeStepIndex > 0;
  const canGoNext = activeStepIndex < workflowSteps.length - 1 && canAdvanceFromStep(draft);
  const stepMeta = useMemo(() => getStepMeta(draft.activeStepId), [draft.activeStepId]);

  function updateDraft(nextDraft: Partial<GuestDraft>) {
    setDraft((currentDraft) => ({ ...currentDraft, ...nextDraft }));
  }

  async function saveDraftStateToServer(
    draftToSave: GuestDraft,
    snapshot = JSON.stringify(buildWorkflowState(draftToSave)),
    activeSession = session
  ) {
    if (!activeSession || !draftToSave.projectId || !draftToSave.versionId) {
      return null;
    }
    try {
      const version = await patchProjectVersionState(activeSession, {
        projectId: draftToSave.projectId,
        versionId: draftToSave.versionId,
        currentStep: draftToSave.activeStepId,
        workflowStateJson: JSON.parse(snapshot) as Record<string, unknown>,
        baseRevision: serverSaveRevisionRef.current
      });
      serverSaveRevisionRef.current = version.save_revision ?? serverSaveRevisionRef.current;
      lastServerSnapshotRef.current = snapshot;
      setSaveState("저장됨");
      return version;
    } catch (error) {
      setSaveState("저장 실패");
      setRemoteError(errorMessage(error));
      return null;
    }
  }

  function goToStep(stepId: WorkflowStepId) {
    updateDraft({ activeStepId: stepId });
  }

  function goBack() {
    if (!canGoBack) {
      return;
    }

    goToStep(workflowSteps[activeStepIndex - 1].id);
  }

  async function goNext() {
    if (!canGoNext) {
      return;
    }

    if (draft.activeStepId === "title" && session && draft.title.trim() && !draft.projectId && !draft.versionId) {
      try {
        await ensureRemoteDraft(session);
      } catch (error) {
        setRemoteError(errorMessage(error));
        setRemoteState("작업 저장 실패");
        return;
      }
    }

    goToStep(workflowSteps[activeStepIndex + 1].id);
  }

  async function signInWithGoogle() {
    if (!supabase) {
      setRemoteError("로그인을 잠시 후 다시 시도해주세요.");
      return;
    }

    setRemoteError(null);
    setRemoteState("Google 로그인으로 이동합니다.");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.href
      }
    });
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    setRemoteError(null);
    await supabase.auth.signOut();
    setRemoteState("로그아웃됨");
  }

  async function ensureRemoteDraft(activeSession: Session) {
    if (draft.projectId && draft.versionId) {
      return {
        projectId: draft.projectId,
        versionId: draft.versionId
      };
    }

    const titleText = draft.title.trim() || `${selectedGenre.name} 타이포`;
    setRemoteError(null);
    setRemoteState("작업 공간을 준비하는 중입니다.");
    const project = await createProject(activeSession, {
      title: titleText,
      selectedGenreId: null
    });
    const version = await createProjectVersion(activeSession, {
      projectId: project.id,
      titleText,
      genreId: null
    });
    const remoteReadyDraft = normalizeDraft({
      ...draft,
      projectId: project.id,
      versionId: version.id,
      updatedAt: new Date().toISOString()
    });
    serverSaveRevisionRef.current = version.save_revision ?? 0;
    updateDraft(remoteReadyDraft);
    await saveDraftStateToServer(remoteReadyDraft, undefined, activeSession);
    setRemoteState("작업 공간이 준비되었습니다.");
    return {
      projectId: project.id,
      versionId: version.id
    };
  }

  async function requestLayoutJob() {
    if (!session) {
      setRemoteError("Google 로그인 후 AI 배치 추천을 사용할 수 있어요.");
      return;
    }
    const titleText = draft.title.trim();
    if (!titleText) {
      setRemoteError("제목을 먼저 입력해주세요.");
      goToStep("title");
      return;
    }

    setIsRemoteBusy(true);
    setRemoteError(null);
    try {
      const remoteDraft = await ensureRemoteDraft(session);
      setRemoteState("AI 배치 추천을 준비하는 중");
      const job = await createJob(session, {
        projectId: remoteDraft.projectId,
        versionId: remoteDraft.versionId,
        type: "layout_generation",
        inputJson: {
          title: titleText
        }
      });
      updateDraft({
        activeStepId: "layout",
        layoutJobId: job.id,
        layoutJobStatus: job.status,
        layoutItems: [],
        layoutCanvas: null
      });
      const finalJob = await pollJob(session, job.id, (nextJob) => {
        applyLayoutJob(nextJob);
        setRemoteState(jobStatusMessage("배치", nextJob.status));
      });
      if (finalJob && !isSuccessfulTerminal(finalJob.status) && isTerminalJobStatus(finalJob.status)) {
        setRemoteError(jobFailureMessage(finalJob));
      }
    } catch (error) {
      setRemoteError(errorMessage(error));
      setRemoteState("AI 배치 추천 실패");
    } finally {
      setIsRemoteBusy(false);
    }
  }

  async function requestStyleJob() {
    if (!session) {
      setRemoteError("Google 로그인 후 스타일 정리를 요청할 수 있어요.");
      return;
    }
    const titleText = draft.title.trim();
    if (!titleText) {
      setRemoteError("제목을 먼저 입력해주세요.");
      goToStep("title");
      return;
    }
    if (!draft.layoutItems.length) {
      setRemoteError("제목 배치를 먼저 추천받아 주세요.");
      goToStep("layout");
      return;
    }
    if (!draft.stylePrompt.trim()) {
      setRemoteError("원하는 장식과 분위기를 먼저 입력해주세요.");
      return;
    }

    setIsRemoteBusy(true);
    setRemoteError(null);
    try {
      const remoteDraft = await ensureRemoteDraft(session);
      setRemoteState("AI 스타일 정리를 요청하는 중");
      const job = await createJob(session, {
        projectId: remoteDraft.projectId,
        versionId: remoteDraft.versionId,
        type: "style_resolution",
        inputJson: {
          title: titleText,
          keywords: buildStyleKeywords(draft.stylePrompt),
          required_elements: [],
          genre_profile: selectedGenre.id,
          extra_instructions: buildStyleResolutionInstructions(selectedGenre.id, draft.stylePrompt),
          keep_original_text_visible: true
        }
      });
      updateDraft({
        styleJobId: job.id,
        styleJobStatus: job.status,
        styleResolution: null
      });
      const finalJob = await pollJob(session, job.id, (nextJob) => {
        applyStyleJob(nextJob);
        setRemoteState(jobStatusMessage("스타일", nextJob.status));
      });
      if (finalJob && !isSuccessfulTerminal(finalJob.status) && isTerminalJobStatus(finalJob.status)) {
        setRemoteError(jobFailureMessage(finalJob));
      }
    } catch (error) {
      setRemoteError(errorMessage(error));
      setRemoteState("AI 스타일 요청 실패");
    } finally {
      setIsRemoteBusy(false);
    }
  }

  async function requestGenerationJob() {
    if (!session) {
      setRemoteError("Google 로그인 후 시안 생성을 요청할 수 있어요.");
      return;
    }
    const titleText = draft.title.trim();
    if (!titleText) {
      setRemoteError("제목을 먼저 입력해주세요.");
      goToStep("title");
      return;
    }
    if (!draft.layoutItems.length) {
      setRemoteError("제목 배치를 먼저 추천받아 주세요.");
      goToStep("layout");
      return;
    }
    if (!draft.styleResolution) {
      setRemoteError("스타일 정리를 먼저 완료해주세요.");
      goToStep("style");
      return;
    }
    const creditSource = (creditSummary?.free_generation_remaining ?? 0) > 0 ? "free" : "paid";
    if (creditSource === "paid" && paidCredits < typographyGenerationPaidCost) {
      setRemoteError("오늘의 무료 생성 횟수를 모두 사용했어요. 유료 크레딧이 필요합니다.");
      return;
    }

    setIsRemoteBusy(true);
    setRemoteError(null);
    try {
      const remoteDraft = await ensureRemoteDraft(session);
      const layoutJson = {
        items: draft.layoutItems,
        canvas: draft.layoutCanvas ?? defaultCanvas
      };
      setRemoteState(
        creditSource === "free"
          ? "무료 생성 1회를 사용해 시안 생성을 요청하는 중"
          : `유료 크레딧 ${typographyGenerationPaidCost}개를 사용해 시안 생성을 요청하는 중`
      );
      const job = await createJob(session, {
        projectId: remoteDraft.projectId,
        versionId: remoteDraft.versionId,
        type: "typography_generation",
        inputJson: {
          title: titleText,
          credit_source: creditSource,
          credit_cost_total: creditSource === "paid" ? typographyGenerationPaidCost : 0,
          prompt: buildGenerationPrompt(draft.styleResolution, draft.stylePrompt, selectedGenre),
          layout_json: layoutJson,
          items: draft.layoutItems,
          sample_count: 3
        }
      });
      updateDraft({
        generationJobId: job.id,
        generationJobStatus: job.status,
        generationCreditSource: readGenerationCreditSource(job.result_json) ?? creditSource,
        generationSlots: readGenerationSlots(job.result_json),
        selectedCandidateId: ""
      });
      await refreshCreditSummary(session, setCreditSummary);
      const finalJob = await pollJob(session, job.id, (nextJob) => {
        applyGenerationJob(nextJob);
        setRemoteState(jobStatusMessage("시안", nextJob.status));
      });
      if (finalJob && !isSuccessfulTerminal(finalJob.status) && isTerminalJobStatus(finalJob.status)) {
        setRemoteError(jobFailureMessage(finalJob));
      }
    } catch (error) {
      setRemoteError(errorMessage(error));
      setRemoteState("AI 시안 생성 요청 실패");
      void refreshCreditSummary(session, setCreditSummary);
    } finally {
      setIsRemoteBusy(false);
    }
  }

  function applyLayoutJob(job: JobResponse) {
    const layout = readLayoutResult(job.result_json);
    updateDraft({
      layoutJobId: job.id,
      layoutJobStatus: job.status,
      ...(layout
        ? {
            layoutItems: layout.items,
            layoutCanvas: layout.canvas
          }
        : {})
    });
  }

  function applyStyleJob(job: JobResponse) {
    const styleResolution = readStyleResolution(job.result_json);
    updateDraft({
      styleJobId: job.id,
      styleJobStatus: job.status,
      ...(styleResolution ? { styleResolution } : {})
    });
  }

  function applyGenerationJob(job: JobResponse) {
    const generationSlots = readGenerationSlots(job.result_json);
    const candidateAssetIds = generationSlots
      .map((slot) => slot.candidateAssetId)
      .filter((assetId): assetId is string => Boolean(assetId));

    setDraft((currentDraft) => ({
      ...currentDraft,
      generationJobId: job.id,
      generationJobStatus: job.status,
      generationCreditSource: readGenerationCreditSource(job.result_json) ?? currentDraft.generationCreditSource,
      ...(generationSlots.length ? { generationSlots } : {}),
      selectedCandidateId:
        currentDraft.selectedCandidateId && candidateAssetIds.includes(currentDraft.selectedCandidateId)
          ? currentDraft.selectedCandidateId
          : ""
    }));
  }

  function handleCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateDraft({
        cover: {
          name: file.name,
          size: file.size,
          previewDataUrl: String(reader.result)
        },
        effectPlacement: null
      });
    };
    reader.readAsDataURL(file);
  }

  function handleAssetImageError(assetId: string) {
    setAssetUrls((currentUrls) => {
      if (!currentUrls[assetId]) {
        return currentUrls;
      }
      const nextUrls = { ...currentUrls };
      delete nextUrls[assetId];
      return nextUrls;
    });
  }

  async function saveCompletedWork() {
    const ownerUserId = session?.user.id ?? null;
    if (!ownerUserId) {
      setSaveState("로그인 후 완료 기록을 저장할 수 있어요");
      return;
    }

    const now = new Date().toISOString();
    const savedRecords = readCompletedRecords();
    const titleText = draft.title.trim() || "타이포 시안";
    const existingRecord = findMatchingCompletedRecord(savedRecords, draft, titleText, selectedGenre.name, ownerUserId);
    const recordId = draft.completedWorkId ?? existingRecord?.id ?? crypto.randomUUID();
    const completedDraft = normalizeDraft({
      ...draft,
      ownerUserId,
      completedWorkId: recordId,
      activeStepId: "export",
      updatedAt: now
    });
    const record = {
      id: recordId,
      title: titleText,
      genre: selectedGenre.name,
      presetId: draft.effectPresetId,
      ownerUserId,
      createdAt: existingRecord?.createdAt ?? now,
      updatedAt: now,
      draft: completedDraft
    } satisfies CompletedWorkRecord;
    try {
      const nextRecords = [
        record,
        ...savedRecords.filter((item) =>
          !isSameCompletedWork(item, completedDraft, titleText, selectedGenre.name, draft.effectPresetId, ownerUserId)
        )
      ].slice(0, 12);
      const persistedRecords = nextRecords.map(completedRecordForBrowserStorage);
      const persistedDraft = draftForBrowserStorage(completedDraft);
      if (
        !persistJsonToBrowserStorage(completedStorageKey, persistedRecords) ||
        !persistJsonToBrowserStorage(draftStorageKeyFor(ownerUserId), persistedDraft)
      ) {
        throw new Error("Browser storage quota exceeded.");
      }
      setDraft(completedDraft);
      if (session && completedDraft.projectId && completedDraft.versionId) {
        await saveDraftStateToServer(completedDraft);
      }
      setSaveState("완료됨");
    } catch {
      setSaveState("완료 기록을 저장하지 못했어요");
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="app-shell">
      <aside className="service-rail" aria-label="서비스 메뉴">
        <Link className="service-rail-brand" href="/">
          <span className="brand-mark">
            <Sparkles size={15} />
          </span>
          <span>타이포 포지</span>
        </Link>
        <div className="service-account">
          <UserRound size={16} />
          <span>{session?.user.email ?? "로그인 필요"}</span>
        </div>
        <div className="credit-stack" aria-label="크레딧">
          <div className="credit-line">
            <Gift size={15} />
            <span>무료 생성</span>
            <strong>{freeGenerationCredits ?? "확인 중"}</strong>
          </div>
          <div className="credit-line">
            <CreditCard size={15} />
            <span>유료 크레딧</span>
            <strong>{paidCredits}</strong>
          </div>
        </div>
        <nav className="service-nav" aria-label="작업 메뉴">
          <Link href="/">
            <Home size={16} />
            메인
          </Link>
          <Link href={"/works" as Route}>
            <FolderOpen size={16} />
            내 작업
          </Link>
          <Link href={"/settings" as Route}>
            <Settings size={16} />
            설정
          </Link>
        </nav>
      </aside>
      <div className="workflow-frame">
        <header className="topbar">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <Sparkles size={15} />
            </span>
            <span>
              <span className="brand-kicker">AI 웹소설 타이포</span>
              타이포 포지
            </span>
          </Link>
          <nav className="stepper" aria-label="제작 단계">
            {workflowSteps.map((step, index) => (
              <span
                aria-current={index === activeStepIndex ? "step" : undefined}
                className={`step${index === activeStepIndex ? " active" : ""}${
                  index < activeStepIndex ? " done" : ""
                }`}
                key={step.id}
              >
                <span className="step-dot">{index < activeStepIndex ? <Check size={10} /> : null}</span>
                {step.label}
              </span>
            ))}
          </nav>
          <div className="mobile-step-summary" aria-label="현재 단계">
            <span>{activeStepIndex + 1}/{workflowSteps.length}</span>
            <strong>{workflowSteps[activeStepIndex]?.label ?? "제작"}</strong>
          </div>
          <div className="account-control" aria-label="계정">
            <span className={`account-state${session ? " ready" : ""}`}>{authState}</span>
            {session ? (
              <button className="button secondary compact" onClick={signOut} type="button">
                <LogOut size={14} />
                로그아웃
              </button>
            ) : (
              <button
                className="button secondary compact"
                disabled={!isSupabaseConfigured}
                onClick={signInWithGoogle}
                type="button"
              >
                <LogIn size={14} />
                Google 로그인
              </button>
            )}
          </div>
        </header>

        <section className="workspace">
          <div className="main-panel">
            <p className="eyebrow">{stepMeta.kicker}</p>
            <h1 className="page-title">{stepMeta.title}</h1>
            <p className="lead">{stepMeta.lead}</p>

            {draft.activeStepId === "genre" ? (
              <GenreStep
                selectedGenreId={draft.selectedGenreId}
                onSelect={(selectedGenreId) => updateDraft({ selectedGenreId })}
              />
            ) : null}
            {draft.activeStepId === "cover" ? (
              <CoverStep cover={draft.cover} onChange={handleCoverChange} onClear={() => updateDraft({ cover: null, effectPlacement: null })} />
            ) : null}
            {draft.activeStepId === "title" ? (
              <TitleStep
                title={draft.title}
                onChange={(title) =>
                  updateDraft({
                    title,
                    layoutJobId: null,
                    layoutJobStatus: null,
                    layoutItems: [],
                    layoutCanvas: null,
                    styleJobId: null,
                    styleJobStatus: null,
                    styleResolution: null,
                    generationJobId: null,
                    generationJobStatus: null,
                    generationCreditSource: null,
                    generationSlots: [],
                    selectedCandidateId: "",
                    effectPlacement: null
                  })
                }
              />
            ) : null}
            {draft.activeStepId === "layout" ? (
              <LayoutStep
                actionError={remoteError}
                actionState={remoteState}
                isBusy={isRemoteBusy}
                isSignedIn={Boolean(session)}
                layoutCanvas={draft.layoutCanvas}
                layoutItems={draft.layoutItems}
                layoutJobId={draft.layoutJobId}
                layoutJobStatus={draft.layoutJobStatus}
                onLayoutItemsChange={(layoutItems) => updateDraft({ layoutItems })}
                title={draft.title}
              />
            ) : null}
            {draft.activeStepId === "style" ? (
              <StyleStep
                actionError={remoteError}
                actionState={remoteState}
                isBusy={isRemoteBusy}
                isSignedIn={Boolean(session)}
                styleJobId={draft.styleJobId}
                styleJobStatus={draft.styleJobStatus}
                stylePrompt={draft.stylePrompt}
                styleResolution={draft.styleResolution}
                onChange={(stylePrompt) => updateDraft({ stylePrompt })}
                onRequestAi={requestStyleJob}
              />
            ) : null}
            {draft.activeStepId === "generation" ? (
              <GenerationStep
                actionError={remoteError}
                actionState={remoteState}
                assetUrls={assetUrls}
                generationJobId={draft.generationJobId}
                generationJobStatus={draft.generationJobStatus}
                creditSummary={creditSummary}
                generationSlots={draft.generationSlots}
                isBusy={isRemoteBusy}
                isSignedIn={Boolean(session)}
                onAssetImageError={handleAssetImageError}
                onRequestAi={requestGenerationJob}
                onSelectCandidate={(selectedCandidateId) => updateDraft({ selectedCandidateId, effectPlacement: null })}
                selectedCandidateId={draft.selectedCandidateId}
              />
            ) : null}
            {draft.activeStepId === "effects" ? (
              <EffectsStep
                assetUrls={assetUrls}
                cover={draft.cover}
                effectParams={draft.effectParams}
                layerParams={draft.effectLayerParams}
                effectPresetId={draft.effectPresetId}
                placement={draft.effectPlacement}
                generationSlots={draft.generationSlots}
                selectedCandidateId={draft.selectedCandidateId}
                title={draft.title}
                onChangeEffectParams={(effectParams) => updateDraft({ effectParams })}
                onChangeLayerParams={(effectLayerParams) => updateDraft({ effectLayerParams })}
                onChangePreset={(effectPresetId) => updateDraft({ effectPresetId, effectParams: null, effectLayerParams: null })}
                onPlacementChange={(effectPlacement) => updateDraft({ effectPlacement })}
              />
            ) : null}
            {draft.activeStepId === "export" ? (
              <ExportStep
                assetUrls={assetUrls}
                cover={draft.cover}
                effectParams={draft.effectParams}
                layerParams={draft.effectLayerParams}
                effectPresetId={draft.effectPresetId}
                placement={draft.effectPlacement}
                generationSlots={draft.generationSlots}
                creditSource={draft.generationCreditSource ?? "free"}
                paidCredits={paidCredits}
                projectId={draft.projectId}
                session={session}
                selectedCandidateId={draft.selectedCandidateId}
                title={draft.title}
                versionId={draft.versionId}
                onCreditsChanged={() => {
                  if (session) {
                    void refreshCreditSummary(session, setCreditSummary);
                  }
                }}
                onComplete={saveCompletedWork}
              />
            ) : null}
          </div>
        </section>

        <footer className="footerbar">
          <span className="note">{saveState}</span>
          <div className="button-row">
            <button className="button secondary" disabled={!canGoBack} onClick={goBack} type="button">
              <ArrowLeft size={16} />
              이전
            </button>
            <button className="button primary" disabled={!canGoNext} onClick={goNext} type="button">
              다음
              <ArrowRight size={16} />
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}

function GenreStep({
  selectedGenreId,
  onSelect
}: {
  selectedGenreId: string;
  onSelect: (genreId: string) => void;
}) {
  return (
    <div className="genre-grid">
      {genres.map((genre) => (
        <button
          className={`genre-card${genre.id === selectedGenreId ? " selected" : ""}`}
          key={genre.id}
          onClick={() => onSelect(genre.id)}
          type="button"
        >
          <span className={`specimen genre-preview genre-preview-${genre.visualKey}`} aria-hidden="true" />
          <span className="genre-name">{genre.name}</span>
        </button>
      ))}
    </div>
  );
}

function CoverStep({
  cover,
  onChange,
  onClear
}: {
  cover: CoverDraft | null;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <div className="cover-grid">
      <label className="upload-zone">
        <input accept="image/*" className="file-input" onChange={onChange} type="file" />
        <ImageUp size={24} />
        <strong>표지 이미지 선택</strong>
        <span>업로드는 선택 사항입니다.</span>
      </label>
      <div className="cover-preview">
        {cover?.previewDataUrl ? (
          <>
            <img alt="선택한 표지 미리보기" src={cover.previewDataUrl} />
            <button className="icon-button" onClick={onClear} type="button" aria-label="표지 제거">
              <X size={16} />
            </button>
            <p>{cover.name}</p>
          </>
        ) : cover ? (
          <>
            <div className="empty-cover">
              <span className="empty-cover-visual" aria-hidden="true" />
            </div>
            <button className="icon-button" onClick={onClear} type="button" aria-label="표지 제거">
              <X size={16} />
            </button>
            <p>{cover.name}</p>
          </>
        ) : (
          <div className="empty-cover">
            <span className="empty-cover-visual" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}

function TitleStep({ title, onChange }: { title: string; onChange: (title: string) => void }) {
  return (
    <div className="input-stage">
      <label className="field-label" htmlFor="title-input">
        작품 제목
      </label>
      <input
        autoComplete="off"
        className="title-input"
        id="title-input"
        maxLength={40}
        onChange={(event) => onChange(event.target.value)}
        placeholder="예: 황녀는 오늘도 계약을 고친다"
        value={title}
      />
      <p className="field-help">한글 제목 기준으로 배치를 준비합니다.</p>
    </div>
  );
}

function LayoutStep({
  actionError,
  actionState,
  isBusy,
  isSignedIn,
  layoutCanvas,
  layoutItems,
  layoutJobId,
  layoutJobStatus,
  onLayoutItemsChange,
  title
}: {
  actionError: string | null;
  actionState: string;
  isBusy: boolean;
  isSignedIn: boolean;
  layoutCanvas: LayoutCanvas | null;
  layoutItems: LayoutItem[];
  layoutJobId: string | null;
  layoutJobStatus: string | null;
  onLayoutItemsChange: (layoutItems: LayoutItem[]) => void;
  title: string;
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const moveDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const resizeDragRef = useRef<{ pointerId: number; startFs: number; startDistance: number; center: { x: number; y: number } } | null>(null);
  const rotateDragRef = useRef<{ pointerId: number; startRotation: number; startAngle: number; center: { x: number; y: number } } | null>(null);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const previewTitle = title.trim() || "황녀의 계약";
  const titleParts = previewTitle.split(/\s+/).slice(0, 3);
  const canvas = layoutCanvas ?? defaultCanvas;
  const hasLayoutItems = layoutItems.length > 0;
  const isGeneratingLayout = Boolean(!hasLayoutItems && (isBusy || (layoutJobStatus && !terminalJobStatuses.has(layoutJobStatus))));
  const safeSelectedIndex = hasLayoutItems ? Math.min(selectedItemIndex, layoutItems.length - 1) : 0;
  const selectedItem = hasLayoutItems ? layoutItems[safeSelectedIndex] : null;

  useEffect(() => {
    const board = boardRef.current;
    if (!board) {
      return;
    }
    const updateBoardSize = () => {
      const rect = board.getBoundingClientRect();
      setBoardSize({ width: rect.width, height: rect.height });
    };
    updateBoardSize();
    const observer = new ResizeObserver(updateBoardSize);
    observer.observe(board);
    window.addEventListener("resize", updateBoardSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBoardSize);
    };
  }, []);

  function updateLayoutItem(index: number, patch: Partial<LayoutItem>) {
    onLayoutItemsChange(
      layoutItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...patch
            }
          : item
      )
    );
  }

  function nudgeLayoutItem(index: number, patch: Partial<LayoutItem>) {
    const item = layoutItems[index];
    if (!item) {
      return;
    }
    const nextFs = patch.fs === undefined ? item.fs : clamp(patch.fs, 20, 520);
    updateLayoutItem(index, {
      x: patch.x === undefined ? item.x : clamp(patch.x, 0, Math.max(0, canvas.width - nextFs)),
      y: patch.y === undefined ? item.y : clamp(patch.y, nextFs, canvas.height),
      fs: nextFs,
      rotation: patch.rotation === undefined ? item.rotation : clamp(patch.rotation, -45, 45)
    });
  }

  function handleWordPointerDown(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if ((event.target as HTMLElement).closest(".transform-handle")) {
      return;
    }
    setSelectedItemIndex(index);
    const item = layoutItems[index];
    const point = pointerToLayoutPoint(event);
    if (item && point) {
      moveDragRef.current = {
        pointerId: event.pointerId,
        offsetX: point.x - item.x,
        offsetY: point.y - (item.y - item.fs)
      };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleWordPointerMove(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    const drag = moveDragRef.current;
    if (event.buttons !== 1 || !boardRef.current || !drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const point = pointerToLayoutPoint(event);
    if (!point) {
      return;
    }
    const item = layoutItems[index];
    if (!item) {
      return;
    }
    const nextTop = clamp(point.y - drag.offsetY, 0, Math.max(0, canvas.height - item.fs));
    updateLayoutItem(index, {
      x: clamp(point.x - drag.offsetX, 0, Math.max(0, canvas.width - item.fs)),
      y: nextTop + item.fs
    });
  }

  function handleWordPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (moveDragRef.current?.pointerId === event.pointerId) {
      moveDragRef.current = null;
    }
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLSpanElement>, index: number) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedItemIndex(index);
    const item = layoutItems[index];
    if (!item) {
      return;
    }
    const point = pointerToLayoutPoint(event);
    if (!point) {
      return;
    }
    const center = { x: item.x + item.fs / 2, y: item.y - item.fs / 2 };
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeDragRef.current = {
      pointerId: event.pointerId,
      startFs: item.fs,
      center,
      startDistance: Math.max(1, Math.hypot(point.x - center.x, point.y - center.y))
    };
  }

  function handleResizePointerMove(event: ReactPointerEvent<HTMLSpanElement>, index: number) {
    const drag = resizeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const point = pointerToLayoutPoint(event);
    if (!point) {
      return;
    }
    const distance = Math.max(1, Math.hypot(point.x - drag.center.x, point.y - drag.center.y));
    const nextFs = clamp(drag.startFs * (distance / drag.startDistance), 20, 520);
    updateLayoutItem(index, {
      fs: nextFs,
      x: clamp(drag.center.x - nextFs / 2, 0, Math.max(0, canvas.width - nextFs)),
      y: clamp(drag.center.y + nextFs / 2, nextFs, canvas.height)
    });
  }

  function handleResizePointerUp(event: ReactPointerEvent<HTMLSpanElement>) {
    if (resizeDragRef.current?.pointerId === event.pointerId) {
      resizeDragRef.current = null;
    }
  }

  function handleRotatePointerDown(event: ReactPointerEvent<HTMLSpanElement>, index: number) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedItemIndex(index);
    const item = layoutItems[index];
    if (!item) {
      return;
    }
    const point = pointerToLayoutPoint(event);
    if (!point) {
      return;
    }
    const center = { x: item.x + item.fs / 2, y: item.y - item.fs / 2 };
    event.currentTarget.setPointerCapture(event.pointerId);
    rotateDragRef.current = {
      pointerId: event.pointerId,
      startRotation: item.rotation,
      center,
      startAngle: Math.atan2(point.y - center.y, point.x - center.x)
    };
  }

  function handleRotatePointerMove(event: ReactPointerEvent<HTMLSpanElement>, index: number) {
    const drag = rotateDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const point = pointerToLayoutPoint(event);
    if (!point) {
      return;
    }
    const angle = Math.atan2(point.y - drag.center.y, point.x - drag.center.x);
    nudgeLayoutItem(index, { rotation: drag.startRotation + ((angle - drag.startAngle) * 180) / Math.PI });
  }

  function handleRotatePointerUp(event: ReactPointerEvent<HTMLSpanElement>) {
    if (rotateDragRef.current?.pointerId === event.pointerId) {
      rotateDragRef.current = null;
    }
  }

  function pointerToLayoutPoint(event: ReactPointerEvent<HTMLElement>) {
    if (!boardRef.current) {
      return null;
    }
    const rect = boardRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  return (
    <div className="layout-stage">
      <div className="proof-board" ref={boardRef} aria-label="배치 편집 미리보기">
        {hasLayoutItems
          ? layoutItems.map((item, index) => {
              const previewFontSize = layoutFontSize(item.fs, canvas, boardSize);
              return (
              <button
                className={`layout-word generated-word${index === safeSelectedIndex ? " selected" : ""}`}
                key={`${item.char}-${index}`}
                onClick={() => setSelectedItemIndex(index)}
                onPointerDown={(event) => handleWordPointerDown(event, index)}
                onPointerMove={(event) => handleWordPointerMove(event, index)}
                onPointerUp={handleWordPointerUp}
                onPointerCancel={handleWordPointerUp}
                style={{
                  fontSize: `${previewFontSize}px`,
                  height: `${(item.fs / canvas.height) * 100}%`,
                  left: `${(item.x / canvas.width) * 100}%`,
                  top: `${((item.y - item.fs) / canvas.height) * 100}%`,
                  transform: `rotate(${item.rotation}deg)`,
                  width: `${(item.fs / canvas.width) * 100}%`
                }}
                type="button"
              >
                {item.char}
                <span
                  aria-hidden="true"
                  className="transform-handle rotate-handle"
                  onPointerCancel={handleRotatePointerUp}
                  onPointerDown={(event) => handleRotatePointerDown(event, index)}
                  onPointerMove={(event) => handleRotatePointerMove(event, index)}
                  onPointerUp={handleRotatePointerUp}
                />
                <span
                  aria-hidden="true"
                  className="transform-handle resize-handle"
                  onPointerCancel={handleResizePointerUp}
                  onPointerDown={(event) => handleResizePointerDown(event, index)}
                  onPointerMove={(event) => handleResizePointerMove(event, index)}
                  onPointerUp={handleResizePointerUp}
                />
              </button>
            );
            })
          : isGeneratingLayout ? (
              <div className="layout-loading">
                <Loader2 className="spin" size={22} />
                <strong>AI 배치 생성 중</strong>
                <span>{layoutJobStatus ? jobStatusText(layoutJobStatus) : actionState}</span>
              </div>
            ) : titleParts.map((part, index) => (
              <span className={`layout-word word-${index + 1}`} key={`${part}-${index}`}>
                {part}
              </span>
            ))}
        {!hasLayoutItems && !isGeneratingLayout ? <span className="selection-box" /> : null}
      </div>
      <div className="compact-controls" aria-label="배치 조절">
        <p className="control-note">{isSignedIn ? actionState : "로그인 후 배치를 생성할 수 있어요."}</p>
        {layoutJobId || layoutJobStatus ? (
          <p className="job-id">{layoutJobStatus ? jobStatusText(layoutJobStatus) : "요청됨"}</p>
        ) : null}
        {actionError ? <p className="control-error">{actionError}</p> : null}
        <ControlRow label="제목" value={previewTitle} />
        <ControlRow label="글자 수" value={hasLayoutItems ? `${layoutItems.length}개` : "생성 중"} />
        <ControlRow label="캔버스" value={`${canvas.width} x ${canvas.height}`} />
        {selectedItem ? (
          <div className="layout-edit-controls" aria-label="선택한 글자 조절">
            <ControlRow label="선택" value={selectedItem.char} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StyleStep({
  actionError,
  actionState,
  isBusy,
  isSignedIn,
  styleJobId,
  styleJobStatus,
  stylePrompt,
  styleResolution,
  onChange,
  onRequestAi
}: {
  actionError: string | null;
  actionState: string;
  isBusy: boolean;
  isSignedIn: boolean;
  styleJobId: string | null;
  styleJobStatus: string | null;
  stylePrompt: string;
  styleResolution: StyleResolution | null;
  onChange: (stylePrompt: string) => void;
  onRequestAi: () => void;
}) {
  const canRequest = isSignedIn && !isBusy && stylePrompt.trim().length > 0;

  return (
    <div className="style-stage">
      <textarea
        className="style-input"
        onChange={(event) => onChange(event.target.value)}
        placeholder="예: 보석, 달빛, 얇은 장식선, 차가운 금속감"
        value={stylePrompt}
      />
      <div className="compact-controls inline-controls" aria-label="스타일 정리">
        <button className="button ai-recommend" disabled={!canRequest} onClick={onRequestAi} type="button">
          {isBusy ? <Loader2 className="spin" size={15} /> : <Wand2 size={15} />}
          AI 스타일 정리
        </button>
        <p className="control-note">{isSignedIn ? actionState : "로그인 후 AI 스타일 정리를 사용할 수 있어요."}</p>
        {styleJobId || styleJobStatus ? (
          <p className="job-id">{styleJobStatus ? jobStatusText(styleJobStatus) : "요청됨"}</p>
        ) : null}
        {actionError ? <p className="control-error">{actionError}</p> : null}
      </div>
      <div className="result-columns">
        <ResultList title="요소" items={styleResolution?.display.elements ?? []} emptyText="정리된 요소가 여기에 표시됩니다." />
        <ResultList title="스타일" items={styleResolution?.display.style ?? []} emptyText="정리된 스타일이 여기에 표시됩니다." />
      </div>
      {styleResolution ? <p className="field-help">정리된 방향은 다음 시안 생성에 반영됩니다.</p> : null}
    </div>
  );
}

function GenerationStep({
  actionError,
  actionState,
  assetUrls,
  creditSummary,
  generationJobId,
  generationJobStatus,
  generationSlots,
  isBusy,
  isSignedIn,
  onAssetImageError,
  onRequestAi,
  onSelectCandidate,
  selectedCandidateId
}: {
  actionError: string | null;
  actionState: string;
  assetUrls: Record<string, AssetUrlEntry>;
  creditSummary: CreditSummaryResponse | null;
  generationJobId: string | null;
  generationJobStatus: string | null;
  generationSlots: GenerationSlot[];
  isBusy: boolean;
  isSignedIn: boolean;
  onAssetImageError: (assetId: string) => void;
  onRequestAi: () => void;
  onSelectCandidate: (candidateId: string) => void;
  selectedCandidateId: string;
}) {
  const slots = slotPlaceholders(generationSlots);
  const hasActiveGeneration = isActiveJobStatus(generationJobStatus) || slots.some((slot) => isActiveSlotStatus(slot.status));
  const freeRemaining = creditSummary?.free_generation_remaining ?? 0;
  const paidBalance = creditSummary?.paid_credit_balance ?? 0;
  const willUseFree = freeRemaining > 0;
  const hasEnoughPaidCredit = paidBalance >= typographyGenerationPaidCost;
  const isCreditReady = Boolean(creditSummary);
  const canSpend = willUseFree || hasEnoughPaidCredit;
  const chargeLabel = willUseFree
    ? `무료 생성 1회 사용 · 오늘 ${freeRemaining}회 남음`
    : `유료 크레딧 ${typographyGenerationPaidCost}개 필요`;
  const chargeDetail = willUseFree
    ? "무료 결과물에는 작은 워터마크와 표시 조건이 적용됩니다."
    : hasEnoughPaidCredit
      ? "유료 생성 결과물은 워터마크 없이 사용할 수 있습니다."
      : "무료 생성 횟수를 모두 사용했습니다. 유료 크레딧이 부족합니다.";

  return (
    <div className="generation-stage">
      <div className="generation-toolbar">
        <button
          className={`button ai-recommend${isBusy || hasActiveGeneration ? " spending" : ""}`}
          disabled={!isSignedIn || isBusy || hasActiveGeneration || !isCreditReady || !canSpend}
          onClick={onRequestAi}
          type="button"
        >
          {isBusy || hasActiveGeneration ? <Loader2 className="spin" size={15} /> : <Wand2 size={15} />}
          {hasActiveGeneration ? "시안 생성 중" : "3개 시안 생성"}
        </button>
        <div className={`charge-card${willUseFree ? " free" : " paid"}${!canSpend && isCreditReady ? " blocked" : ""}`}>
          <strong>{isCreditReady ? chargeLabel : "크레딧 확인 중"}</strong>
          <span>{isCreditReady ? chargeDetail : "계정의 생성 가능 횟수를 불러오고 있습니다."}</span>
        </div>
        <div className="generation-status">
          <p className="control-note">{isSignedIn ? actionState : "로그인 후 AI 시안 생성을 사용할 수 있어요."}</p>
          {generationJobId || generationJobStatus ? (
            <p className="job-id">{generationJobStatus ? jobStatusText(generationJobStatus) : "요청됨"}</p>
          ) : null}
          {actionError ? <p className="control-error">{actionError}</p> : null}
        </div>
      </div>
      {slots.map((slot) => (
        <GenerationSlotCard
          assetUrls={assetUrls}
          key={slot.slotIndex}
          isSelected={Boolean(slot.candidateAssetId && slot.candidateAssetId === selectedCandidateId)}
          slot={slot}
          onAssetImageError={onAssetImageError}
          onSelect={onSelectCandidate}
        />
      ))}
      <p className="generation-note">
        완료된 시안 중 하나를 선택하면 다음 단계로 넘어갈 수 있습니다.
      </p>
    </div>
  );
}

function GenerationSlotCard({
  assetUrls,
  isSelected,
  onAssetImageError,
  onSelect,
  slot
}: {
  assetUrls: Record<string, AssetUrlEntry>;
  isSelected: boolean;
  onAssetImageError: (assetId: string) => void;
  onSelect: (candidateId: string) => void;
  slot: GenerationSlot;
}) {
  const assetUrl = slot.candidateAssetId ? assetUrls[slot.candidateAssetId]?.url : null;
  const isActive = isActiveSlotStatus(slot.status);
  const isWaiting = slot.status === "waiting";
  return (
    <button
      className={`generation-slot status-${slot.status.replace(/[^a-z0-9_-]/gi, "-")}${isSelected ? " selected" : ""}`}
      disabled={!slot.candidateAssetId}
      onClick={() => {
        if (slot.candidateAssetId) {
          onSelect(slot.candidateAssetId);
        }
      }}
      type="button"
    >
      <span className="slot-index">{slot.slotIndex}</span>
      <div className="slot-preview">
        {assetUrl ? (
          <img
            alt={`타이포 시안 ${slot.slotIndex}`}
            onError={() => {
              if (slot.candidateAssetId) {
                onAssetImageError(slot.candidateAssetId);
              }
            }}
            src={assetUrl}
          />
        ) : isWaiting ? (
          <StatePreviewImage alt="시안 생성 전" className="candidate-idle-visual" src="/visuals/candidate-idle.png" />
        ) : isActive ? (
          <StatePreviewImage alt="시안 생성 중" className="candidate-loading-visual" src="/visuals/candidate-loading.png" />
        ) : (
          <StatePreviewImage alt="시안 생성 실패" className="candidate-failed-visual" src="/visuals/candidate-failed.png" />
        )}
      </div>
      {isActive ? <Loader2 className="slot-loader spin" size={18} /> : null}
      <strong>타이포 시안 {slot.slotIndex}</strong>
      <span>{slotStatusText(slot.status)}</span>
      {slot.candidateAssetId ? (
        <span className="candidate-asset-id">{isSelected ? "선택됨" : "선택 가능"}</span>
      ) : null}
      {slot.errorCode ? <span className="slot-error">생성에 실패했어요</span> : null}
    </button>
  );
}

function StatePreviewImage({ alt, className, src }: { alt: string; className: string; src: string }) {
  return <img alt={alt} className={`candidate-state-image ${className}`} src={src} />;
}

function ExportStep({
  assetUrls,
  cover,
  creditSource,
  effectParams,
  layerParams,
  effectPresetId,
  placement,
  generationSlots,
  paidCredits,
  projectId,
  session,
  selectedCandidateId,
  title,
  versionId,
  onCreditsChanged,
  onComplete
}: {
  assetUrls: Record<string, AssetUrlEntry>;
  cover: CoverDraft | null;
  creditSource: "free" | "paid";
  effectParams: TypoEffectParams | null;
  layerParams: TypoLayerParams | null;
  effectPresetId: string;
  placement: TypoEffectPlacement | null;
  generationSlots: GenerationSlot[];
  paidCredits: number;
  projectId: string | null;
  session: Session | null;
  selectedCandidateId: string;
  title: string;
  versionId: string | null;
  onCreditsChanged: () => void;
  onComplete: () => void;
}) {
  const selectedSlot = generationSlots.find((slot) => slot.candidateAssetId === selectedCandidateId);
  const transparentAssetId = selectedSlot?.transparentAssetId ?? selectedCandidateId;
  const selectedUrl = transparentAssetId ? assetUrls[transparentAssetId]?.url : null;
  const preset = getTypoEffectPreset(effectPresetId);
  const previewTitle = title.trim() || "타이포 시안";
  const [exportState, setExportState] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [isClaimingExport, setIsClaimingExport] = useState(false);
  const freeExport = creditSource !== "paid";
  const canClaimPaidExport = Boolean(session && projectId && versionId && paidCredits >= layerZipPaidCost);

  async function claimLayerZipExport() {
    if (!selectedUrl) {
      return;
    }
    if (!session || !projectId || !versionId) {
      setExportError("로그인 후 레이어 ZIP을 받을 수 있어요.");
      return;
    }
    if (paidCredits < layerZipPaidCost) {
      setExportError(`레이어 ZIP에는 유료 크레딧 ${layerZipPaidCost}개가 필요합니다.`);
      return;
    }
    setIsClaimingExport(true);
    setExportError(null);
    setExportState(`유료 크레딧 ${layerZipPaidCost}개 사용 중`);
    try {
      await claimExport(session, {
        projectId,
        versionId,
        exportType: "layer_zip",
        creditSource: "paid",
        paidCreditCost: layerZipPaidCost
      });
      onCreditsChanged();
      await exportTypoLayerZip({
        backgroundUrl: cover?.previewDataUrl ?? null,
        effectParams,
        imageUrl: selectedUrl,
        layerParams,
        placement,
        presetId: effectPresetId,
        filename: `${safeFilename(previewTitle)}-layers.zip`
      });
      setExportState("레이어 ZIP을 준비했습니다.");
    } catch (error) {
      setExportError(errorMessage(error));
      setExportState("");
      onCreditsChanged();
    } finally {
      setIsClaimingExport(false);
    }
  }

  return (
    <div className="export-stage">
      <div className="export-preview effect-preview">
        {selectedUrl ? (
          <TypoEffectorCanvas
            backgroundUrl={cover?.previewDataUrl ?? null}
            effectParams={effectParams}
            imageUrl={selectedUrl}
            layerParams={layerParams}
            placement={placement}
            presetId={effectPresetId}
          />
        ) : (
          <span>{previewTitle}</span>
        )}
      </div>
      <div className="compact-controls">
        <ControlRow label="선택한 시안" value={selectedSlot ? `시안 ${selectedSlot.slotIndex}` : "선택 필요"} />
        <ControlRow label="효과" value={preset.label} />
        <ControlRow label="기본 파일" value="PNG" />
        <ControlRow label="상태" value={selectedSlot ? slotStatusText(selectedSlot.status) : "대기 중"} />
        <div className={`license-callout${freeExport ? " free" : " paid"}`}>
          <strong>{freeExport ? "무료 결과물" : "유료 결과물"}</strong>
          <span>
            {freeExport
              ? "PNG에는 작은 워터마크가 포함됩니다. 작품 소개 영역에 fontasy.ai.kr 표시가 필요합니다."
              : "표시 의무 없이 사용할 수 있습니다."}
          </span>
        </div>
        <button
          className="button primary"
          disabled={!selectedUrl}
          onClick={() => {
            if (selectedUrl) {
              downloadTypoEffectPng({
                backgroundUrl: cover?.previewDataUrl ?? null,
                effectParams,
                imageUrl: selectedUrl,
                layerParams,
                placement,
                presetId: effectPresetId,
                filename: `${safeFilename(previewTitle)}.png`,
                watermark: {
                  enabled: freeExport,
                  text: "fontasy.ai.kr"
                }
              });
            }
          }}
          type="button"
        >
          PNG 내보내기
        </button>
        <button
          className="button secondary"
          disabled={!selectedUrl || !canClaimPaidExport || isClaimingExport}
          onClick={claimLayerZipExport}
          type="button"
        >
          {isClaimingExport ? <Loader2 className="spin" size={15} /> : null}
          레이어 ZIP · 유료 {layerZipPaidCost}
        </button>
        {freeExport ? (
          <p className="control-note">무료 생성본도 유료 크레딧을 사용하면 레이어 ZIP을 받을 수 있습니다.</p>
        ) : null}
        {exportState ? <p className="control-note">{exportState}</p> : null}
        {exportError ? <p className="control-error">{exportError}</p> : null}
        <button className="button primary" disabled={!selectedUrl} onClick={onComplete} type="button">
          완료
        </button>
      </div>
    </div>
  );
}

function EffectsStep({
  assetUrls,
  cover,
  effectParams,
  layerParams,
  effectPresetId,
  placement,
  generationSlots,
  selectedCandidateId,
  title,
  onChangePreset,
  onChangeEffectParams,
  onChangeLayerParams,
  onPlacementChange
}: {
  assetUrls: Record<string, AssetUrlEntry>;
  cover: CoverDraft | null;
  effectParams: TypoEffectParams | null;
  layerParams: TypoLayerParams | null;
  effectPresetId: string;
  placement: TypoEffectPlacement | null;
  generationSlots: GenerationSlot[];
  selectedCandidateId: string;
  title: string;
  onChangePreset: (presetId: string) => void;
  onChangeEffectParams: (params: TypoEffectParams) => void;
  onChangeLayerParams: (params: TypoLayerParams) => void;
  onPlacementChange: (placement: TypoEffectPlacement) => void;
}) {
  const selectedSlot = generationSlots.find((slot) => slot.candidateAssetId === selectedCandidateId);
  const transparentAssetId = selectedSlot?.transparentAssetId ?? selectedCandidateId;
  const imageUrl = transparentAssetId ? assetUrls[transparentAssetId]?.url : null;
  const previewTitle = title.trim() || "타이포 시안";

  return (
    <div className="effects-stage">
      <div className="effect-preview">
        {imageUrl ? (
          <TypoEffectorCanvas
            backgroundUrl={cover?.previewDataUrl ?? null}
            effectParams={effectParams}
            imageUrl={imageUrl}
            layerParams={layerParams}
            onPlacementChange={onPlacementChange}
            onRender={(result) => {
              if (!placement) {
                onPlacementChange(result.placement);
              }
            }}
            placement={placement}
            presetId={effectPresetId}
          />
        ) : (
          <span>{previewTitle}</span>
        )}
      </div>
      <div className="effect-side-panel">
        <div className="effect-presets" aria-label="효과 프리셋">
          {typoEffectPresets.map((preset) => (
            <button
              className={`effect-preset${preset.id === effectPresetId ? " selected" : ""}`}
              key={preset.id}
              onClick={() => onChangePreset(preset.id)}
              type="button"
            >
              <span
                className="effect-swatch"
                style={{
                  background: effectBackground(preset.id)
                }}
              />
              <strong>{preset.label}</strong>
              <span>{preset.effectName === "metal" ? "Metal" : "Gemstone"}</span>
            </button>
          ))}
        </div>
        <EffectAdvancedPanel
          effectParams={effectParams}
          layerParams={layerParams}
          presetId={effectPresetId}
          onChangeEffectParams={onChangeEffectParams}
          onChangeLayerParams={onChangeLayerParams}
        />
      </div>
    </div>
  );
}

function EffectAdvancedPanel({
  effectParams,
  layerParams,
  presetId,
  onChangeEffectParams,
  onChangeLayerParams
}: {
  effectParams: TypoEffectParams | null;
  layerParams: TypoLayerParams | null;
  presetId: string;
  onChangeEffectParams: (params: TypoEffectParams) => void;
  onChangeLayerParams: (params: TypoLayerParams) => void;
}) {
  const preset = getPresetById(presetId);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentEffectParams, setCurrentEffectParams] = useState<TypoEffectParams>(
    () => ({ ...preset.params, ...(effectParams ?? {}) }) as TypoEffectParams
  );
  const [currentLayerParams, setCurrentLayerParams] = useState<TypoLayerParams>(
    () => createDefaultTypoLayerParams(layerParams)
  );

  useEffect(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    setCurrentEffectParams({ ...preset.params, ...(effectParams ?? {}) } as TypoEffectParams);
    setCurrentLayerParams(createDefaultTypoLayerParams(layerParams));
  }, [effectParams, layerParams, preset.params]);

  useEffect(() => {
    return () => {
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
      }
    };
  }, []);

  function scheduleCommit(nextEffectParams: TypoEffectParams, nextLayerParams: TypoLayerParams) {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
    }
    commitTimerRef.current = setTimeout(() => {
      onChangeEffectParams(nextEffectParams);
      onChangeLayerParams(nextLayerParams);
      commitTimerRef.current = null;
    }, 220);
  }

  function setEffectParam(key: string, value: string | number | boolean) {
    const nextEffectParams = { ...currentEffectParams, [key]: value };
    setCurrentEffectParams(nextEffectParams);
    scheduleCommit(nextEffectParams, currentLayerParams);
  }

  function setLayerParam(key: string, value: string | number | boolean) {
    const nextLayerParams = { ...currentLayerParams, [key]: value };
    setCurrentLayerParams(nextLayerParams);
    scheduleCommit(currentEffectParams, nextLayerParams);
  }

  return (
    <details className="advanced-panel">
      <summary>세부 설정</summary>
      <div className="angle-control">
        <button
          aria-label="빛 방향"
          className="angle-dial"
          onPointerDown={(event) => handleAnglePointer(event, (angle) => setEffectParam("lightAngle", angle))}
          onPointerMove={(event) => {
            if (event.buttons === 1) {
              handleAnglePointer(event, (angle) => setEffectParam("lightAngle", angle));
            }
          }}
          style={{ "--angle": `${-Number(currentEffectParams.lightAngle ?? 0)}deg` } as CSSProperties}
          type="button"
        >
          <span />
        </button>
        <strong>{Math.round(Number(currentEffectParams.lightAngle ?? 0))}°</strong>
      </div>
      <div className="advanced-grid">
        {paramSchema
          .filter((item) => item.type !== "select")
          .map((item) => (
            <EffectField
              item={item}
              key={item.key}
              value={currentEffectParams[item.key]}
              onChange={(value) => setEffectParam(item.key, value)}
            />
          ))}
        {[
          { key: "shadowOpacity", label: "Shadow opacity", min: 0, max: 1, step: 0.01 },
          { key: "shadowBlur", label: "Shadow blur", min: 0, max: 96, step: 1 },
          { key: "glowOpacity", label: "Glow opacity", min: 0, max: 1, step: 0.01 },
          { key: "glowBlur", label: "Glow blur", min: 0, max: 120, step: 1 },
          { key: "flareOpacity", label: "Flare opacity", min: 0, max: 1, step: 0.01 },
          { key: "rayBeamOpacity", label: "Ray opacity", min: 0, max: 1, step: 0.01 }
        ].map((item) => (
          <EffectField
            item={{ ...item, type: "range" }}
            key={item.key}
            value={currentLayerParams[item.key]}
            onChange={(value) => setLayerParam(item.key, value)}
          />
        ))}
      </div>
    </details>
  );
}

function createDefaultTypoLayerParams(layerParams: TypoLayerParams | null) {
  return {
    shadowOpacity: 0.56,
    shadowBlur: 18,
    glowOpacity: 0.42,
    glowBlur: 18,
    flareOpacity: 0.18,
    rayBeamOpacity: 0.92,
    ...(layerParams ?? {})
  } as TypoLayerParams;
}

function EffectField({
  item,
  value,
  onChange
}: {
  item: { key: string; label: string; type: string; min?: number; max?: number; step?: number };
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  if (item.type === "checkbox") {
    return (
      <label className="effect-field toggle-field">
        <span>{item.label}</span>
        <input checked={Boolean(value)} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" />
      </label>
    );
  }
  return (
    <label className="effect-field">
      <span>{item.label}</span>
      <input
        max={item.max}
        min={item.min}
        onChange={(event) => onChange(item.type === "range" ? Number(event.currentTarget.value) : event.currentTarget.value)}
        step={item.step}
        type={item.type}
        value={typeof value === "boolean" ? String(value) : value ?? ""}
      />
    </label>
  );
}

function getPresetById(presetId: string) {
  for (const presets of Object.values(effectPresets)) {
    const preset = presets.find((item) => item.id === presetId);
    if (preset) {
      return preset;
    }
  }
  return effectPresets.gemstone[0];
}

function handleAnglePointer(event: ReactPointerEvent<HTMLButtonElement>, onChange: (angle: number) => void) {
  event.preventDefault();
  const rect = event.currentTarget.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const angle = Math.atan2(centerY - event.clientY, event.clientX - centerX) * (180 / Math.PI);
  onChange(Math.round(angle));
}

function ResultList({ title, items, emptyText }: { title: string; items: string[]; emptyText?: string }) {
  return (
    <div className="result-list">
      <strong>{title}</strong>
      {items.length ? (
        <div className="resolved-list">
          {items.map((item) => (
            <span className="chip" key={item}>
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p>{emptyText ?? "항목 없음"}</p>
      )}
    </div>
  );
}

function ControlRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="control-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getStepMeta(stepId: WorkflowStepId) {
  switch (stepId) {
    case "genre":
      return {
        kicker: "1단계",
        title: "작품의 장르를 먼저 골라주세요",
        lead: "선택한 장르는 처음 배치와 스타일 추천의 기준이 됩니다. 나중에 다른 방향으로 다시 시도할 수 있어요."
      };
    case "cover":
      return {
        kicker: "2단계",
        title: "표지가 있다면 함께 올려주세요",
        lead: "표지는 미리보기와 배치 참고에만 사용됩니다. 없어도 기본 배경으로 제작을 이어갈 수 있어요."
      };
    case "title":
      return {
        kicker: "3단계",
        title: "타이포로 만들 제목을 입력해주세요",
        lead: "제목이 있어야 배치 단계로 넘어갈 수 있습니다."
      };
    case "layout":
      return {
        kicker: "4단계",
        title: "AI가 제목 배치를 추천합니다",
        lead: "AI가 제목의 글자 배치를 제안합니다. 결과를 확인한 뒤 다음 단계로 넘어갈 수 있어요."
      };
    case "style":
      return {
        kicker: "5단계",
        title: "원하는 장식과 분위기를 정리합니다",
        lead: "짧게 적은 단어를 시안 생성에 사용할 요소와 스타일 방향으로 정리합니다."
      };
    case "generation":
      return {
        kicker: "6단계",
        title: "3개의 타이포 시안을 만들고 선택합니다",
        lead: "정리된 배치와 스타일을 바탕으로 시안을 만든 뒤 마음에 드는 하나를 선택하세요."
      };
    case "effects":
      return {
        kicker: "7단계",
        title: "선택한 타이포에 효과를 입힙니다",
        lead: "투명화된 타이포에 어울리는 질감과 빛 방향을 적용합니다."
      };
    case "export":
      return {
        kicker: "8단계",
        title: "선택한 시안을 내보냅니다",
        lead: "기본 PNG로 내려받기 전에 선택한 타이포를 확인합니다."
      };
  }
}

function authLabel(session: Session | null) {
  return session?.user.email ?? (session ? "로그인됨" : "로그인 필요");
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
  }

  const message = error.message.trim();
  const lowerMessage = message.toLowerCase();
  if (!message) {
    return "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
  }
  if (lowerMessage.includes("auth") || lowerMessage.includes("token") || lowerMessage.includes("unauthorized")) {
    return "로그인이 만료되었어요. 다시 로그인해주세요.";
  }
  if (
    lowerMessage.includes("supabase") ||
    lowerMessage.includes("api request") ||
    lowerMessage.includes("internal server") ||
    lowerMessage.includes("database") ||
    lowerMessage.includes("project") ||
    lowerMessage.includes("version") ||
    lowerMessage.includes("job") ||
    lowerMessage.includes("generation") ||
    lowerMessage.includes("batch") ||
    lowerMessage.includes("asset") ||
    lowerMessage.includes("storage") ||
    lowerMessage.includes("comfy") ||
    lowerMessage.includes("not created") ||
    lowerMessage.includes("input_json")
  ) {
    return "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
  }
  return message;
}

function isTerminalJobStatus(status: string) {
  return terminalJobStatuses.has(status);
}

function isSuccessfulTerminal(status: string) {
  return status === "succeeded" || status === "partially_succeeded";
}

function isActiveJobStatus(status: string | null) {
  return Boolean(status && !isTerminalJobStatus(status));
}

function isActiveSlotStatus(status: string) {
  return !["waiting", "succeeded", "comfy_failed", "download_failed", "postprocess_failed", "timed_out", "refunded"].includes(
    status
  );
}

function jobStatusText(status: string) {
  switch (status) {
    case "queued":
      return "대기 중";
    case "running":
      return "진행 중";
    case "succeeded":
      return "완료";
    case "partially_succeeded":
      return "일부 완료";
    case "failed":
      return "실패";
    case "timed_out":
      return "시간 초과";
    case "cancelled":
      return "취소됨";
    default:
      return "처리 중";
  }
}

function slotStatusText(status: string) {
  switch (status) {
    case "waiting":
      return "요청 전";
    case "queued":
      return "대기 중";
    case "uploading_input":
      return "준비 중";
    case "submitted_to_comfy":
      return "생성 준비 중";
    case "running":
      return "생성 중";
    case "image_downloaded":
      return "결과 정리 중";
    case "postprocessing":
      return "결과 정리 중";
    case "succeeded":
      return "완료";
    case "comfy_failed":
    case "download_failed":
    case "postprocess_failed":
      return "실패";
    case "timed_out":
      return "시간 초과";
    case "refunded":
      return "환불됨";
    default:
      return "처리 중";
  }
}

function jobStatusMessage(label: string, status: string) {
  return `${label} ${jobStatusText(status)}`;
}

function jobFailureMessage(job: JobResponse) {
  if (job.status === "timed_out") {
    return "생성 시간이 길어져 요청이 중단됐어요. 차감된 크레딧은 실패한 수량만큼 반환됩니다.";
  }
  return errorMessage(new Error(job.error_message || "request failed"));
}

async function pollJob(
  session: Session,
  jobId: string,
  onJob: (job: JobResponse) => void
): Promise<JobResponse | null> {
  let lastJob: JobResponse | null = null;

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const job = await getJob(session, jobId);
    lastJob = job;
    onJob(job);
    if (isTerminalJobStatus(job.status)) {
      return job;
    }
    await delay(pollDelayMs);
  }

  return lastJob;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function readLayoutResult(resultJson: Record<string, unknown>) {
  const rawItems = Array.isArray(resultJson.items) ? resultJson.items : [];
  const items = rawItems
    .map((item) => {
      const record = asRecord(item);
      if (!record || typeof record.char !== "string" || !record.char.trim()) {
        return null;
      }
      return {
        char: record.char,
        x: toNumber(record.x, 0),
        y: toNumber(record.y, 0),
        fs: toNumber(record.fs, 120),
        rotation: toNumber(record.rotation, 0)
      };
    })
    .filter((item): item is LayoutItem => Boolean(item));

  if (!items.length) {
    return null;
  }

  const rawCanvas = asRecord(resultJson.canvas);
  const canvas = {
    width: Math.max(1, toNumber(rawCanvas?.width, defaultCanvas.width)),
    height: Math.max(1, toNumber(rawCanvas?.height, defaultCanvas.height))
  };

  return { items, canvas };
}

function readStyleResolution(resultJson: Record<string, unknown>): StyleResolution | null {
  const display = asRecord(resultJson.display);
  const prompt = typeof resultJson.prompt === "string" ? resultJson.prompt : "";
  const elements = readStringList(display?.elements);
  const style = readStringList(display?.style);

  if (!prompt && !elements.length && !style.length) {
    return null;
  }

  return {
    prompt,
    display: {
      elements,
      style
    }
  };
}

function readGenerationSlots(resultJson: Record<string, unknown>) {
  const rawSlots = Array.isArray(resultJson.slots) ? resultJson.slots : [];
  return rawSlots
    .map((slot, index) => {
      const record = asRecord(slot);
      if (!record) {
        return null;
      }
      return {
        slotIndex: toNumber(record.slot_index ?? record.slotIndex, index + 1),
        status: typeof record.status === "string" ? record.status : "queued",
        candidateAssetId: readNullableString(record.candidate_asset_id ?? record.candidateAssetId),
        transparentAssetId: readNullableString(record.transparent_asset_id ?? record.transparentAssetId),
        errorCode: readNullableString(record.error_code ?? record.errorCode),
        creditRefunded: toNumber(record.credit_refunded ?? record.creditRefunded, 0)
      };
    })
    .filter((slot): slot is GenerationSlot => Boolean(slot));
}

function readGenerationCreditSource(resultJson: Record<string, unknown>) {
  return resultJson.credit_source === "paid" || resultJson.creditSource === "paid" ? "paid" : resultJson.credit_source === "free" || resultJson.creditSource === "free" ? "free" : null;
}

async function refreshCreditSummary(session: Session, onSummary: (summary: CreditSummaryResponse) => void) {
  const summary = await getCreditSummary(session);
  onSummary(summary);
  return summary;
}

function slotPlaceholders(slots: GenerationSlot[]) {
  return [1, 2, 3].map(
    (slotIndex) =>
      slots.find((slot) => slot.slotIndex === slotIndex) ?? {
        slotIndex,
        status: "waiting",
        candidateAssetId: null,
        transparentAssetId: null,
        errorCode: null,
        creditRefunded: 0
      }
  );
}

function buildStyleKeywords(stylePrompt: string) {
  const promptKeywords = stylePrompt
    .split(/[,\n/]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  return Array.from(new Set(promptKeywords));
}

function buildStyleResolutionInstructions(genreId: string, stylePrompt: string) {
  return [
    genreDirectiveForPrompt(genreId),
    "Translate user intent into short English tokens or short phrases only.",
    "Avoid sentence-like descriptions and avoid parenthetical source words.",
    "Do not expose the genre name, internal hints, Korean source text, or raw user input.",
    "The final typography generation prompt must describe only a pure black silhouette vector result before the required trailing phrase.",
    "Do not include color, texture, lighting, shadows, gradients, material effects, photorealism, or background decoration.",
    "Keep the output as solid black shapes on a plain white background.",
    stylePrompt.trim() ? "Use the user input only as intent, not as copyable output text." : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function genreDirectiveForPrompt(genreId: string) {
  switch (genreId) {
    case "romance-fantasy":
      return "Internal genre direction: refined ornamental fantasy romance mood. Do not output this label.";
    case "modern":
      return "Internal genre direction: clean contemporary commercial webnovel mood. Do not output this label.";
    case "fantasy":
      return "Internal genre direction: heroic high-fantasy adventure mood. Do not output this label.";
    case "martial-arts":
      return "Internal genre direction: restrained wuxia calligraphic mood. Do not output this label.";
    case "healing":
      return "Internal genre direction: gentle calm slice-of-life healing mood. Do not output this label.";
    default:
      return "Internal genre direction: balanced Korean webnovel title mood. Do not output this label.";
  }
}

function buildGenerationPrompt(
  styleResolution: StyleResolution | null,
  stylePrompt: string,
  selectedGenre: (typeof genres)[number]
) {
  const fallbackPrompt = `Transform this Korean title typography with ${[stylePrompt.trim(), selectedGenre.name]
    .filter(Boolean)
    .join(", ")}. Keep the original text visible.`;
  const sanitizedPrompt = styleResolution?.prompt.trim() ? sanitizeGenerationPrompt(styleResolution.prompt) : "";
  const basePrompt = sanitizedPrompt || fallbackPrompt;

  return appendRequiredGlowPhrase(`${basePrompt}

HARD OUTPUT CONSTRAINTS:
- Pure black silhouette vector typography only.
- Solid black shapes on a plain white background.
- No color, no texture, no colored lighting, no shadows, no gradients, no metallic or material effects.
- Keep the Korean title readable.`);
}

function sanitizeGenerationPrompt(prompt: string) {
  const forbiddenTerms = [
    "shadow",
    "color",
    "gradient",
    "texture",
    "metallic",
    "material effect",
    "colored background"
  ];
  const lines = prompt.split("\n");
  const cleanedLines = lines.filter((line) => {
    const lowerLine = line.toLowerCase();
    return !forbiddenTerms.some((term) => lowerLine.includes(term));
  });
  return cleanedLines.join("\n").trim();
}

function appendRequiredGlowPhrase(prompt: string) {
  const cleaned = prompt.replace(/\s*White glow around text\.\s*$/i, "").trim();
  return `${cleaned}\n\nWhite glow around text.`;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function layoutFontSize(fontSize: number, canvas: LayoutCanvas, boardSize: { width: number; height: number }) {
  const scale = boardSize.height > 0 ? boardSize.height / canvas.height : 0.32;
  return clamp(fontSize * scale, 8, 260);
}

function effectBackground(presetId: string) {
  const preset = getTypoEffectPreset(presetId);
  return `linear-gradient(135deg, ${preset.colors.highlight}, ${preset.colors.mid} 48%, ${preset.colors.shadow})`;
}

function safeFilename(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "typography";
}

function canAdvanceFromStep(draft: GuestDraft) {
  if (draft.activeStepId === "title") {
    return draft.title.trim().length > 0;
  }
  if (draft.activeStepId === "layout") {
    return draft.layoutItems.length > 0;
  }
  if (draft.activeStepId === "style") {
    return Boolean(draft.styleResolution);
  }
  if (draft.activeStepId === "generation") {
    return Boolean(
      draft.selectedCandidateId &&
        draft.generationSlots.some((slot) => slot.candidateAssetId === draft.selectedCandidateId)
    );
  }
  return true;
}
