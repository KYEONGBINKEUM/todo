# AI Todo - 시작 가이드

Phase 1 MVP 기반이 성공적으로 구축되었습니다! 이제 개발을 시작할 준비가 완료되었습니다.

## 📁 프로젝트 구조

```
ai-todo/
├── apps/
│   ├── web/              # Next.js 웹 애플리케이션
│   └── mobile/           # React Native 앱 (추후 구현)
├── packages/
│   ├── shared/           # 공유 타입, API 클라이언트, 유틸리티
│   └── ui/               # 공유 UI 컴포넌트 (추후 구현)
├── supabase/            # 데이터베이스 마이그레이션
│   ├── migrations/      # SQL 마이그레이션 파일
│   └── config.toml      # Supabase 설정
└── docs/                # 문서 (추후 작성)
```

## 🚀 빠른 시작

### 1. 사전 요구사항

- **Node.js**: 20.0.0 이상
- **pnpm**: 8.0.0 이상
- **Supabase CLI** (선택사항): 로컬 개발용

설치:
```bash
# pnpm 설치 (이미 설치되어 있지 않은 경우)
npm install -g pnpm

# Supabase CLI 설치 (선택사항)
npm install -g supabase
```

### 2. 의존성 설치

```bash
# 루트에서 모든 패키지 의존성 설치
pnpm install
```

### 3. Supabase 프로젝트 설정

#### 옵션 A: Supabase Cloud (권장)

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. 프로젝트 URL과 anon key를 복사

#### 옵션 B: 로컬 Supabase

```bash
# Supabase 로컬 인스턴스 시작
supabase start

# 마이그레이션 실행
supabase db push
```

### 4. Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com)에서 새 프로젝트 생성
2. OAuth 2.0 클라이언트 ID 생성:
   - **승인된 리디렉션 URI**:
     - `https://<your-project-ref>.supabase.co/auth/v1/callback` (Cloud)
     - `http://localhost:54321/auth/v1/callback` (로컬)

3. Supabase 대시보드에서 Google OAuth 설정:
   - **Authentication** → **Providers** → **Google**
   - Client ID와 Client Secret 입력
   - 저장

### 5. 환경 변수 설정

#### 웹 앱 환경 변수 (.env.local)

```bash
# apps/web/.env.local 파일 생성
cd apps/web
cp .env.local.example .env.local
```

`.env.local` 파일 편집:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Polar (나중에 설정)
POLAR_API_KEY=polar_xxx
POLAR_WEBHOOK_SECRET=whsec_xxx
POLAR_ORGANIZATION_ID=org_xxx
NEXT_PUBLIC_POLAR_FREE_PRODUCT_ID=prod_xxx
NEXT_PUBLIC_POLAR_PREMIUM_PRODUCT_ID=prod_xxx
NEXT_PUBLIC_POLAR_TEAM_PRODUCT_ID=prod_xxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 6. 데이터베이스 마이그레이션 실행

#### Supabase Cloud:
```bash
# Supabase 프로젝트에 연결
supabase link --project-ref your-project-ref

# 마이그레이션 실행
supabase db push
```

#### 로컬 Supabase:
```bash
# 로컬에서는 이미 실행됨 (supabase start 시)
# 변경사항이 있을 경우:
supabase db reset
```

### 7. 개발 서버 실행

```bash
# 루트 디렉토리에서 (모든 앱 동시 실행)
pnpm dev

# 또는 웹 앱만 실행
cd apps/web
pnpm dev
```

웹 앱이 [http://localhost:3000](http://localhost:3000)에서 실행됩니다!

## 🧪 테스트

### 로그인 플로우 테스트

1. [http://localhost:3000](http://localhost:3000) 접속
2. "시작하기" 클릭
3. "Google로 계속하기" 클릭
4. Google 계정으로 로그인
5. `/my-day` 페이지로 리디렉션 확인

## 📋 다음 단계

Phase 1 MVP를 완성하기 위한 다음 구현 단계:

### 주차 1-2: 핵심 Task 관리
- [ ] Task CRUD UI 컴포넌트
- [ ] Task 목록 표시
- [ ] Task 생성/편집/삭제
- [ ] React Query 설정
- [ ] 실시간 동기화

### 주차 3-4: My Day & 기본 기능
- [ ] My Day 뷰 완성
- [ ] Task 필터링 & 정렬
- [ ] Task 검색
- [ ] 우선순위 설정
- [ ] 마감일 설정

### 주차 5-6: 서브태스크 & 반복
- [ ] 서브태스크 UI
- [ ] 반복 작업 설정 UI
- [ ] 반복 작업 자동 생성
- [ ] 알림 설정

### 주차 7-8: 리스트 & 조직화
- [ ] 리스트 CRUD
- [ ] 사이드바 네비게이션
- [ ] 리스트 커스터마이징
- [ ] 드래그 앤 드롭

### 주차 9-10: 협업 & 공유
- [ ] 리스트 공유 UI
- [ ] 실시간 협업
- [ ] 댓글 시스템
- [ ] 활동 피드

### 주차 11-12: 파일 & 결제
- [ ] 파일 업로드
- [ ] Polar 결제 통합
- [ ] 구독 관리 UI
- [ ] 기능 제한 적용

## 🛠 유용한 명령어

```bash
# 모든 앱 개발 모드
pnpm dev

# 빌드
pnpm build

# 린트
pnpm lint

# 타입 체크
pnpm type-check

# 특정 앱만 실행
pnpm --filter web dev

# Supabase 타입 생성
supabase gen types typescript --local > apps/web/lib/supabase/database.types.ts
```

## 📚 참고 자료

- [Next.js 14 문서](https://nextjs.org/docs)
- [Supabase 문서](https://supabase.com/docs)
- [React Query 문서](https://tanstack.com/query/latest)
- [Tailwind CSS 문서](https://tailwindcss.com/docs)
- [Polar 문서](https://docs.polar.sh)

## 🐛 문제 해결

### "Module not found" 에러
```bash
# 의존성 재설치
pnpm install --frozen-lockfile
```

### Supabase 연결 실패
- `.env.local` 파일의 환경 변수 확인
- Supabase 프로젝트가 활성화되어 있는지 확인
- 네트워크 연결 확인

### Google OAuth 실패
- Google Cloud Console에서 OAuth 설정 확인
- 리디렉션 URI가 정확한지 확인
- Supabase에서 Google provider가 활성화되어 있는지 확인

## 💡 도움이 필요하신가요?

- 이슈 리포트: GitHub Issues
- 문서: `/docs` 디렉토리
- 계획 문서: `~/.claude/plans/buzzing-rolling-nest.md`

---

**Phase 1 MVP 개발을 시작하세요!** 🚀
