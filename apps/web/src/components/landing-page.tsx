"use client";

import Link from "next/link";
import type { Route } from "next";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, Clock3, LogIn, LogOut, PenLine, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import styles from "./landing-page.module.css";

type LandingPageProps = {
  createHref?: Route;
};

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
};

type WorkListItem = {
  id: string;
  title: string;
  genre: string;
  status: "draft" | "completed";
  href: Route;
  updatedAt: string;
};

const genreNames: Record<string, string> = {
  "romance-fantasy": "로맨스 판타지",
  modern: "현대",
  fantasy: "판타지",
  "martial-arts": "무협",
  healing: "힐링"
};

const draftStorageKey = "typography-forge:guest-draft:v1";
const completedStorageKey = "typography-forge:completed:v1";
const defaultCreateHref = "/create?new=1" as Route;

export function LandingPage({ createHref = defaultCreateHref }: LandingPageProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(!supabase);
  const [works, setWorks] = useState<WorkListItem[]>([]);

  useEffect(() => {
    if (!isAuthChecked) {
      return;
    }

    function refreshWorks() {
      setWorks(readOwnedWorks(session?.user.id ?? null).slice(0, 6));
    }

    refreshWorks();
    window.addEventListener("focus", refreshWorks);
    document.addEventListener("visibilitychange", refreshWorks);
    return () => {
      window.removeEventListener("focus", refreshWorks);
      document.removeEventListener("visibilitychange", refreshWorks);
    };
  }, [isAuthChecked, session?.user.id]);

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

  async function signInWithGoogle() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${createHref}`
      }
    });
  }

  async function signOut() {
    await supabase?.auth.signOut();
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark} aria-hidden="true">
            <Sparkles size={15} />
          </span>
          <span>타이포 포지</span>
        </Link>
        <nav className={styles.nav} aria-label="계정과 시작">
          {session ? (
            <button className={styles.loginButton} onClick={signOut} type="button">
              <LogOut size={16} />
              로그아웃
            </button>
          ) : (
            <button className={styles.loginButton} disabled={!isSupabaseConfigured} onClick={signInWithGoogle} type="button">
              <LogIn size={16} />
              로그인
            </button>
          )}
          <Link className={styles.primaryButton} href={createHref}>
            만들러 가기
            <ArrowRight size={17} />
          </Link>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>웹소설 제목 타이포 제작</p>
          <h1 id="landing-title">작품 제목에 맞는 한글 타이포를 만듭니다</h1>
          <p className={styles.lead}>
            제목 입력부터 시안 선택, 재질 효과, 표지 위 배치, 레이어 내보내기까지 한 화면 흐름으로 이어집니다.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButtonLarge} href={createHref}>
              <PenLine size={18} />
              만들러 가기
            </Link>
          </div>
        </div>

        <div className={styles.productPanel} aria-label="작업 예시">
          <div className={styles.productCanvas} aria-hidden="true" />
        </div>
      </section>

      {isAuthChecked && works.length ? (
        <section className={styles.recentSection} aria-labelledby="recent-title">
          <div className={styles.sectionHeader}>
            <h2 id="recent-title">내 작업</h2>
            <Link href={createHref}>새로 만들기</Link>
          </div>
          <div className={styles.recentGrid}>
            {works.map((work) => (
              <Link className={styles.recentCard} href={work.href} key={work.id}>
                <span className={styles.statusPill}>
                  {work.status === "draft" ? <Clock3 size={13} /> : <Sparkles size={13} />}
                  {work.status === "draft" ? "작성 중" : "완료"}
                </span>
                <strong>{work.title}</strong>
                <span>{work.genre}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function readOwnedWorks(ownerUserId: string | null): WorkListItem[] {
  if (!ownerUserId) {
    return [];
  }

  const draft = readOwnedDraft(ownerUserId);
  const completedWorks = readOwnedCompletedWorks(ownerUserId);
  const completedItems = completedWorks.map((work) => ({
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
          status: "draft" as const,
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
      Boolean(parsed.layoutJobId) ||
      Boolean(parsed.styleJobId) ||
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
