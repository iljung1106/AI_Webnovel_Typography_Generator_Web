"use client";

import Link from "next/link";
import type { Route } from "next";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, Clock3, LogIn, LogOut, PenLine, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { listProjects } from "@/lib/api-client";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import styles from "./landing-page.module.css";

type LandingPageProps = {
  createHref?: Route;
};

type WorkListItem = {
  id: string;
  title: string;
  genre: string;
  status: "draft" | "completed" | "generating";
  href: Route;
  updatedAt: string;
};

const defaultCreateHref = "/create?new=1" as Route;

export function LandingPage({ createHref = defaultCreateHref }: LandingPageProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(!supabase);
  const [works, setWorks] = useState<WorkListItem[]>([]);

  useEffect(() => {
    if (!isAuthChecked) {
      return;
    }

    if (!session) {
      setWorks([]);
      return;
    }

    const activeSession = session;
    let isCancelled = false;
    function refreshWorks() {
      listProjects(activeSession)
        .then((items) => {
          if (!isCancelled) {
            setWorks(mapRemoteWorks(items).slice(0, 6));
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setWorks([]);
          }
        });
    }

    refreshWorks();
    window.addEventListener("focus", refreshWorks);
    document.addEventListener("visibilitychange", refreshWorks);
    return () => {
      isCancelled = true;
      window.removeEventListener("focus", refreshWorks);
      document.removeEventListener("visibilitychange", refreshWorks);
    };
  }, [isAuthChecked, session]);

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
                  {work.status === "completed" ? <Sparkles size={13} /> : <Clock3 size={13} />}
                  {work.status === "completed" ? "완료" : work.status === "generating" ? "생성 중" : "작성 중"}
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

function mapRemoteWorks(items: Awaited<ReturnType<typeof listProjects>>): WorkListItem[] {
  return items.map((item) => ({
    id: `project:${item.project_id}`,
    title: item.title || "타이포 작업",
    genre: item.genre || "타이포",
    status: item.active_job_id ? "generating" : item.status === "completed" ? "completed" : "draft",
    href: item.version_id ? (`/create?projectId=${item.project_id}&versionId=${item.version_id}` as Route) : ("/create?new=1" as Route),
    updatedAt: item.updated_at ?? new Date(0).toISOString()
  }));
}
