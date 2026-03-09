'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import Image from 'next/image';

// ── Feature data ─────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: '☀️', title: '오늘의 할일', desc: '하루를 스마트하게 시작. 오늘 해야 할 일만 모아 집중력을 유지합니다.' },
  { icon: '📋', title: '할일 관리', desc: '우선순위, 목록, 태그, 하위 작업까지 — 복잡한 프로젝트도 깔끔하게.' },
  { icon: '📅', title: '캘린더', desc: 'Google 캘린더 연동, 국가별 공휴일, 월간 일정을 한눈에.' },
  { icon: '⏱️', title: '타임박스', desc: '시간 블로킹으로 하루를 설계. 어떤 시간에 무엇을 할지 미리 계획하세요.' },
  { icon: '📔', title: '노트', desc: '블록 기반 에디터로 자유롭게. 헤딩, 목록, 체크박스, 코드, 이미지까지.' },
  { icon: '🧠', title: '마인드맵', desc: '아이디어를 시각적으로 구조화. 드래그, 색상, 이미지 첨부 지원.' },
  { icon: '🌐', title: '번역기', desc: '20개 언어 즉시 번역. 앱을 벗어나지 않고 언어 장벽을 넘으세요.' },
  { icon: '🧮', title: '계산기', desc: '비율, 퍼센트, 세금, 단위 변환, 색상 변환까지 — 모든 계산이 한 곳에.' },
  { icon: '🔔', title: '스마트 알림', desc: '마감 기한, 캘린더 일정을 적시에 알려주는 스마트 리마인더.' },
  { icon: '☁️', title: '실시간 동기화', desc: 'Firebase 기반 실시간 동기화. 어느 기기에서든 동일한 데이터.' },
  { icon: '🌍', title: '6개 언어', desc: '한국어, 영어, 일본어, 스페인어, 포르투갈어, 프랑스어를 지원합니다.' },
  { icon: '🖥️', title: '크로스 플랫폼', desc: '웹, Windows, macOS, Linux, Android, iOS — 모든 환경에서 사용 가능.' },
];

const AI_FEATURES = [
  { icon: '🎯', title: '우선순위 분석', desc: '할일 목록을 분석해 오늘 가장 중요한 것부터 제안합니다.' },
  { icon: '💡', title: '작업 제안', desc: '프로젝트나 목표를 말하면 세부 할일을 자동 생성합니다.' },
  { icon: '📋', title: '작업 분해', desc: '큰 할일을 작은 단위로 쪼개 실행 가능한 계획으로 만듭니다.' },
  { icon: '📅', title: '일정 최적화', desc: '마감 기한과 우선순위를 고려해 최적의 일정을 배분합니다.' },
  { icon: '📝', title: '노트 자동 작성', desc: '주제를 말하면 구조화된 노트를 자동으로 작성해드립니다.' },
  { icon: '🧠', title: '마인드맵 생성', desc: '키워드 하나로 완성된 마인드맵 구조를 즉시 만들어냅니다.' },
];

// ── Pricing data ─────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'free' as const,
    productId: '',
    name: 'Free',
    price: '무료',
    priceNote: '영원히',
    features: [
      '할일 관리 (무제한)',
      '캘린더 & 타임박스',
      '노트 & 마인드맵',
      '번역기 & 계산기',
      '3개 커스텀 목록',
      '100MB 스토리지',
      '6개 언어 지원',
    ],
    cta: '무료로 시작',
    highlight: false,
    accent: '#6b7280',
  },
  {
    id: 'pro' as const,
    productId: process.env.NEXT_PUBLIC_POLAR_PRODUCT_PRO ?? '',
    name: 'Pro',
    price: '$7.99',
    priceNote: '/ 월',
    badge: '가장 인기',
    features: [
      'Free 모든 기능 포함',
      '🤖 NOAH AI 무제한',
      'Google 캘린더 연동',
      '국가별 공휴일 표시',
      '무제한 커스텀 목록',
      '10GB 스토리지',
      '우선 고객 지원',
    ],
    cta: 'Pro 시작하기',
    highlight: true,
    accent: '#e94560',
  },
  {
    id: 'team' as const,
    productId: process.env.NEXT_PUBLIC_POLAR_PRODUCT_TEAM ?? '',
    name: 'Team',
    price: '$15.99',
    priceNote: '/ 월',
    badge: undefined as string | undefined,
    features: [
      'Pro 모든 기능 포함',
      '팀 공유 목록',
      '50GB 스토리지',
      '팀원 권한 관리',
      '전용 고객 지원',
      '향후 팀 협업 기능',
    ],
    cta: 'Team 시작하기',
    highlight: false,
    accent: '#8b5cf6',
  },
];

// ── Pricing Card ─────────────────────────────────────────────────────────────

function PricingCard({ plan, user }: {
  plan: typeof PLANS[0];
  user: { uid: string; email: string | null } | null;
}) {
  const router = useRouter();

  const handleCheckout = () => {
    if (plan.id === 'free') { router.push('/login'); return; }
    if (!user) { router.push('/login'); return; }

    const params = new URLSearchParams();
    params.set('products', plan.productId);
    if (user.email) params.set('customerEmail', user.email);
    params.set('metadata', JSON.stringify({ uid: user.uid }));
    window.location.href = `/api/polar/checkout?${params.toString()}`;
  };

  return (
    <div className={`relative flex flex-col rounded-2xl border p-7 transition-all duration-300 ${
      plan.highlight
        ? 'border-[#e94560]/50 bg-[#e94560]/5 shadow-2xl shadow-[#e94560]/10 md:scale-105'
        : 'border-white/10 bg-white/[0.03] hover:border-white/20'
    }`}>
      {plan.badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1 bg-[#e94560] text-white text-xs font-bold rounded-full shadow-lg whitespace-nowrap">
            {plan.badge}
          </span>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
        <div className="flex items-end gap-1.5">
          <span className="text-4xl font-extrabold text-white">{plan.price}</span>
          <span className="text-slate-400 text-sm mb-1">{plan.priceNote}</span>
        </div>
      </div>

      <ul className="space-y-2.5 mb-8 flex-1">
        {plan.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
            <span className="text-green-400 mt-0.5 flex-shrink-0 text-xs">✓</span>
            {f}
          </li>
        ))}
      </ul>

      <button
        onClick={handleCheckout}
        className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
          plan.highlight
            ? 'bg-[#e94560] text-white hover:bg-[#d63b55]'
            : plan.id === 'team'
            ? 'bg-[#8b5cf6] text-white hover:bg-[#7c3aed]'
            : 'border border-white/20 text-white hover:bg-white/10'
        }`}
      >
        {plan.cta}
      </button>
    </div>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────────────

function LandingPage() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <div className="min-h-screen bg-[#08081a] text-white overflow-x-hidden">

      {/* ── Nav ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#08081a]/90 backdrop-blur-xl border-b border-white/10' : ''}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/symbol.svg" alt="NOAH" width={26} height={26} className="brightness-0 invert" />
            <span className="text-xl font-extrabold tracking-tight">NOAH</span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            {[['기능', '#features'], ['AI', '#ai'], ['요금제', '#pricing']].map(([label, href]) => (
              <a key={href} href={href} className="hover:text-white transition-colors">{label}</a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <Link href="/my-day" className="px-5 py-2 bg-[#e94560] hover:bg-[#d63b55] text-white text-sm font-bold rounded-xl transition-colors">
                앱 열기
              </Link>
            ) : (
              <>
                <Link href="/login" className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                  로그인
                </Link>
                <Link href="/login" className="px-5 py-2 bg-[#e94560] hover:bg-[#d63b55] text-white text-sm font-bold rounded-xl transition-colors">
                  무료 시작
                </Link>
              </>
            )}
          </div>

          <button onClick={() => setMenuOpen(v => !v)} className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen
                ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden bg-[#0d0d22] border-b border-white/10 px-6 pb-4 space-y-2">
            {[['기능', '#features'], ['AI', '#ai'], ['요금제', '#pricing']].map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-slate-400 hover:text-white">{label}</a>
            ))}
            <Link href="/login" onClick={() => setMenuOpen(false)} className="block mt-2 py-2.5 text-center bg-[#e94560] text-white text-sm font-bold rounded-xl">
              {user ? '앱 열기' : '무료 시작'}
            </Link>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-36 pb-28 px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#e94560]/8 rounded-full blur-[140px]" />
          <div className="absolute top-1/2 left-1/3 w-[500px] h-[300px] bg-[#8b5cf6]/6 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#e94560]/15 border border-[#e94560]/30 rounded-full text-xs font-semibold text-[#e94560] tracking-widest uppercase mb-10">
            <span className="w-1.5 h-1.5 bg-[#e94560] rounded-full animate-pulse" />
            AI 기반 생산성 플랫폼
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.1] mb-7">
            <span className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
              할 일 앱이 아닌,
            </span>
            <br />
            <span className="bg-gradient-to-r from-[#e94560] via-[#c94580] to-[#8b5cf6] bg-clip-text text-transparent">
              오늘의 설계자
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-12">
            NOAH는 할일 관리, AI 비서, 캘린더, 타임박스, 노트, 마인드맵을 하나로 통합한
            <span className="text-white font-medium"> 올인원 생산성 플랫폼</span>입니다.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-14">
            <Link href="/login"
              className="px-9 py-4 bg-[#e94560] hover:bg-[#d63b55] text-white font-bold rounded-2xl text-base transition-all duration-200 hover:scale-105 shadow-2xl shadow-[#e94560]/20 flex items-center justify-center gap-2">
              무료로 시작하기
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
            <a href="#features"
              className="px-9 py-4 bg-white/5 hover:bg-white/10 border border-white/15 hover:border-white/25 text-white font-semibold rounded-2xl text-base transition-all duration-200 flex items-center justify-center gap-2">
              기능 살펴보기
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {['웹 브라우저', 'Windows', 'macOS', 'Android', 'iOS'].map(p => (
              <span key={p} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-slate-500">
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-12 px-6 border-y border-white/5">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
          {[
            { num: '12+', label: '핵심 기능' },
            { num: '6', label: '지원 언어' },
            { num: '5개', label: '플랫폼' },
          ].map((s, i) => (
            <div key={i}>
              <div className="text-3xl md:text-4xl font-extrabold text-white mb-1">{s.num}</div>
              <div className="text-sm text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4">생산성에 필요한 모든 것</h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              12가지 핵심 기능이 하나의 앱에. 여러 앱을 오가는 시간 낭비를 끝내세요.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <div key={i} className="p-5 bg-white/[0.03] border border-white/8 rounded-2xl hover:border-white/18 hover:bg-white/5 transition-all duration-300 cursor-default">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="text-sm font-bold text-white mb-1.5">{f.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI Section ── */}
      <section id="ai" className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[600px] h-[500px] bg-[#8b5cf6]/8 rounded-full blur-[100px]" />
        </div>
        <div className="relative max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 rounded-full text-xs font-semibold text-[#8b5cf6] uppercase tracking-widest mb-6">
                🤖 NOAH AI
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold mb-5 leading-tight">
                AI가 당신의
                <br />
                <span className="text-[#8b5cf6]">일정을 설계합니다</span>
              </h2>
              <p className="text-slate-400 leading-relaxed mb-8">
                단순한 AI 챗봇이 아닙니다. NOAH AI는 할일 목록을 분석하고,
                우선순위를 제안하고, 노트를 자동 작성하며, 마인드맵을 즉시 생성합니다.
                대화하듯 명령하면 앱을 직접 조작합니다.
              </p>
              <a href="#pricing"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold rounded-xl text-sm transition-colors">
                Pro에서 사용 가능
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </a>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {AI_FEATURES.map((f, i) => (
                <div key={i} className="p-4 bg-[#8b5cf6]/5 border border-[#8b5cf6]/20 rounded-xl hover:border-[#8b5cf6]/40 transition-colors">
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <h4 className="text-sm font-bold text-white mb-1">{f.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-24 px-6 relative">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-[#e94560]/5 rounded-full blur-[120px]" />
        </div>
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4">투명한 요금제</h2>
            <p className="text-slate-400">
              기본 기능은 영원히 무료. AI와 고급 기능이 필요할 때 업그레이드하세요.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 md:items-center">
            {PLANS.map(plan => (
              <PricingCard key={plan.id} plan={plan} user={user ? { uid: user.uid, email: user.email } : null} />
            ))}
          </div>

          <div className="mt-10 text-center space-y-2">
            <p className="text-xs text-slate-500">
              결제는 <span className="text-slate-400 font-medium">Polar</span>를 통해 안전하게 처리됩니다. 언제든지 취소 가능.
            </p>
            <p className="text-xs text-slate-600">
              결제 후 Polar 웹훅을 통해 플랜이 자동으로 활성화됩니다.
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-5">지금 바로 시작하세요</h2>
          <p className="text-slate-400 mb-10">
            신용카드 없이 무료로 시작. 언제든지 업그레이드 가능합니다.
          </p>
          <Link href="/login"
            className="inline-flex items-center gap-2 px-10 py-4 bg-[#e94560] hover:bg-[#d63b55] text-white font-bold rounded-2xl text-base transition-all hover:scale-105 shadow-2xl shadow-[#e94560]/20">
            무료로 시작하기
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/8 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-2.5">
            <Image src="/symbol.svg" alt="NOAH" width={22} height={22} className="brightness-0 invert opacity-50" />
            <span className="text-slate-500 font-semibold text-sm">NOAH</span>
          </div>
          <div className="flex gap-6 text-sm text-slate-600">
            <a href="#features" className="hover:text-slate-400 transition-colors">기능</a>
            <a href="#pricing" className="hover:text-slate-400 transition-colors">요금제</a>
            <Link href="/login" className="hover:text-slate-400 transition-colors">로그인</Link>
          </div>
          <p className="text-xs text-slate-700">© 2025 NOAH. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

// ── Root Page ─────────────────────────────────────────────────────────────────

export default function RootPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isTauri, setIsTauri] = useState<boolean | null>(null);

  useEffect(() => {
    const detected = typeof window !== 'undefined' &&
      ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
    setIsTauri(detected);
  }, []);

  useEffect(() => {
    if (isTauri === null || loading) return;
    if (!isTauri) return;
    if (user) {
      const lastPage = localStorage.getItem('lastPage') || '/my-day';
      router.replace(lastPage);
    } else {
      router.replace('/login');
    }
  }, [isTauri, user, loading, router]);

  if (isTauri === null || isTauri) return null;
  return <LandingPage />;
}
