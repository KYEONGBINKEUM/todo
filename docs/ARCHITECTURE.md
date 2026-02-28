# AI Todo - 아키텍처 문서

## 시스템 개요

AI Todo는 Monorepo 구조로 구성된 풀스택 웹/모바일 애플리케이션입니다.

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Web App   │────▶│   Supabase   │────▶│  PostgreSQL  │
│  (Next.js)  │     │  (Backend)   │     │  (Database)  │
└─────────────┘     └──────────────┘     └──────────────┘
       │                    │                      │
       │                    ├──────────────────────┤
       │                    │   Real-time Sync     │
       │                    │   Authentication     │
       │                    │   Storage            │
       │                    └──────────────────────┘
       │
       ├───────────────────────────────────────────┐
       │                                           │
┌─────────────┐                            ┌──────────────┐
│ Mobile App  │                            │    Polar     │
│   (Expo)    │                            │  (Payments)  │
└─────────────┘                            └──────────────┘
```

## 기술 스택

### Frontend

#### Web (Next.js 14)
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**:
  - Server State: @tanstack/react-query
  - Client State: Zustand
- **UI Components**: Radix UI + Custom
- **Forms**: React Hook Form + Zod

#### Mobile (React Native + Expo)
- **Framework**: Expo (React Native)
- **Navigation**: Expo Router
- **State**: Same as web (React Query + Zustand)

### Backend

#### Supabase
- **Database**: PostgreSQL
- **Authentication**: Supabase Auth (OAuth 2.0)
- **Real-time**: Supabase Realtime (WebSocket)
- **Storage**: Supabase Storage
- **Edge Functions**: Deno Runtime

### Infrastructure

- **Monorepo**: Turborepo + pnpm workspaces
- **Deployment**:
  - Web: Vercel
  - Mobile: EAS (Expo Application Services)
- **Payments**: Polar
- **Monitoring**: Sentry (추후)
- **Analytics**: PostHog (추후)

## 데이터베이스 스키마

### 핵심 테이블

```sql
profiles
├── id (UUID, PK)
├── email (TEXT)
├── subscription_tier (TEXT)
└── subscription_status (TEXT)

lists
├── id (UUID, PK)
├── owner_id (UUID, FK → profiles)
├── name (TEXT)
└── is_default (BOOLEAN)

tasks
├── id (UUID, PK)
├── list_id (UUID, FK → lists)
├── parent_task_id (UUID, FK → tasks)  -- 서브태스크용
├── title (TEXT)
├── status (TEXT)
├── due_date (TIMESTAMPTZ)
├── my_day_date (DATE)
└── recurrence_rule (JSONB)

task_attachments
├── id (UUID, PK)
├── task_id (UUID, FK → tasks)
├── storage_path (TEXT)
└── is_note (BOOLEAN)

list_shares
├── id (UUID, PK)
├── list_id (UUID, FK → lists)
├── shared_with (UUID, FK → profiles)
└── permission (TEXT)
```

### RLS (Row Level Security)

모든 테이블에 RLS 정책 적용:
- 사용자는 자신의 데이터만 접근 가능
- 공유된 리스트는 권한에 따라 접근 가능
- Service Role Key는 모든 데이터 접근 가능 (Webhook용)

## API 설계

### Supabase Client Queries

```typescript
// Task 조회
const { data } = await supabase
  .from('tasks')
  .select('*, subtasks:tasks!parent_task_id(*)')
  .eq('list_id', listId);

// Task 생성
const { data } = await supabase
  .from('tasks')
  .insert({ title, list_id })
  .select()
  .single();

// 실시간 구독
supabase
  .channel('tasks')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'tasks'
  }, handleChange)
  .subscribe();
```

### REST API Routes (Next.js)

```
POST   /api/webhooks/polar       # Polar 결제 웹훅
GET    /api/health                # 헬스 체크
```

## 인증 플로우

```
1. 사용자 → /login 접속
2. "Google로 계속하기" 클릭
3. Supabase Auth → Google OAuth
4. Google 로그인 & 동의
5. Google → Supabase (code)
6. Supabase → /callback?code=xxx
7. Code 교환 → Session
8. 리디렉트 → /my-day
```

## 실시간 동기화

Supabase Realtime을 사용한 WebSocket 기반 동기화:

```typescript
// 구독 설정
const channel = supabase
  .channel(`list:${listId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'tasks',
    filter: `list_id=eq.${listId}`
  }, (payload) => {
    // React Query 캐시 업데이트
    queryClient.setQueryData(['tasks', listId], (old) => {
      // 낙관적 업데이트
    });
  })
  .subscribe();
```

## 상태 관리

### Server State (React Query)

```typescript
// Task 목록 조회
const { data: tasks } = useQuery({
  queryKey: ['tasks', listId],
  queryFn: () => api.getTasksByList(listId)
});

// Task 생성 (Optimistic Update)
const createMutation = useMutation({
  mutationFn: api.createTask,
  onMutate: async (newTask) => {
    // 낙관적 업데이트
    const previous = queryClient.getQueryData(['tasks', listId]);
    queryClient.setQueryData(['tasks', listId], (old) => [...old, newTask]);
    return { previous };
  },
  onError: (err, newTask, context) => {
    // 롤백
    queryClient.setQueryData(['tasks', listId], context.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries(['tasks', listId]);
  }
});
```

### Client State (Zustand)

```typescript
// 글로벌 상태
const useAuthStore = create((set) => ({
  user: null,
  profile: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile })
}));
```

## 결제 통합 (Polar)

### Checkout Flow

```typescript
// 1. Checkout 세션 생성
const checkout = await polarClient.checkouts.create({
  productId: 'prod_premium',
  successUrl: '/settings/billing?success=true',
  cancelUrl: '/settings/billing?canceled=true'
});

// 2. 리디렉트
window.location.href = checkout.url;

// 3. Webhook 수신 (/api/webhooks/polar)
// 4. profiles 테이블 업데이트
await supabase
  .from('profiles')
  .update({ subscription_tier: 'premium' })
  .eq('id', userId);
```

## 기능 제한 (Feature Gating)

```typescript
// Subscription Tier에 따른 제한
const LIMITS = {
  free: { max_tasks: 50, can_share: false },
  premium: { max_tasks: -1, can_share: false },
  team: { max_tasks: -1, can_share: true }
};

// 사용 예시
if (hasReachedLimit(tier, currentCount, 'max_tasks')) {
  return <UpgradePrompt />;
}
```

## 보안

### RLS (Row Level Security)

- 모든 데이터베이스 접근은 RLS 정책을 통과해야 함
- 사용자 인증 상태에 따라 자동으로 필터링
- Service Role Key는 RLS 우회 (서버 사이드 작업용)

### API 보안

- Middleware에서 인증 확인
- CSRF 보호 (SameSite cookies)
- Rate limiting (추후)
- Webhook 서명 검증

## 성능 최적화

### 프론트엔드
- React Query 캐싱
- 가상화된 리스트 (react-window)
- 이미지 최적화 (Next.js Image)
- 코드 스플리팅 (dynamic imports)

### 백엔드
- 데이터베이스 인덱스
- Real-time 채널 최적화
- CDN (Vercel Edge Network)

## 모니터링 & 로깅

(추후 구현)

- **Sentry**: 에러 트래킹
- **PostHog**: 사용자 분석
- **Vercel Analytics**: 웹 성능

## 배포

### Web (Vercel)
```bash
# GitHub 연결 → 자동 배포
# 환경 변수 설정 필요
```

### Mobile (EAS)
```bash
# 빌드
eas build --platform all --profile production

# 배포
eas submit --platform all
```

## 확장성

### 수평 확장
- Supabase는 자동으로 수평 확장
- Vercel Edge Functions는 글로벌 배포

### 수직 확장
- Supabase 플랜 업그레이드
- Database 리소스 증설

---

**문서 버전**: 1.0.0
**최종 업데이트**: 2026-02-16
