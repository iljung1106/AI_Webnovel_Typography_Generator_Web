"use client";

import Link from "next/link";
import { ArrowLeft, CreditCard, Gift, LogOut, ShieldCheck, UserRound } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(!supabase);

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
                <dd>{isAuthChecked ? session?.user.email ?? "로그인 필요" : "확인 중"}</dd>
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
            </div>
            <dl className="info-list">
              <div>
                <dt>오늘 남은 횟수</dt>
                <dd>3회</dd>
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
                <dd>0</dd>
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
              <h2>보관과 이용 조건</h2>
            </div>
            <dl className="info-list">
              <div>
                <dt>업로드 표지</dt>
                <dd>완료 또는 마지막 수정 후 24시간</dd>
              </div>
              <div>
                <dt>완료 결과물</dt>
                <dd>완료 후 30일</dd>
              </div>
              <div>
                <dt>무료 결과물</dt>
                <dd>표시 조건 적용</dd>
              </div>
              <div>
                <dt>유료 결과물</dt>
                <dd>표시 의무 없음</dd>
              </div>
            </dl>
            <button className="button secondary" disabled type="button">
              데이터 삭제 요청
            </button>
          </article>
        </section>
      </div>
    </main>
  );
}
