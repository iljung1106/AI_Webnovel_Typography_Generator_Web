"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Clock3, PenLine, Sparkles } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { listProjects } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";

type WorkListItem = {
  id: string;
  title: string;
  genre: string;
  status: "draft" | "completed" | "generating";
  href: Route;
  updatedAt: string;
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
          setWorks(mapRemoteWorks(items));
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setWorks([]);
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

function mapRemoteWorks(
  items: Awaited<ReturnType<typeof listProjects>>
): WorkListItem[] {
  return items.map((item) => ({
    id: `project:${item.project_id}`,
    title: item.title,
    genre: item.genre || "타이포",
    status: item.active_job_id ? "generating" : item.status === "completed" ? "completed" : "draft",
    href: item.version_id ? (`/create?projectId=${item.project_id}&versionId=${item.version_id}` as Route) : ("/create" as Route),
    updatedAt: item.updated_at ?? new Date(0).toISOString()
  }));
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
