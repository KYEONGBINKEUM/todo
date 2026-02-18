import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-accent-dark p-8">
      <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-up">
        {/* Logo/Badge */}
        <div className="inline-block">
          <div className="px-4 py-2 bg-primary/20 border border-primary/40 rounded-full text-xs font-semibold text-primary tracking-wide uppercase">
            Product Framework v1.0
          </div>
        </div>

        {/* Hero Title */}
        <h1 className="text-5xl md:text-7xl font-extrabold bg-gradient-to-r from-text-primary to-primary bg-clip-text text-transparent leading-tight">
          AI Todo Framework
        </h1>

        {/* Subtitle */}
        <p className="text-xl md:text-2xl text-text-secondary max-w-2xl mx-auto leading-relaxed">
          할 일을 적는 앱이 아니라, <br />
          <span className="text-primary font-semibold">오늘을 설계해주는 디지털 비서</span>
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
          <Link
            href="/login"
            className="w-full sm:w-auto px-8 py-4 bg-primary hover:bg-primary-hover text-white font-semibold rounded-button transition-all duration-200 transform hover:scale-105 shadow-lg"
          >
            시작하기
          </Link>
          <a
            href="#features"
            className="w-full sm:w-auto px-8 py-4 bg-background-card border border-border hover:border-primary text-text-primary font-semibold rounded-button transition-all duration-200"
          >
            자세히 보기
          </a>
        </div>

        {/* Features Grid */}
        <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16">
          {[
            {
              icon: '🧱',
              title: 'Foundation Layer',
              desc: '핵심 Todo 기능',
            },
            {
              icon: '🧠',
              title: 'AI Core Layer',
              desc: 'AI 기반 자동화 엔진',
            },
            {
              icon: '🤖',
              title: 'AI Agent Layer',
              desc: '에이전트형 디지털 비서',
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="p-6 bg-background-card border border-border rounded-card hover:border-primary transition-all duration-200 animate-fade-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
              <p className="text-text-secondary text-sm">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-16 text-text-muted text-sm">
          <p>정보 제공이 아니라 행동 지원 — 오늘의 성공률을 높이는 도구</p>
        </div>
      </div>
    </div>
  );
}
