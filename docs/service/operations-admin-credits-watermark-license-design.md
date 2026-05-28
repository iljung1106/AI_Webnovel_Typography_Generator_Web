# 운영, 관리자, 크레딧, 워터마크, 라이선스 설계

## 목적

이 문서는 Fontasy를 실제 서비스로 운영하기 위해 필요한 큰 설계를 정의한다.

범위는 다음과 같다.

- 관리자 권한과 사용자 관리
- 관리자 지정 메인/작업 화면 이미지
- SVG 형태의 임시 대기 이미지 제거와 실제 이미지 자산 관리
- 무료 크레딧과 유료 크레딧
- 워터마크 적용 기준
- 기본 PNG와 레이어 ZIP 내보내기 제한
- 무료/유료 결과물 라이선스
- 작업 상태 머신
- 오류와 환불 처리
- 설정 페이지와 내 작업 목록
- 작업물 보관과 삭제
- 로그, rate limit, 운영 추적
- 모든 사용자 노출 문구에서 지켜야 할 문구 원칙

이 문서는 제품과 기술 구현을 위한 설계 문서다. 라이선스, 책임 제한, 결제 약관, 개인정보 처리 문구는 실제 유료 서비스 전 법률 검토가 필요하다.

## 제품 원칙

Fontasy는 웹소설 제목 타이포그래피 제작 도구다. 사용자는 서비스를 설명하는 문서를 보러 온 것이 아니라, 타이포그래피를 만들러 온다.

따라서 사용자에게 노출되는 모든 화면은 완성된 서비스처럼 작동해야 한다. 프로토타입, 내부 구현, 설계 의도, 프롬프트 전략, 데이터 구조, 임시 처리, 개발 편의 문구를 화면에 드러내지 않는다.

## 사용자 노출 문구 원칙

랜딩 페이지, 작업 화면, 관리자 화면, 크레딧 안내, 워터마크 안내, 라이선스 안내, 오류 메시지, 도움말에는 메타 서술을 넣지 않는다.

금지되는 문구의 방향:

- 화면의 존재 이유를 설명하는 문구
- 내부 구현 방식을 설명하는 문구
- 프롬프트나 모델 처리 방식을 드러내는 문구
- 임시 구현, MVP, 플레이스홀더, 테스트 상태를 드러내는 문구
- 디자인 의도나 UX 의도를 직접 설명하는 문구
- 법률 문구가 아직 초안이라는 사실을 사용자에게 노출하는 문구

예시:

- 금지: "이 화면은 사용자가 쉽게 이해하도록 만든 단계형 UX입니다."
- 금지: "장르 정보는 내부 프롬프트 메타데이터로 사용됩니다."
- 금지: "이 이미지는 임시 플레이스홀더입니다."
- 금지: "현재 MVP에서는 일부 기능이 제한됩니다."
- 금지: "이 라이선스는 추후 법률 검토가 필요합니다."

허용되는 문구의 방향:

- 사용자가 지금 할 수 있는 행동
- 해당 행동으로 발생하는 결과
- 결제, 크레딧, 라이선스, 워터마크에 대한 명확한 조건
- 업로드 파일의 사용 범위
- 실패했을 때 다시 시도할 수 있는 방법

예시:

- 허용: "3개의 타이포 시안을 생성합니다."
- 허용: "무료 생성 결과에는 작은 워터마크가 포함됩니다."
- 허용: "유료 크레딧으로 만든 결과물은 표시 의무 없이 사용할 수 있습니다."
- 허용: "표지는 미리보기와 배치 분석에만 사용됩니다."

이 원칙은 라이선스 문구에도 적용된다. 라이선스는 법적으로 명확해야 하지만, 제품 내부 사정이나 개발 상태를 설명하지 않는다.

## 전체 아키텍처

서비스 권한은 서버와 데이터베이스가 가진다.

- Next.js 웹앱: 화면, 사용자 조작, 미리보기, 브라우저 기반 합성, 다운로드 UI
- FastAPI 서버: 인증 확인, 프로젝트 생성, 크레딧 차감, 관리자 권한, 라이선스 상태, 내보내기 권한
- Python Worker: AI 생성 요청, 이미지 후처리, 투명화, 워터마크 합성, 효과 렌더 결과 업로드, 실패 환불
- Supabase: Auth, Postgres, Storage, RLS, signed URL
- Comfy Cloud: 실제 타이포그래피 이미지 생성
- OpenRouter: 스타일 정리와 프롬프트 생성

신뢰할 수 있는 처리는 프론트엔드 상태에 의존하지 않는다.

- 크레딧 차감은 API 또는 DB 트랜잭션에서 처리한다.
- 무료/유료 생성 여부는 작업 레코드에 저장한다.
- 워터마크 적용 여부는 생성 결과와 함께 저장한다.
- 무료 결과물은 사용자가 접근 가능한 파일로 저장되기 전에 워터마크가 들어간다.
- 라이선스 종류는 내보내기 시점에 확정해 저장한다.

## 상시 서비스 바

작업 화면에는 왼쪽에 상시 고정되는 서비스 바를 둔다.

목적:

- 현재 로그인 계정 확인
- 무료 생성 가능 횟수 확인
- 유료 크레딧 잔액 확인
- 설정 페이지 접근
- 메인 화면 또는 내 작업 목록으로 이동
- 생성/내보내기 조건을 사용자가 작업 중에도 놓치지 않게 유지

표시 항목:

- 서비스 로고 또는 짧은 서비스명
- 현재 로그인 이메일
- 무료 생성 잔여 횟수
- 유료 크레딧 잔액
- 내 작업
- 설정
- 로그아웃

왼쪽 바는 작업 자체를 방해하지 않아야 한다. 작업 단계의 핵심 조작은 기존 중앙 작업 영역에 남기고, 왼쪽 바는 계정/잔액/이동만 담당한다.

모바일 또는 좁은 화면에서는 접히는 바 형태로 전환한다. 단, PC 웹앱을 우선으로 하므로 데스크톱에서는 항상 보이는 구조를 기본으로 한다.

## 모바일 UX 대응

모바일에서도 제작 흐름이 끝까지 작동해야 한다. 모바일은 데스크톱 화면을 단순히 축소한 형태가 아니라, 좁은 화면에 맞춘 별도 정보 구조를 사용한다.

우선순위:

- 현재 단계 확인
- 핵심 작업 영역 확인
- 다음/이전 이동
- 생성, 효과 적용, 내보내기 같은 주요 액션
- 로그인 계정과 크레딧 확인

### 상단 단계 표시

현재 단계 표시가 장르, 표지, 제목, 배치, 스타일, 생성, 효과, 내보내기 전체를 한 줄에 보여주면 모바일에서 잘린다.

모바일에서는 다음 구조를 사용한다.

- 상단에는 현재 단계와 진행 수만 표시한다.
- 예시: `4/8 배치`
- 전체 단계 목록은 펼침 버튼이나 하단 시트에서 확인한다.
- 완료된 단계 이동은 목록을 열었을 때만 가능하게 한다.
- 단계 라벨은 줄바꿈으로 높이를 늘리지 않는다.
- 가로 스크롤 체크박스 나열을 기본 구조로 쓰지 않는다.

데스크톱에서는 기존처럼 전체 단계를 한눈에 보여줘도 된다. 모바일에서는 전체 단계를 항상 노출하는 것보다 현재 위치와 다음 행동을 분명히 보여주는 것이 우선이다.

### 왼쪽 서비스 바의 모바일 처리

데스크톱의 왼쪽 상시 서비스 바는 모바일에서 그대로 유지하지 않는다.

모바일 구조:

- 상단 또는 하단에 계정 버튼을 둔다.
- 계정 버튼을 누르면 계정/크레딧/설정 메뉴가 열린다.
- 무료 생성 잔여 횟수와 유료 크레딧은 계정 메뉴 안에서 따로 표시한다.
- 생성이나 내보내기처럼 크레딧이 필요한 순간에는 해당 화면 안에서도 잔액을 다시 보여준다.

모바일에서 서비스 바가 작업 화면의 폭을 빼앗거나, 캔버스와 편집 패널을 가리면 안 된다.

### 효과 화면

효과 화면에서는 타이포와 표지가 보이는 미리보기 영역이 가장 중요하다. 템플릿과 세부 설정이 미리보기 위를 가리면 안 된다.

모바일 구조:

- 미리보기는 화면 상단에 고정된 주요 영역으로 둔다.
- 프리셋 목록은 미리보기 아래에 가로 스크롤 카드 또는 접히는 섹션으로 둔다.
- 세부 설정은 기본 접힘 상태의 패널로 둔다.
- 세부 설정을 열면 미리보기를 덮지 않고, 아래쪽에서 별도 영역으로 나타난다.
- 빛 방향 조절, 슬라이더, 색상 조절은 터치하기 충분한 높이를 가진다.
- 긴 설정 목록은 화면 전체 스크롤 안에서 자연스럽게 내려가야 한다.
- 하단 이전/다음 버튼이 세부 설정의 마지막 항목을 가리지 않도록 하단 여백을 둔다.

효과 편집 중에는 미리보기와 설정이 서로 경쟁하지 않아야 한다. 사용자는 먼저 결과를 보고, 필요할 때 설정을 열어 조정하는 흐름이어야 한다.

### 내보내기 화면

내보내기 화면에서는 PNG 내보내기, 레이어 ZIP, 완료 버튼이 모두 보여야 한다.

모바일 구조:

- 미리보기는 위에 둔다.
- 선택한 시안, 효과, 파일 형식, 상태 정보는 미리보기 아래에 카드가 아닌 간단한 목록으로 둔다.
- PNG 내보내기, 레이어 ZIP, 완료 버튼은 세로로 쌓는다.
- 버튼은 화면 하단 고정 영역에 넣지 않는 것을 기본으로 한다.
- 하단 고정 버튼을 사용할 경우, 본문 하단에 충분한 `safe-area` 여백을 둔다.
- 레이어 ZIP처럼 유료 크레딧이 필요한 액션은 버튼 근처에 필요한 크레딧을 표시한다.

모바일에서 내보내기 옵션이 화면 밖으로 밀려 보이지 않는 상태는 실패로 본다.

### 모바일 레이아웃 기준

반응형 기준:

- 1080px 이하: 데스크톱 2열 편집 화면을 좁은 데스크톱/태블릿 구조로 정리
- 780px 이하: 모바일 전용 흐름 적용
- 420px 이하: 작은 모바일 기준으로 버튼, 라벨, 패널 높이 재검증

모바일 구현 원칙:

- `height: 100vh` 안에 모든 것을 억지로 넣지 않는다.
- 본문은 세로 스크롤 가능해야 한다.
- 고정 하단 버튼이 있을 경우 콘텐츠가 버튼 뒤에 숨지 않게 한다.
- 캔버스, 프리셋, 세부 설정, 내보내기 옵션은 서로 겹치지 않는다.
- 텍스트는 버튼과 패널 안에서 잘리지 않는다.
- 터치 대상은 최소 44px 높이를 확보한다.

## 관리자 설계

### 관리자 권한

Supabase Auth를 인증 기반으로 사용하되, 관리자 여부는 별도 테이블에서 판단한다.

권장 테이블: `admin_users`

- `user_id uuid primary key`
- `role text not null`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `created_by uuid`

권한:

- `owner`: 모든 관리자 기능
- `operator`: 사용자 조회, 작업 조회, 이미지 관리, 수동 크레딧 조정
- `viewer`: 조회 전용

관리자 판정은 FastAPI에서 수행한다. 프론트엔드에서 관리자 메뉴를 숨길 수는 있지만, 실제 권한 검사는 API가 담당한다.

### 관리자 화면

MVP에서 추가할 관리자 페이지:

- `/admin`: 운영 개요
- `/admin/users`: 사용자 검색, 잔액, 최근 작업 확인
- `/admin/credits`: 수동 크레딧 지급/차감
- `/admin/jobs`: 생성 작업 상태, 실패 사유, 재시도 가능 여부 확인
- `/admin/visuals`: 메인 화면과 작업 화면 이미지 관리
- `/admin/licenses`: 라이선스 정책 버전 확인

관리자 화면은 운영 도구로 만든다. 홍보 문구나 제품 설명 문구를 넣지 않는다.

### 관리자 API

FastAPI에 `/admin` 하위 라우트를 추가한다.

권장 API:

- `GET /admin/me`
- `GET /admin/users?email=...`
- `GET /admin/users/{user_id}`
- `GET /admin/users/{user_id}/credits`
- `POST /admin/users/{user_id}/credits/adjust`
- `GET /admin/jobs`
- `GET /admin/jobs/{job_id}`
- `POST /admin/jobs/{job_id}/retry`
- `GET /admin/visuals`
- `POST /admin/visuals`
- `PATCH /admin/visuals/{visual_id}`
- `DELETE /admin/visuals/{visual_id}`
- `POST /admin/users/{user_id}/role`
- `POST /admin/users/{user_id}/delete-request/resolve`

관리자 쓰기 작업은 모두 감사 로그를 남긴다.

권장 테이블: `admin_audit_log`

- `id uuid primary key`
- `admin_user_id uuid not null`
- `action text not null`
- `target_type text not null`
- `target_id uuid`
- `payload_json jsonb not null default '{}'`
- `created_at timestamptz not null default now()`

### 최초 관리자 설정

첫 관리자 계정은 UI에서 만들지 않는다. Supabase SQL Editor에서 직접 `admin_users`에 owner를 삽입한다.

초기 설정 절차:

1. Google 로그인으로 실제 운영자 계정을 한 번 생성한다.
2. Supabase `auth.users`에서 해당 계정의 `id`를 확인한다.
3. `admin_users`에 `role = owner`, `is_active = true`로 삽입한다.
4. 이후 관리자 추가와 권한 변경은 owner만 수행한다.

권한 규칙:

- owner만 다른 admin을 추가하거나 비활성화할 수 있다.
- owner는 최소 1명 이상 남아야 한다.
- operator는 사용자 조회, 작업 조회, 이미지 관리, 수동 크레딧 조정까지만 가능하다.
- viewer는 조회만 가능하다.
- 모든 관리자 권한 변경은 `admin_audit_log`에 남긴다.

필수 서버 검증:

- `/admin/*` API는 매 요청마다 Supabase access token의 user id를 확인한다.
- 해당 user id가 `admin_users.is_active = true`인지 확인한다.
- 요청 action이 role 권한에 포함되는지 확인한다.

## 관리자 지정 이미지

### 목표

메인 화면과 작업 화면에는 실제 서비스 이미지가 보여야 한다. 임시 SVG, 의미 없는 도형, 텍스트 박스형 대기 이미지는 사용하지 않는다.

관리자가 이미지를 교체할 수 있게 하여, 배포 없이 랜딩 이미지와 샘플 이미지를 갱신할 수 있게 한다.

### 이미지 테이블

권장 테이블: `site_visuals`

- `id uuid primary key`
- `kind text not null`
- `title text not null`
- `storage_bucket text not null`
- `storage_path text not null`
- `alt_text text not null`
- `sort_order int not null default 0`
- `weight int not null default 1`
- `is_active boolean not null default true`
- `created_by uuid`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

권장 `kind`:

- `landing_hero`
- `landing_sample`
- `genre_romance_fantasy`
- `genre_modern`
- `genre_fantasy`
- `genre_wuxia`
- `genre_healing`
- `workflow_cover_empty`
- `workflow_layout_loading`
- `workflow_generation_loading`
- `workflow_candidate_loading`

### 메인 화면 이미지 동작

메인 화면은 API에서 활성 이미지를 가져온다.

- 페이지 로드 시 활성 이미지 중 일부를 무작위로 선택한다.
- 선택된 이미지는 정해진 순서로 넘어간다.
- 전환은 조용하고 안정적으로 처리한다.
- API 실패 시 번들된 기본 이미지를 사용한다.

메인 화면 이미지는 광고 배너처럼 튀지 않아야 한다. 서비스가 어떤 결과물을 만드는지 즉시 보여주는 역할에 집중한다.

### 대기 이미지

대기 이미지는 실제 이미지 자산으로 교체한다.

원칙:

- 이미지 자체는 정적인 PNG로 둔다.
- 움직임은 CSS로 처리한다.
- 좌우로 이미지가 이동하는 방식은 사용하지 않는다.
- 로딩 중, 시안 생성 중, 후보 대기 중이라는 상태가 명확히 보여야 한다.
- 의미 없는 도형 조합이나 가짜 UI 스크린샷을 쓰지 않는다.

이미지 생성 및 반영 절차:

1. 이미지 생성 도구로 PNG 자산을 만든다.
2. 생성 결과를 직접 확인한다.
3. 깨진 글자, 불필요한 텍스트, 워터마크, 어색한 아티팩트, 장르와 맞지 않는 이미지는 폐기한다.
4. 승인한 이미지는 `apps/web/public/visuals`에 기본 자산으로 저장하거나 Supabase Storage에 업로드한다.
5. 이미지 참조는 확인이 끝난 뒤 교체한다.

### 생성 전/생성 중/생성 후 상태 구분

시안 생성 화면은 생성 전과 생성 중이 명확히 달라야 한다.

생성 전:

- 슬롯은 움직이지 않는다.
- "요청 전" 상태가 분명해야 한다.
- 생성 중처럼 보이는 스피너, 흔들림, 진행 애니메이션을 사용하지 않는다.
- 사용자는 아직 비용이나 무료 횟수가 차감되지 않았음을 알 수 있어야 한다.

생성 중:

- 슬롯별 진행 상태가 보인다.
- CSS 애니메이션은 상태를 표현하는 정도로만 사용한다.
- 이미지가 좌우로 이동하는 방식은 사용하지 않는다.
- 생성 중인 슬롯과 완료된 슬롯이 구분되어야 한다.
- 완료된 시안이 있어도 전체 작업이 끝나기 전에는 사용자가 상태를 오해하지 않게 표시한다.

생성 후:

- 성공한 시안은 선택 가능하다.
- 실패한 시안은 실패 상태와 환불/복구 여부를 표시한다.
- 선택한 시안은 다음 단계로 이어질 수 있어야 한다.

## 크레딧 시스템

### 크레딧 종류

크레딧은 무료 생성 크레딧과 유료 크레딧으로 나눈다.

`free_generation_credit`

- 매일 지급된다.
- 하루 최대 3회 타이포그래피 생성에 사용할 수 있다.
- 3개 시안 생성에만 사용할 수 있다.
- 레이어 ZIP 내보내기에는 사용할 수 없다.
- 무료 표시 조건이 있는 라이선스가 적용된다.
- 생성 결과와 최종 PNG에는 워터마크가 포함된다.

`paid_credit`

- 구매 또는 관리자 조정으로 지급된다.
- 타이포그래피 생성에 사용할 수 있다.
- 고급 내보내기와 레이어 ZIP에 사용할 수 있다.
- 표시 의무가 없는 유료 라이선스가 적용된다.
- 워터마크 없는 결과물을 만들 수 있다.

### 일일 무료 지급

권장 정책:

- 사용자당 하루 3회 생성 가능
- 기준 시간대는 `Asia/Seoul`
- 매일 별도 지급 레코드를 만들기보다 일일 사용량 테이블로 관리한다.

권장 테이블: `daily_free_credit_usage`

- `user_id uuid not null`
- `usage_date date not null`
- `generation_batches_used int not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- primary key: `(user_id, usage_date)`

무료 생성 요청 시:

1. 로그인 사용자를 확인한다.
2. 오늘 사용량을 잠근다.
3. 3회 미만이면 사용량을 1 증가시킨다.
4. 작업 레코드에 `credit_source = free`를 저장한다.
5. 작업 실패 시 사용량을 되돌리거나 환불 레코드를 남긴다.

### 유료 크레딧 원장

기존 크레딧 구조가 있다면 확장하고, 없다면 원장 방식으로 구현한다.

권장 테이블: `credit_ledger`

- `id uuid primary key`
- `user_id uuid not null`
- `credit_type text not null`
- `amount int not null`
- `reason text not null`
- `reference_type text`
- `reference_id uuid`
- `memo text`
- `created_at timestamptz not null default now()`

잔액은 원장 합계로 계산하거나, 별도 balance 테이블을 두고 트랜잭션으로 갱신한다.

유료 결제 연동 전에는 관리자 지급으로 테스트할 수 있다. 결제 도입 후에는 결제 성공 웹훅에서 유료 크레딧을 지급한다.

## 생성 과금

기본 생성은 3개 시안 단위로 처리한다.

생성 요청에는 다음 중 하나가 붙는다.

- `free`: 무료 일일 생성 사용
- `paid`: 유료 크레딧 사용

생성 중 일부만 성공한 경우:

- 성공한 시안 수와 실패한 시안 수를 기록한다.
- 유료 크레딧은 실패 비율에 맞춰 환불한다.
- 무료 생성은 정책상 "1회 사용"으로 처리할지, 전체 실패일 때만 복구할지 별도 결정한다.

권장 기본값:

- 3개 중 1개 이상 성공하면 무료 생성 1회 사용 처리
- 3개 모두 실패하면 무료 생성 1회 복구
- 유료 생성은 실패한 시안 수에 비례해 유료 크레딧 환불

### 중복 생성 방지

시안 생성 요청이 진행 중일 때에는 같은 프로젝트/버전에서 다시 시안 생성을 누를 수 없어야 한다.

잠금 기준:

- `jobs.status`가 `queued` 또는 `running`
- `generation_batches.status`가 `queued` 또는 `running`
- 프론트엔드 요청 직후 API 응답을 기다리는 상태

프론트엔드는 생성 버튼을 비활성화하고 진행 상태를 보여준다. 서버는 같은 프로젝트 버전에 활성 생성 작업이 있을 경우 새 작업 생성을 거부하거나 기존 작업을 반환한다.

권장 API 동작:

- 활성 작업이 없으면 새 `typography_generation` job 생성
- 활성 작업이 있으면 기존 job 정보 반환
- 이미 완료된 작업이 있고 사용자가 새 시안을 원하면 명시적인 "다시 생성" 액션으로 새 작업 생성

이 처리는 프론트엔드 버튼 비활성화만으로 끝내지 않는다. API와 DB 수준에서 중복 차감을 막아야 한다.

### 생성 상태 복구

사용자가 생성 중에 페이지를 닫거나 새로고침해도 진행 상태를 다시 볼 수 있어야 한다.

복구 기준:

- 현재 프로젝트/버전의 활성 `typography_generation` job
- 해당 job의 `generation_batch`
- 해당 batch의 `generation_slots`

복구 동작:

- 페이지 진입 시 현재 프로젝트/버전에 활성 생성 작업이 있는지 조회한다.
- 활성 작업이 있으면 생성 화면에 진행 상태를 표시한다.
- 활성 작업이 있으면 생성 버튼은 비활성화한다.
- terminal 상태가 될 때까지 폴링을 재개한다.
- 완료된 슬롯의 signed URL을 다시 발급받아 표시한다.
- 실패 또는 시간 초과 상태도 복구해서 사용자에게 보여준다.

현재 구현에는 draft에 저장된 `generationJobId`를 기반으로 다시 조회하는 경로가 있으나, 서비스 요구사항으로는 서버 기준 활성 작업 조회와 폴링 재개가 필요하다. 로컬 저장소에 job id가 남아 있지 않아도, 로그인한 사용자의 현재 프로젝트/버전 기준으로 복구되어야 한다.

## 작업 상태 머신

작업 상태는 UI 편의를 위해 임의로 추측하지 않는다. API와 Worker가 저장한 상태를 기준으로 화면과 버튼을 결정한다.

### 공통 상태

공통 terminal 상태:

- `succeeded`
- `partially_succeeded`
- `failed`
- `timed_out`
- `cancelled`

terminal 상태가 된 레코드는 다시 `queued` 또는 `running`으로 돌아가지 않는다. 재시도나 다시 생성은 새 job 또는 새 batch를 만든다.

### project 상태

`projects.status`:

- `draft`: 작성 중
- `active`: 생성 또는 편집 가능
- `completed`: 완료된 작업이 있음
- `archived`: 보관 기간 만료 또는 사용자가 숨김
- `deleted`: 사용자 또는 운영 정책에 의해 삭제 처리

전이:

- `draft -> active`: 원격 프로젝트가 생성되고 최소 제목 또는 장르가 저장됨
- `active -> completed`: 내보내기 완료 또는 완료 버튼 클릭
- `active/completed -> archived`: 보관 기간 만료 또는 사용자 보관 처리
- `draft/active/completed/archived -> deleted`: 사용자 삭제 요청 또는 보관 정책 삭제

### project_version 상태

`project_versions.status`:

- `draft`: 현재 편집 중
- `generating`: 생성 job이 활성 상태
- `generated`: 선택 가능한 시안이 있음
- `effect_editing`: 효과 편집 중
- `exported`: 최소 1개 내보내기 완료
- `failed`: 진행 가능한 결과 없이 실패

전이:

- `draft -> generating`: typography_generation job 생성
- `generating -> generated`: 1개 이상 시안 성공
- `generating -> failed`: 모든 시안 실패
- `generated -> effect_editing`: 시안 선택 후 효과 단계 진입
- `effect_editing -> exported`: PNG 또는 ZIP 내보내기 완료

새 시안 생성을 명시적으로 다시 요청하면 기존 version을 덮어쓰지 않고 새 `generation_batch`를 만든다. 제목/장르/표지 같은 입력 자체가 바뀐 경우에는 새 version을 만드는 것을 기본으로 한다.

### job 상태

`jobs.status`:

- `queued`: Worker 대기
- `running`: Worker 처리 중
- `succeeded`: 전체 성공
- `partially_succeeded`: 일부 성공
- `failed`: 전체 실패
- `timed_out`: 제한 시간 초과
- `cancelled`: 취소

필수 필드:

- `started_at timestamptz`
- `completed_at timestamptz`
- `error_code text`
- `error_message text`
- `retry_of uuid`
- `idempotency_key text`

`idempotency_key`는 같은 프로젝트/버전에서 같은 요청이 중복 생성되는 것을 막기 위해 사용한다.

### generation_batch 상태

`generation_batches.status`:

- `queued`
- `running`
- `succeeded`
- `partially_succeeded`
- `failed`
- `timed_out`
- `refunded`

필수 필드:

- `credit_source text not null`
- `free_usage_date date`
- `paid_credit_spent int not null default 0`
- `paid_credit_refunded int not null default 0`
- `sample_count int not null default 3`
- `succeeded_count int not null default 0`
- `failed_count int not null default 0`

### generation_slot 상태

`generation_slots.status`:

- `waiting`: 아직 요청 전
- `queued`: batch 안에서 생성 대기
- `uploading_input`: 입력 이미지 준비
- `submitted_to_comfy`: Comfy Cloud 요청 완료
- `running`: Comfy Cloud 처리 중
- `image_downloaded`: 원본 후보 다운로드 완료
- `postprocessing`: 투명화/워터마크/저장 처리 중
- `succeeded`: 사용 가능한 후보 저장 완료
- `comfy_failed`: Comfy Cloud 생성 실패
- `download_failed`: 결과 다운로드 실패
- `postprocess_failed`: 투명화 또는 저장 실패
- `timed_out`: 제한 시간 초과
- `refunded`: 실패분 환불 처리 완료

성공 slot은 다음 asset을 가질 수 있다.

- `candidate_asset_id`: 사용자에게 보이는 시안 이미지
- `transparent_asset_id`: 투명 배경 타이포
- `watermarked_asset_id`: 무료 시안 워터마크 버전

무료 생성의 경우 사용자가 접근하는 candidate asset은 워터마크가 합성된 버전이어야 한다.

### export_request 상태

내보내기는 생성 결과와 별도 상태를 가진다.

`export_requests.status`:

- `queued`
- `running`
- `succeeded`
- `failed`
- `timed_out`
- `refunded`

`export_requests.export_type`:

- `final_png`
- `transparent_png`
- `layer_zip`
- `watermark_removed_png`

필수 필드:

- `user_id uuid not null`
- `project_id uuid not null`
- `version_id uuid not null`
- `generation_slot_id uuid`
- `export_type text not null`
- `credit_source text not null`
- `paid_credit_spent int not null default 0`
- `paid_credit_refunded int not null default 0`
- `license_type text not null`
- `watermark_applied boolean not null`
- `asset_id uuid`
- `error_code text`
- `error_message text`
- `created_at timestamptz not null default now()`
- `completed_at timestamptz`

## 오류와 환불 명세

실패 처리는 사용자 안내, 크레딧 복구, 관리자 추적이 함께 이루어져야 한다.

### 오류 코드

권장 `error_code`:

- `layout_generation_failed`
- `style_resolution_failed`
- `comfy_submit_failed`
- `comfy_generation_failed`
- `candidate_download_failed`
- `transparent_postprocess_failed`
- `asset_upload_failed`
- `generation_timeout`
- `export_render_failed`
- `zip_export_failed`
- `insufficient_free_credit`
- `insufficient_paid_credit`
- `active_job_exists`
- `storage_quota_exceeded`
- `unauthorized`

사용자에게는 내부 오류 코드 원문을 그대로 보여주지 않는다. 화면에는 짧고 명확한 문구를 보여주고, 상세 원인은 관리자 화면과 로그에 남긴다.

### 생성 실패 환불

무료 생성:

- 3개 중 1개 이상 성공: 무료 생성 1회 사용 처리
- 3개 모두 실패: 무료 생성 1회 복구
- 실패 slot은 실패 상태를 표시하되, 성공 slot은 선택 가능

유료 생성:

- slot 단위로 크레딧을 배분한다.
- 성공 slot은 차감 유지
- 실패 slot은 유료 크레딧 환불
- 3개 모두 실패하면 전체 생성 비용 환불

환불은 `credit_ledger`에 양수 금액으로 기록한다.

권장 `reason`:

- `generation_slot_refund`
- `generation_batch_full_refund`
- `export_refund`
- `admin_adjustment`

### 내보내기 실패 환불

- PNG 내보내기 실패: PNG 내보내기 비용만 환불
- 레이어 ZIP 실패: ZIP 비용만 환불
- 유료 워터마크 제거 실패: 해당 내보내기 비용만 환불
- 이미 성공한 생성 batch는 되돌리지 않는다.

### 실패 UX

사용자 화면은 다음을 보여준다.

- 성공한 시안 수
- 실패한 시안 수
- 환불 또는 무료 횟수 복구 여부
- 다시 시도 버튼

권장 문구:

- "3개 중 2개가 완성되었습니다. 실패한 1개에 대한 크레딧은 반환되었습니다."
- "이번 생성은 완료되지 않았습니다. 사용된 무료 생성 횟수는 복구되었습니다."
- "ZIP 파일을 만들지 못했습니다. ZIP 내보내기 크레딧은 반환되었습니다."

## 내보내기 과금

기본 PNG:

- 무료 생성 결과: 작은 워터마크 포함
- 유료 생성 결과: 워터마크 없음
- 무료 생성 결과라도 유료 크레딧으로 워터마크 제거 내보내기를 구매할 수 있음

투명 배경 타이포 PNG:

- 무료 생성 결과: 워터마크 또는 표시 조건 적용
- 유료 생성 결과: 워터마크 없음

레이어 ZIP:

- 유료 크레딧만 사용 가능
- 무료 생성으로 만든 결과라도 ZIP 내보내기 시 유료 크레딧이 필요함
- ZIP 파일 안의 레이어 이미지에는 워터마크를 넣지 않는 대신, 유료 라이선스 구매 상태를 저장해야 함

## 워터마크 정책

무료 생성 결과에는 워터마크가 들어간다.

적용 대상:

- 생성된 3개 시안 미리보기
- 무료 기본 PNG 내보내기
- 무료 투명 PNG 내보내기

적용하지 않는 대상:

- 유료 크레딧으로 생성한 결과
- 유료 크레딧으로 워터마크 제거 내보내기를 구매한 결과
- 유료 레이어 ZIP

워터마크는 프론트엔드 표시만으로 처리하지 않는다. Worker 또는 서버 내보내기 단계에서 실제 이미지 픽셀에 합성한다.

무료 최종본 워터마크 기준:

- 작고 연한 반투명 텍스트
- 결과물 전체를 망치지 않음
- 일반적인 사용 흐름에서 제거하기 어렵게 이미지에 직접 합성
- 예시 문구: `Generated with fontasy.ai.kr`

시안 워터마크 기준:

- 후보 선택이 가능할 정도로 결과를 가리지 않음
- 스크린샷이나 단순 저장으로 그대로 사용하기 어렵게 적용

워터마크 적용 여부는 `outputs` 또는 `exports` 레코드에 저장한다.

권장 필드:

- `watermark_applied boolean not null`
- `watermark_text text`
- `watermark_version text`
- `license_type text not null`

## 라이선스 정책

라이선스는 결과물이 만들어진 조건과 연결된다.

권장 라이선스 종류:

- `free_attribution_required`
- `paid_standard`

### 무료 생성 라이선스

무료 크레딧으로 만든 결과물은 상업적 이용이 가능하되, 작품 상세 페이지 또는 독자가 쉽게 볼 수 있는 소개 영역에 `fontasy.ai.kr`에서 생성했음을 표시해야 한다.

권장 사용자 문구:

> 무료 크레딧으로 만든 결과물은 작품 상세 페이지 또는 소개 영역에 `fontasy.ai.kr`에서 생성했음을 표시하면 상업적으로 사용할 수 있습니다.

포함 조건:

- 워터마크 포함 결과물 사용 가능
- 표시 의무 있음
- 레이어 ZIP은 무료 라이선스로 제공하지 않음
- 결과물 사용에 따른 권리 확인과 책임은 사용자에게 있음

### 유료 라이선스

유료 크레딧으로 생성하거나 유료 내보내기를 구매한 결과물은 표시 의무 없이 사용할 수 있다.

권장 사용자 문구:

> 유료 크레딧으로 만든 결과물은 표시 의무 없이 사용할 수 있습니다.

포함 조건:

- 상업적 이용 가능
- 표시 의무 없음
- 워터마크 없는 PNG 제공 가능
- 유료 ZIP 내보내기 가능
- 결과물 사용에 따른 권리 확인과 책임은 사용자에게 있음

### 공통 조건

공통으로 포함되어야 할 내용:

- 사용자는 업로드한 표지 이미지와 입력한 제목을 사용할 권리를 가지고 있어야 한다.
- 타인의 상표, 로고, 저작물, 인격권, 퍼블리시티권을 침해하는 방식으로 사용하면 안 된다.
- 생성 결과의 최종 사용 책임은 사용자에게 있다.
- 서비스는 불법적 사용, 권리 침해 사용, 플랫폼 약관 위반 사용을 허용하지 않는다.
- 사용자는 결과물을 사용하기 전 필요한 권리 검토를 해야 한다.

법률 검토가 필요한 내용:

- 책임 제한 범위
- 생성 결과물 권리 귀속 표현
- 무료 표시 의무의 법적 강제 방식
- 유료 라이선스의 허용 범위
- 환불과 크레딧 소멸 조건
- 개인정보 처리방침과 약관 간 연결

법률 검토 필요 여부는 내부 문서에만 남긴다. 사용자 노출 약관에는 완성된 문구만 게시한다.

## 보관과 삭제 정책

Fontasy는 범용 편집 도구가 아니므로 장기 보관을 기본 가치로 두지 않는다. 이미지는 짧게 보관하고, 크레딧/라이선스/감사 기록은 운영상 필요한 기간 동안 보관한다.

### 보관 기간 기본값

권장 기본값:

- 업로드한 표지 원본: 완료 또는 마지막 수정 후 24시간
- 표지 분석용 파생 데이터: 마지막 수정 후 7일
- 진행 중 프로젝트: 마지막 수정 후 7일
- 완료된 결과물 이미지: 완료 후 30일
- 생성 실패 작업의 임시 파일: 실패 후 7일
- 다운로드용 signed URL: 1시간 이하
- 크레딧 원장: 서비스 운영 기간 동안 보관
- 라이선스 발급 기록: 서비스 운영 기간 동안 보관
- 관리자 감사 로그: 최소 1년

이미지 파일이 삭제되어도 프로젝트 메타데이터, 크레딧 기록, 라이선스 기록은 남을 수 있다. 이 경우 사용자 화면에는 이미지 대신 보관 기간 만료 상태를 표시한다.

### 삭제 작업

삭제 작업은 Worker 또는 scheduled job으로 수행한다.

필수 동작:

- 만료된 Storage 파일 삭제
- 연결된 asset 레코드에 `deleted_at` 저장
- 프로젝트 상태를 필요한 경우 `archived`로 변경
- 삭제 실패 시 `retention_cleanup_failed` 이벤트 기록

권장 테이블: `asset_retention_policies`

- `asset_kind text primary key`
- `retention_hours int not null`
- `delete_storage_file boolean not null default true`
- `keep_metadata boolean not null default true`

권장 asset 필드:

- `expires_at timestamptz`
- `deleted_at timestamptz`
- `delete_reason text`

### 사용자 삭제 요청

설정 페이지에서 데이터 삭제 요청을 받을 수 있어야 한다.

MVP 처리:

- 사용자는 설정에서 삭제 요청을 생성한다.
- 관리자는 `/admin/users`에서 요청을 확인하고 처리한다.
- 처리 결과와 처리 시각을 기록한다.

권장 테이블: `user_delete_requests`

- `id uuid primary key`
- `user_id uuid not null`
- `status text not null default 'requested'`
- `request_message text`
- `resolved_by uuid`
- `resolved_at timestamptz`
- `created_at timestamptz not null default now()`

## 설정 페이지 명세

설정 페이지는 계정과 이용 조건을 확인하는 곳이다. 제작 화면의 흐름을 방해하지 않고, 상시 서비스 바 또는 계정 메뉴에서 접근한다.

라우트:

- `/settings`

표시 항목:

- 로그인 이메일
- 무료 생성 잔여 횟수
- 유료 크레딧 잔액
- 최근 크레딧 사용 내역
- 작업물 보관 기간
- 무료/유료 라이선스 안내
- 이용약관 링크
- 개인정보 처리방침 링크
- 데이터 삭제 요청
- 로그아웃

권장 API:

- `GET /me`
- `GET /me/credits`
- `GET /me/credit-ledger?limit=...`
- `GET /me/storage-policy`
- `GET /me/license-summary`
- `POST /me/delete-request`

설정 화면의 문구 역시 메타 서술을 금지한다. "현재 MVP에서는" 같은 문구를 넣지 않는다.

## 내 작업 목록 명세

메인 화면과 왼쪽 서비스 바에서 내 작업 목록으로 이동할 수 있어야 한다.

라우트:

- `/works`

목록 규칙:

- 로그인한 사용자 자신의 작업만 표시한다.
- "새로 만들기"는 항상 빈 프로젝트를 만든다.
- "이어 만들기" 또는 작업 카드 클릭 시에만 기존 프로젝트를 불러온다.
- 완료 버튼을 여러 번 눌러도 같은 작업이면 새 목록 항목을 만들지 않는다.
- 같은 `project_id`와 `version_id`의 완료 기록은 덮어쓴다.
- 보관 기간이 지난 이미지는 "보관 기간 만료" 상태로 표시한다.

권장 API:

- `GET /projects`
- `GET /projects/{project_id}`
- `GET /projects/{project_id}/versions/{version_id}`
- `POST /projects/{project_id}/archive`
- `POST /projects/{project_id}/restore`
- `DELETE /projects/{project_id}`

목록 응답 필드:

- `project_id`
- `version_id`
- `title`
- `genre`
- `status`
- `thumbnail_asset_url`
- `thumbnail_expired boolean`
- `updated_at`
- `completed_at`
- `active_job_id`

프로젝트에 활성 생성 job이 있으면 목록에서도 "생성 중" 상태를 표시하고, 클릭 시 해당 작업 화면에서 폴링을 재개한다.

## 결제 전 임시 운영 명세

결제 시스템이 붙기 전에도 유료 크레딧 흐름을 테스트할 수 있어야 한다.

MVP 운영 방식:

- 결제 UI는 숨긴다.
- 유료 크레딧은 관리자 페이지에서만 수동 지급한다.
- 수동 지급에는 사유와 메모가 필수다.
- 유료 크레딧을 사용한 생성/내보내기/라이선스 흐름은 실제와 동일하게 작동한다.

관리자 수동 지급 API:

- `POST /admin/users/{user_id}/credits/adjust`

요청 필드:

- `credit_type`: `paid_credit`
- `amount`: 양수 또는 음수
- `reason`: `admin_grant`, `test_grant`, `correction`, `refund_correction`
- `memo`: 필수

관리자 페이지에서는 테스트 지급과 운영 지급을 구분해서 보여준다.

## 로그와 모니터링 명세

Render 로그만으로는 실패 원인을 추적하기 어렵다. 주요 이벤트는 DB에 남긴다.

권장 테이블: `job_events`

- `id uuid primary key`
- `job_id uuid not null`
- `event_type text not null`
- `status text`
- `message text`
- `payload_json jsonb not null default '{}'`
- `created_at timestamptz not null default now()`

기록할 이벤트:

- `job_created`
- `job_claimed`
- `job_started`
- `comfy_submitted`
- `comfy_poll_failed`
- `candidate_downloaded`
- `postprocess_started`
- `asset_uploaded`
- `slot_failed`
- `job_completed`
- `credit_refunded`
- `export_started`
- `export_completed`
- `export_failed`

`payload_json`에는 외부 서비스의 민감한 키나 전체 프롬프트를 저장하지 않는다. 필요한 경우 prompt hash, Comfy prompt id, asset id, error summary만 저장한다.

관리자 화면에서는 job별 event timeline을 확인할 수 있어야 한다.

## Rate Limit과 남용 방지

무료 생성 3회 제한과 별도로, 동시에 여러 작업이 비용을 소모하지 않도록 제한한다.

MVP 기본값:

- 사용자당 활성 typography_generation job 1개
- 사용자당 분당 typography_generation 요청 1회
- 사용자당 하루 무료 생성 3회
- 사용자당 활성 export_request 1개
- 같은 project_version에서 활성 generation_batch 1개

권장 API 응답:

- 제한 초과 시 HTTP 429
- 응답 body에는 사용자에게 보여줄 짧은 메시지와 재시도 가능 시각을 포함

권장 테이블: `api_rate_limits`

- `id uuid primary key`
- `user_id uuid not null`
- `key text not null`
- `window_start timestamptz not null`
- `count int not null default 0`
- unique: `(user_id, key, window_start)`

계정 다중 생성 방지는 MVP에서 완전히 해결하지 않는다. 우선 비용이 큰 생성/내보내기의 동시 실행과 반복 요청을 막는다.

## 콘텐츠와 권리 리스크

서비스는 사용자가 입력한 제목과 업로드한 표지를 사용할 권리가 있다는 전제에서 작동한다.

약관과 라이선스에 포함할 원칙:

- 사용자는 입력한 제목, 업로드한 표지, 요청한 요소를 사용할 권리를 가져야 한다.
- 타인의 상표, 로고, 작품명, 작가명, 캐릭터명, 저작물을 침해하는 방식으로 사용하면 안 된다.
- 결과물 사용에 따른 권리 확인과 책임은 사용자에게 있다.
- 서비스는 권리 침해 신고 또는 운영상 필요가 있는 경우 작업물 접근을 제한할 수 있다.
- 무료 결과물의 표시 의무를 지키지 않은 사용은 무료 라이선스 범위를 벗어난다.

관리자 조치:

- 신고된 작업 조회
- 작업물 접근 제한
- 사용자 메모 기록
- 필요한 경우 프로젝트 삭제 또는 계정 제한

권장 테이블: `content_reports`

- `id uuid primary key`
- `reporter_email text`
- `project_id uuid`
- `user_id uuid`
- `reason text not null`
- `status text not null default 'open'`
- `admin_note text`
- `resolved_by uuid`
- `resolved_at timestamptz`
- `created_at timestamptz not null default now()`

## 사용자 흐름 변경

생성 전:

- 무료 생성 가능 횟수 또는 유료 크레딧 잔액을 보여준다.
- 무료 생성이면 워터마크와 표시 조건을 명확히 안내한다.
- 유료 생성이면 워터마크 없는 결과물을 받을 수 있음을 안내한다.
- 시안 슬롯은 정적인 요청 전 상태로 표시한다.

생성 중:

- 3개 시안 생성 상태를 보여준다.
- 생성 버튼을 비활성화한다.
- 페이지를 다시 열어도 같은 생성 작업의 진행 상태를 보여준다.
- 실패한 시안이 있으면 실패 수와 환불/복구 상태를 안내한다.

시안 선택:

- 무료 시안에는 워터마크가 포함된다.
- 유료 시안에는 워터마크가 없다.

효과 적용:

- 효과 편집은 생성 크레딧을 추가로 소모하지 않는다.
- 고급 내보내기만 별도 크레딧을 소모한다.

내보내기:

- 기본 PNG
- 투명 PNG
- 유료 레이어 ZIP
- 무료 결과물의 표시 조건 확인
- 유료 내보내기 시 표시 의무 없음 확인

## 데이터 모델 추가 요약

추가 또는 확장할 테이블:

- `admin_users`
- `admin_audit_log`
- `site_visuals`
- `daily_free_credit_usage`
- `credit_ledger`
- `asset_retention_policies`
- `user_delete_requests`
- `export_requests`
- `job_events`
- `api_rate_limits`
- `content_reports`
- `license_policies`
- `output_licenses`

기존 프로젝트/작업/출력 테이블에 추가할 필드:

- `projects.status`
- `project_versions.status`
- `credit_source`
- `paid_credit_spent`
- `paid_credit_refunded`
- `free_usage_date`
- `watermark_applied`
- `watermark_version`
- `license_type`
- `license_policy_version`
- `expires_at`
- `deleted_at`
- `error_code`
- `error_message`
- `idempotency_key`

## 구현 순서

### 1단계: 상태와 데이터 기반

- 마이그레이션 작성
- project/project_version/job/batch/slot/export 상태 필드 정리
- 무료 일일 사용량 테이블 추가
- 유료 크레딧 원장 추가
- 라이선스 정책 버전 테이블 추가
- export request 테이블 추가
- job event 테이블 추가
- 보관/삭제 정책 필드 추가
- 기존 출력 레코드에 워터마크/라이선스 필드 추가

### 2단계: 서버 권한

- API에서 크레딧 차감과 환불 처리
- API에서 관리자 권한 확인
- 생성 작업 생성 시 `credit_source` 저장
- 내보내기 요청 시 라이선스와 크레딧 조건 확인
- 같은 프로젝트/버전의 활성 생성 job 중복 생성 방지
- 활성 job 조회 API 추가
- 설정/내 작업/크레딧 내역 API 추가
- rate limit 적용

### 3단계: Worker 처리

- 무료 결과물 워터마크 합성
- 시안 이미지 워터마크 합성
- 결과 저장 시 라이선스 타입 저장
- 실패한 시안 수에 따른 환불 처리
- job event 기록
- 투명화/업로드/내보내기 실패 코드 기록
- 만료된 asset 삭제 작업 추가

### 4단계: 프론트엔드 반영

- 왼쪽 상시 서비스 바 추가
- 설정 페이지 추가
- 내 작업 목록 추가
- 생성 전 크레딧 선택/확인 UI
- 무료/유료 조건 안내
- 생성 전/생성 중/생성 후 슬롯 UI 분리
- 생성 중 버튼 잠금
- 페이지 재진입 시 활성 job 복구
- 시안 워터마크 표시
- 내보내기 버튼 조건 분기
- 모바일 단계 표시 구조 정리
- 모바일 효과 화면 패널 구조 정리
- 모바일 내보내기 옵션 표시 보장
- 관리자 페이지 추가
- 관리자 지정 이미지 로딩

### 5단계: 이미지 자산 교체

- 이미지 생성 도구로 대기 이미지 제작
- 생성 결과 검수
- 기본 번들 이미지 추가
- `site_visuals`와 연동
- 기존 SVG성 대기 이미지 제거

### 6단계: 검증

- 상태 전이가 terminal 상태에서 되돌아가지 않는지 확인
- 같은 프로젝트/버전에서 생성 중복 요청이 막히는지 확인
- 페이지 재진입 시 활성 생성 job이 복구되는지 확인
- 무료 생성 3회 제한 테스트
- 날짜 변경 후 무료 생성 복구 테스트
- 유료 생성 차감 테스트
- 실패 환불 테스트
- 부분 성공 시 성공 시안 선택과 실패 slot 환불이 동시에 처리되는지 확인
- 무료 결과물 워터마크 확인
- 유료 결과물 워터마크 없음 확인
- 무료 ZIP 차단 테스트
- 유료 ZIP 허용 테스트
- ZIP 실패 시 ZIP 비용만 환불되는지 확인
- 내 작업에서 새로 만들기와 이어 만들기가 섞이지 않는지 확인
- 완료 버튼 반복 클릭이 중복 작업을 만들지 않는지 확인
- 설정 페이지에서 크레딧 내역과 삭제 요청이 가능한지 확인
- 보관 기간 만료 asset이 삭제되고 화면에 만료 상태가 표시되는지 확인
- rate limit 초과 시 429가 반환되는지 확인
- 비관리자 `/admin` 접근 차단 테스트
- 관리자 감사 로그 테스트
- 최초 owner가 없을 때 관리자 API가 열리지 않는지 확인
- owner가 최소 1명 이상 유지되는지 확인
- 모바일 780px 이하에서 단계 표시가 잘리지 않는지 확인
- 모바일 효과 화면에서 프리셋/세부 설정이 미리보기를 가리지 않는지 확인
- 모바일 내보내기 화면에서 PNG/ZIP/완료 버튼이 모두 보이는지 확인
- 모바일 하단 버튼이 본문을 가리지 않는지 확인

## 로컬 테스트 전략

Vercel에 올리지 않아도 테스트할 수 있다. Vercel은 호스팅 환경일 뿐이며, 로컬 Next.js 앱이 Render API와 Supabase를 바라보게 하면 실제 서비스 흐름 대부분을 확인할 수 있다.

권장 테스트 방식은 두 가지다.

### 방식 A: 로컬 웹 + 배포된 API/Worker

가장 간단한 방식이다.

- 웹은 로컬에서 실행한다.
- API와 Worker는 Render에 올라간 것을 사용한다.
- Auth와 DB는 Supabase를 사용한다.
- Comfy Cloud와 OpenRouter는 실제 키를 사용한다.

필요 조건:

- `apps/web/.env.local`의 `NEXT_PUBLIC_API_BASE_URL`이 Render API 주소여야 한다.
- Supabase Auth Redirect URLs에 `http://localhost:3000/**`이 있어야 한다.
- Render API의 CORS 허용 목록에 `http://localhost:3000`이 있어야 한다.

이 방식은 Vercel 배포 없이도 로그인, 프로젝트 저장, 생성 요청, 작업 조회, 결과 확인을 테스트할 수 있다.

### 방식 B: 웹 + API + Worker 전체 로컬

개발 중 서버 코드까지 함께 고칠 때 사용한다.

- 웹: `localhost:3000`
- API: `localhost:8000`
- Worker: 로컬 프로세스
- Supabase는 원격 프로젝트 사용

필요 조건:

- 웹의 `NEXT_PUBLIC_API_BASE_URL`을 `http://localhost:8000`으로 둔다.
- API와 Worker에 Supabase service role key, OpenRouter key, Comfy Cloud key를 넣는다.
- Supabase Auth Redirect URLs에 `http://localhost:3000/**`이 있어야 한다.
- Google Cloud OAuth의 Authorized redirect URI는 Supabase callback URL을 유지한다.

Google 로그인에서 localhost를 따로 Google Cloud에 넣는 것이 아니라, Supabase가 OAuth 콜백을 받는다. Google Cloud에는 Supabase callback URL이 들어가고, Supabase Redirect URLs에 localhost가 들어간다.

## 배포 전 체크

- 사용자 화면에 메타 서술 문구가 없는지 확인
- 무료/유료 크레딧 조건이 서버에서 강제되는지 확인
- 무료 결과물 워터마크가 실제 이미지에 합성되는지 확인
- 레이어 ZIP이 유료 조건에서만 가능한지 확인
- 관리자 기능이 API에서 차단되는지 확인
- 관리자 작업 감사 로그가 남는지 확인
- 라이선스 문구가 약관/정책 페이지와 내보내기 흐름에 연결되는지 확인
- 법률 검토가 필요한 문구가 사용자 화면에 초안 상태로 노출되지 않는지 확인
