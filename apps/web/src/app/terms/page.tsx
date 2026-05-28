"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function TermsPage() {
  return (
    <main className="utility-page">
      <div className="utility-shell">
        <header className="utility-header">
          <Link className="button secondary" href="/settings">
            <ArrowLeft size={16} />
            설정
          </Link>
          <div>
            <p className="eyebrow">이용 조건</p>
            <h1 className="page-title">보관과 라이선스</h1>
          </div>
        </header>

        <section className="terms-stack">
          <article className="settings-panel">
            <div className="settings-panel-title">
              <ShieldCheck size={18} />
              <h2>무료 생성 결과물</h2>
            </div>
            <p className="settings-copy">
              무료 생성 결과물은 상업적으로 사용할 수 있습니다. 단, 작품 상세 페이지 또는 독자가 쉽게
              확인할 수 있는 소개 영역에 fontasy.ai.kr에서 생성했음을 표시해야 합니다.
            </p>
            <p className="settings-copy">무료 PNG에는 작은 워터마크가 포함됩니다.</p>
          </article>

          <article className="settings-panel">
            <div className="settings-panel-title">
              <ShieldCheck size={18} />
              <h2>유료 크레딧 결과물</h2>
            </div>
            <p className="settings-copy">
              유료 크레딧으로 생성하거나 유료 내보내기를 사용한 결과물은 표시 의무 없이 사용할 수
              있습니다.
            </p>
            <p className="settings-copy">레이어 ZIP은 유료 크레딧을 사용한 내보내기로 제공됩니다.</p>
          </article>

          <article className="settings-panel">
            <div className="settings-panel-title">
              <ShieldCheck size={18} />
              <h2>보관 기간</h2>
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
                <dt>크레딧 기록</dt>
                <dd>서비스 운영에 필요한 기간</dd>
              </div>
            </dl>
          </article>

          <article className="settings-panel">
            <div className="settings-panel-title">
              <ShieldCheck size={18} />
              <h2>사용자 책임</h2>
            </div>
            <p className="settings-copy">
              사용자는 입력한 제목, 표지, 작품 정보가 제3자의 권리를 침해하지 않도록 확인해야 합니다.
              불법적 사용, 권리 침해 사용, 플랫폼 약관을 위반하는 사용은 허용되지 않습니다.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
