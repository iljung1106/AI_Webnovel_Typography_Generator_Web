"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Clock3, PenLine, Sparkles } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { listProjects } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";

type CompletedWork = {
  id: string;
  title: string;
  genre: string;
  presetId: string;
  ownerUserId?: string | null;
  createdAt: string;
  updatedAt?: string;
  draft?: DraftWork;
};

type DraftWork = {
  ownerUserId?: string | null;
  completedWorkId?: string | null;
  activeStepId?: string;
  selectedGenreId?: string;
  title?: string;
  updatedAt?: string | null;
  projectId?: string | null;
  versionId?: string | null;
  generationJobId?: string | null;
};

type WorkListItem = {
  id: string;
  title: string;
  genre: string;
  status: "draft" | "completed" | "generating";
  href: Route;
  updatedAt: string;
};

const draftStorageKey = "typography-forge:guest-draft:v1";
const completedStorageKey = "typography-forge:completed:v1";

const genreNames: Record<string, string> = {
  "romance-fantasy": "로맨스 판타지",
  modern: "현대",
  fantasy: "판타지",
  "martial-arts": "무협",
  healing: "힐링"
};

export default function WorksPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(!supabase);
  const [works, setWorks] = useState<WorkListItem[]>([]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session);
        setIsAuthChecked(true);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsAuthChecked(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthChecked) {
      return;
    }
    if (!session) {
      setWorks([]);
      return;
    }
    let isCancelled = false;
    listProjects(session)
      .then((items) => {
        if (!isCancelled) {
          setWorks(
            items.map((item) => ({
              id: `project:${item.project_id}`,
              title: item.title,
              genre: item.genre || "타이포",
              status: item.active_job_id ? "generating" : item.status === "completed" ? "completed" : "draft",
              href: item.version_id ? (`/create?projectId=${item.project_id}&versionId=${item.version_id}` as Route) : ("/create" as Route),
              updatedAt: item.updated_at ?? new Date(0).toISOString()
            }))
          );
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setWorks(readOwnedWorks(session.user.id));
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [isAuthChecked, session]);

  return (
    <main className="utility-page">
      <div className="utility-shell">
        <header className="utility-header">
          <Link className="button secondary" href="/">
            <ArrowLeft size={16} />
            메인
          </Link>
          <div>
            <p className="eyebrow">내 작업</p>
            <h1 className="page-title">저장된 작업을 이어서 엽니다</h1>
          </div>
          <Link className="button primary" href="/create?new=1">
            <PenLine size={16} />
            새로 만들기
          </Link>
        </header>

        {works.length ? (
          <section className="work-list" aria-label="작업 목록">
            {works.map((work) => (
              <Link className="work-card" href={work.href} key={work.id}>
                <span className={`status-pill ${work.status}`}>
                  {work.status === "completed" ? <Sparkles size={13} /> : <Clock3 size={13} />}
                  {work.status === "completed" ? "완료" : work.status === "generating" ? "생성 중" : "작성 중"}
                </span>
                <strong>{work.title}</strong>
                <span>{work.genre}</span>
                <time>{formatDate(work.updatedAt)}</time>
              </Link>
            ))}
          </section>
        ) : (
          <section className="empty-work-list">
            <strong>{session ? "저장된 작업이 없습니다" : "로그인 후 확인할 수 있습니다"}</strong>
            <Link className="button primary" href="/create?new=1">
              <PenLine size={16} />
              새로 만들기
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}

function readOwnedWorks(ownerUserId: string | null): WorkListItem[] {
  if (!ownerUserId) {
    return [];
  }

  const draft = readOwnedDraft(ownerUserId);
  const completedItems = readOwnedCompletedWorks(ownerUserId).map((work) => ({
    id: `completed:${work.id}`,
    title: work.title || "타이포 시안",
    genre: work.genre || genreNames[work.draft?.selectedGenreId ?? ""] || "타이포",
    status: "completed" as const,
    href: `/create?workId=${encodeURIComponent(work.id)}` as Route,
    updatedAt: work.updatedAt ?? work.createdAt ?? new Date(0).toISOString()
  }));

  const draftItem =
    draft && !draft.completedWorkId
      ? {
          id: "draft:active",
          title: draft.title?.trim() || "새 타이포 작업",
          genre: genreNames[draft.selectedGenreId ?? ""] ?? "타이포",
          status: draft.generationJobId ? ("generating" as const) : ("draft" as const),
          href: "/create" as Route,
          updatedAt: draft.updatedAt ?? new Date(0).toISOString()
        }
      : null;

  return [draftItem, ...completedItems]
    .filter((item): item is WorkListItem => Boolean(item))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function readOwnedDraft(ownerUserId: string): DraftWork | null {
  try {
    const saved = window.localStorage.getItem(`${draftStorageKey}:${ownerUserId}`);
    const parsed = saved ? JSON.parse(saved) : null;
    if (!parsed || typeof parsed !== "object" || parsed.ownerUserId !== ownerUserId) {
      return null;
    }
    const hasWork =
      Boolean(String(parsed.title ?? "").trim()) ||
      Boolean(parsed.projectId) ||
      Boolean(parsed.versionId) ||
      Boolean(parsed.generationJobId);
    return hasWork ? (parsed as DraftWork) : null;
  } catch {
    return null;
  }
}

function readOwnedCompletedWorks(ownerUserId: string): CompletedWork[] {
  try {
    const saved = window.localStorage.getItem(completedStorageKey);
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is CompletedWork => Boolean(item?.id) && item.ownerUserId === ownerUserId);
  } catch {
    return [];
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
