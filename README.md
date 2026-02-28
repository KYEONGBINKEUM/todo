# AI Todo Application

할 일을 적는 앱이 아니라, 오늘을 설계해주는 디지털 비서

## 프로젝트 구조

```
ai-todo/
├── apps/
│   ├── web/          # Next.js 웹 애플리케이션
│   └── mobile/       # React Native (Expo) 모바일 앱
├── packages/
│   ├── shared/       # 공유 타입, API 클라이언트, 유틸리티
│   └── ui/           # 공유 UI 컴포넌트
└── supabase/         # 데이터베이스 마이그레이션
```

## 기술 스택

- **Frontend Web**: Next.js 14, TypeScript, Tailwind CSS
- **Frontend Mobile**: React Native, Expo
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Payment**: Polar
- **Monorepo**: Turborepo + pnpm

## 시작하기

### 사전 요구사항

- Node.js 20+
- pnpm 8+
- Supabase CLI (optional)

### 설치

```bash
# 의존성 설치
pnpm install

# 환경 변수 설정
cp .env.example .env.local
# .env.local 파일을 편집하여 실제 값 입력

# 개발 서버 실행
pnpm dev
```

### 개발

```bash
# 전체 프로젝트 개발 모드
pnpm dev

# 웹만 실행
cd apps/web && pnpm dev

# 모바일만 실행
cd apps/mobile && pnpm start

# 빌드
pnpm build

# 린트
pnpm lint

# 테스트
pnpm test
```

## 기능

### Phase 1 MVP (Foundation Layer)
- ✅ 작업 관리 (CRUD, 서브태스크)
- ✅ My Day (오늘 집중 작업)
- ✅ 알림 & 반복 작업
- ✅ 공유 & 협업
- ✅ 파일/메모 첨부
- ✅ 구글 로그인
- ✅ Polar 결제 (Free/Premium/Team)

### 수익화 모델

- **Free**: 최대 50개 작업, 기본 Todo 기능
- **Premium** (₩9,900/월): 무제한 작업, 파일 첨부, 반복 작업
- **Team** (₩29,900/인/월): Premium + 무제한 협업, 팀 분석

## 라이선스

MIT
