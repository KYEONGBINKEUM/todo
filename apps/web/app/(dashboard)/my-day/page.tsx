import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function MyDayPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-4 animate-fade-up">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-extrabold bg-gradient-to-r from-text-primary to-primary bg-clip-text text-transparent">
                My Day
              </h1>
              <p className="text-text-secondary mt-2">
                {new Date().toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                })}
              </p>
            </div>

            {/* User info */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-semibold">{profile?.full_name || user.email}</p>
                <p className="text-xs text-text-muted capitalize">
                  {profile?.subscription_tier || 'free'} plan
                </p>
              </div>
              {user.user_metadata?.avatar_url && (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="Profile"
                  className="w-10 h-10 rounded-full border border-border"
                />
              )}
            </div>
          </div>
        </div>

        {/* Welcome Message */}
        <div className="bg-background-card border border-border rounded-card p-8 text-center space-y-4 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="text-6xl">👋</div>
          <h2 className="text-2xl font-bold">환영합니다!</h2>
          <p className="text-text-secondary max-w-md mx-auto">
            AI Todo의 Phase 1 MVP가 성공적으로 설정되었습니다.
            이제 작업 관리, 협업, 그리고 더 많은 기능들을 구현할 준비가 되었습니다!
          </p>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 pt-6">
            <div className="bg-background p-4 rounded-button border border-border">
              <div className="text-2xl font-bold text-primary">0</div>
              <div className="text-xs text-text-muted mt-1">오늘의 작업</div>
            </div>
            <div className="bg-background p-4 rounded-button border border-border">
              <div className="text-2xl font-bold text-accent-purple">0</div>
              <div className="text-xs text-text-muted mt-1">완료됨</div>
            </div>
            <div className="bg-background p-4 rounded-button border border-border">
              <div className="text-2xl font-bold text-accent-blue">0</div>
              <div className="text-xs text-text-muted mt-1">진행 중</div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-background-card border border-border rounded-card p-8 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="text-xl font-bold mb-4">다음 단계</h3>
          <ul className="space-y-3 text-text-secondary">
            <li className="flex items-start gap-3">
              <span className="text-primary font-bold">1.</span>
              <span>환경 변수 설정 (.env.local 파일 생성)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-primary font-bold">2.</span>
              <span>Supabase 프로젝트 생성 및 마이그레이션 실행</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-primary font-bold">3.</span>
              <span>Google OAuth 설정 (Supabase 대시보드)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-primary font-bold">4.</span>
              <span>Polar 계정 설정 및 제품 생성</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-primary font-bold">5.</span>
              <span>Task 관리 UI 컴포넌트 구현</span>
            </li>
          </ul>
        </div>

        {/* Sign Out Button */}
        <form
          action={async () => {
            'use server';
            const supabase = createClient();
            await supabase.auth.signOut();
            redirect('/login');
          }}
          className="text-center animate-fade-up"
          style={{ animationDelay: '0.3s' }}
        >
          <button
            type="submit"
            className="px-6 py-2 bg-background-hover border border-border hover:border-primary text-text-secondary hover:text-text-primary rounded-button transition-all duration-200 text-sm"
          >
            로그아웃
          </button>
        </form>
      </div>
    </div>
  );
}
