"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, CircleHelp, CreditCard, Gift, LogOut, ShieldCheck, UserRound } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getCreditSummary, getMe, type CreditSummaryResponse, type MeResponse } from "@/lib/api-client";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(!supabase);
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [credits, setCredits] = useState<CreditSummaryResponse | null>(null);

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
    if (!session) {
      setProfile(null);
      setCredits(null);
      return;
    }
    let isCancelled = false;
    Promise.all([getMe(session), getCreditSummary(session)])
      .then(([nextProfile, nextCredits]) => {
        if (!isCancelled) {
          setProfile(nextProfile);
          setCredits(nextCredits);
        }
      })
      .catch(() => undefined);
    return () => {
      isCancelled = true;
    };
  }, [session]);

  async function signOut() {
    await supabase?.auth.signOut();
  }

  return (
    <main className="utility-page">
      <div className="utility-shell">
        <header className="utility-header">
          <Link className="button secondary" href="/">
            <ArrowLeft size={16} />
            메인
          </Link>
          <div>
            <p className="eyebrow">설정</p>
            <h1 className="page-title">계정과 이용 정보를 확인합니다</h1>
          </div>
        </header>

        <section className="settings-grid">
          <article className="settings-panel">
            <div className="settings-panel-title">
              <UserRound size={18} />
              <h2>계정</h2>
            </div>
            <dl className="info-list">
              <div>
                <dt>이메일</dt>
                <dd>{isAuthChecked ? profile?.email || session?.user.email || "로그인 필요" : "확인 중"}</dd>
              </div>
              <div>
                <dt>로그인</dt>
                <dd>{isSupabaseConfigured ? "Google" : "설정 필요"}</dd>
              </div>
            </dl>
            <button className="button secondary" disabled={!session} onClick={signOut} type="button">
              <LogOut size={16} />
              로그아웃
            </button>
          </article>

          <article className="settings-panel">
            <div className="settings-panel-title">
              <Gift size={18} />
              <h2>무료 생성</h2>
              <span className="info-trigger" tabIndex={0}>
                <CircleHelp size={15} />
                <span className="info-popover">
                  하루 3회까지 제공됩니다. 무료 결과물에는 작은 워터마크가 포함되며, 작품 소개 영역에
                  fontasy.ai.kr 표시가 필요합니다.
                </span>
              </span>
            </div>
            <dl className="info-list">
              <div>
                <dt>오늘 남은 횟수</dt>
                <dd>{credits ? `${credits.free_generation_remaining}회` : "확인 중"}</dd>
              </div>
              <div>
                <dt>제공 주기</dt>
                <dd>매일</dd>
              </div>
            </dl>
          </article>

          <article className="settings-panel">
            <div className="settings-panel-title">
              <CreditCard size={18} />
              <h2>유료 크레딧</h2>
            </div>
            <dl className="info-list">
              <div>
                <dt>잔액</dt>
                <dd>{credits ? credits.paid_credit_balance : 0}</dd>
              </div>
              <div>
                <dt>사용처</dt>
                <dd>고급 내보내기</dd>
              </div>
            </dl>
          </article>

          <article className="settings-panel wide">
            <div className="settings-panel-title">
              <ShieldCheck size={18} />
              <h2>약관과 라이선스</h2>
            </div>
            <p className="settings-copy">
              무료 결과물과 유료 결과물의 사용 조건, 보관 기간, 삭제 요청 기준을 확인할 수 있습니다.
            </p>
            <Link className="button secondary" href={"/terms" as Route}>
              이용 조건 보기
            </Link>
            <button className="button secondary" disabled type="button">
              데이터 삭제 요청
            </button>
          </article>
        </section>
      </div>
    </main>
  );
}
