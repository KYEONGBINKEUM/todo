'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

type Tab = 'guide' | 'desktop' | 'sites';

type Quality = 'best' | '1080p' | '720p' | '480p' | 'audio';

interface QualityOption {
  id: Quality;
  label: string;
  arg: string;
}

const QUALITY_OPTIONS: QualityOption[] = [
  { id: 'best', label: '최고화질 (기본)', arg: 'bestvideo+bestaudio/best' },
  { id: '1080p', label: '1080p', arg: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]' },
  { id: '720p', label: '720p', arg: 'bestvideo[height<=720]+bestaudio/best[height<=720]' },
  { id: '480p', label: '480p', arg: 'bestvideo[height<=480]+bestaudio/best[height<=480]' },
  { id: 'audio', label: '오디오만 (mp3)', arg: '-x --audio-format mp3' },
];

const SUPPORTED_SITES = [
  { name: 'YouTube', icon: '▶️', desc: '영상, 쇼츠, 재생목록' },
  { name: 'Vimeo', icon: '🎬', desc: '고화질 영상' },
  { name: 'Twitter / X', icon: '🐦', desc: '트윗 영상' },
  { name: 'TikTok', icon: '🎵', desc: '틱톡 영상' },
  { name: 'Instagram', icon: '📸', desc: '릴스, 포스트, 스토리' },
  { name: 'Twitch', icon: '🟣', desc: '클립, VOD' },
  { name: 'Dailymotion', icon: '🎥', desc: '영상' },
  { name: 'Facebook', icon: '📘', desc: '공개 영상' },
  { name: 'Reddit', icon: '🤖', desc: '영상 포스트' },
  { name: 'Bilibili', icon: '📺', desc: '중국 영상 플랫폼' },
  { name: 'SoundCloud', icon: '🔊', desc: '오디오 트랙' },
  { name: 'Bandcamp', icon: '🎸', desc: '앨범, 트랙' },
  { name: 'Rumble', icon: '📡', desc: '영상' },
  { name: 'Odysee / LBRY', icon: '🌊', desc: '영상' },
  { name: 'PeerTube', icon: '🌐', desc: '분산형 영상' },
  { name: 'NicoNico', icon: '🇯🇵', desc: '일본 영상 플랫폼' },
];

// ── 명령어 생성기 ──────────────────────────────────────────────────────────────
function CommandGenerator() {
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState<Quality>('best');
  const [output, setOutput] = useState('~/Downloads/%(title)s.%(ext)s');
  const [copied, setCopied] = useState(false);

  const selectedQuality = QUALITY_OPTIONS.find(q => q.id === quality)!;

  const generateCommand = (): string => {
    if (!url.trim()) return 'yt-dlp [URL]';
    if (quality === 'audio') {
      return `yt-dlp -x --audio-format mp3 -o "${output}" "${url.trim()}"`;
    }
    return `yt-dlp -f "${selectedQuality.arg}" -o "${output}" "${url.trim()}"`;
  };

  const command = generateCommand();

  const copyCommand = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="space-y-4 p-4 bg-background rounded-xl border border-border">
      <p className="text-sm font-bold text-text-primary">명령어 생성기</p>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">URL</label>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-3 py-2.5 bg-background-card border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors placeholder:text-text-muted"
          />
        </div>

        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">화질</label>
          <div className="flex flex-wrap gap-2">
            {QUALITY_OPTIONS.map(q => (
              <button
                key={q.id}
                onClick={() => setQuality(q.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  quality === q.id
                    ? 'bg-[#e94560] text-white'
                    : 'bg-border/40 text-text-muted hover:text-text-primary'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">출력 경로</label>
          <input
            value={output}
            onChange={e => setOutput(e.target.value)}
            className="w-full px-3 py-2.5 bg-background-card border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors font-mono"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block">생성된 명령어</label>
        <div className="flex gap-2">
          <pre className="flex-1 px-3 py-3 bg-[#0d1117] text-green-400 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all border border-border">
            {command}
          </pre>
          <button
            onClick={copyCommand}
            className="flex-shrink-0 px-4 py-2 bg-[#e94560]/10 text-[#e94560] border border-[#e94560]/20 rounded-xl text-sm font-semibold hover:bg-[#e94560]/20 transition-colors self-start mt-0"
          >
            {copied ? '복사됨 ✓' : '복사'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: 안내 ─────────────────────────────────────────────────────────────────
function GuideTab() {
  const installCommands = [
    { os: 'macOS (Homebrew)', cmd: 'brew install yt-dlp' },
    { os: 'Windows (winget)', cmd: 'winget install yt-dlp' },
    { os: 'Windows (pip)', cmd: 'pip install yt-dlp' },
    { os: 'Linux (pip)', cmd: 'pip install yt-dlp' },
    { os: 'Linux (curl)', cmd: 'sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp' },
  ];

  const examples = [
    { desc: '기본 다운로드', cmd: 'yt-dlp URL' },
    { desc: '최고화질 (영상+오디오 합성)', cmd: 'yt-dlp -f "bestvideo+bestaudio" URL' },
    { desc: '오디오만 mp3로', cmd: 'yt-dlp -x --audio-format mp3 URL' },
    { desc: '자막 포함', cmd: 'yt-dlp --write-subs --sub-lang ko URL' },
    { desc: '재생목록 전체', cmd: 'yt-dlp -o "%(playlist_index)s-%(title)s.%(ext)s" PLAYLIST_URL' },
    { desc: '쿠키 사용 (로그인 필요 콘텐츠)', cmd: 'yt-dlp --cookies-from-browser chrome URL' },
  ];

  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const copy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  };

  return (
    <div className="space-y-6">
      {/* Why limitation */}
      <div className="px-4 py-3.5 bg-[#e94560]/5 border border-[#e94560]/20 rounded-xl">
        <p className="text-sm font-semibold text-[#e94560] mb-1">웹 브라우저의 한계</p>
        <p className="text-xs text-text-secondary leading-relaxed">
          YouTube, Vimeo 등의 동영상은 CORS 정책 및 ToS(서비스 이용약관)로 인해 웹 브라우저에서 직접 다운로드할 수 없습니다.
          데스크탑 앱(Tauri)에서는 yt-dlp를 설치한 후 직접 실행할 수 있습니다.
        </p>
      </div>

      {/* yt-dlp installation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-text-primary">yt-dlp 설치</p>
          <a
            href="https://github.com/yt-dlp/yt-dlp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#e94560] hover:underline"
          >
            공식 GitHub →
          </a>
        </div>
        <div className="space-y-2">
          {installCommands.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border group">
              <div className="w-36 flex-shrink-0">
                <p className="text-[10px] text-text-muted font-semibold">{item.os}</p>
              </div>
              <pre className="flex-1 text-xs font-mono text-text-primary overflow-x-auto">{item.cmd}</pre>
              <button
                onClick={() => copy(item.cmd, idx)}
                className="flex-shrink-0 text-[10px] px-2.5 py-1 border border-border rounded-lg text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
              >
                {copiedIdx === idx ? '복사됨' : '복사'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Examples */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-text-primary">명령어 예시</p>
        <div className="space-y-2">
          {examples.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border">
              <div className="w-36 flex-shrink-0">
                <p className="text-[10px] text-text-muted font-semibold">{item.desc}</p>
              </div>
              <pre className="flex-1 text-xs font-mono text-green-400 bg-[#0d1117] px-3 py-2 rounded-lg overflow-x-auto">{item.cmd}</pre>
              <button
                onClick={() => copy(item.cmd, 100 + idx)}
                className="flex-shrink-0 text-[10px] px-2.5 py-1 border border-border rounded-lg text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
              >
                {copiedIdx === 100 + idx ? '복사됨' : '복사'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Command generator */}
      <CommandGenerator />
    </div>
  );
}

// ── Tab: 데스크탑 (Tauri) ──────────────────────────────────────────────────────
function DesktopTab() {
  const [isTauri, setIsTauri] = useState(false);
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState<Quality>('best');
  const [outputPath, setOutputPath] = useState('~/Downloads');
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsTauri(typeof window !== 'undefined' && '__TAURI__' in window);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleDownload = useCallback(async () => {
    if (!url.trim()) return;
    if (!isTauri) return;

    setStatus('running');
    setLogs(['다운로드를 시작합니다...']);

    try {
      const { Command } = await import('@tauri-apps/plugin-shell');
      const selectedQuality = QUALITY_OPTIONS.find(q => q.id === quality)!;
      const outputTemplate = `${outputPath}/%(title)s.%(ext)s`;

      let args: string[];
      if (quality === 'audio') {
        args = [url.trim(), '-x', '--audio-format', 'mp3', '-o', outputTemplate];
      } else {
        args = [url.trim(), '-f', selectedQuality.arg, '-o', outputTemplate];
      }

      const cmd = Command.create('yt-dlp', args);

      cmd.stdout.on('data', (line: string) => {
        setLogs(prev => [...prev, line]);
      });
      cmd.stderr.on('data', (line: string) => {
        setLogs(prev => [...prev, `[오류] ${line}`]);
      });

      const output = await cmd.execute();
      if (output.code === 0) {
        setStatus('done');
        setLogs(prev => [...prev, '✅ 다운로드 완료!']);
      } else {
        setStatus('error');
        setLogs(prev => [...prev, `❌ 오류 발생 (코드: ${output.code})`]);
      }
    } catch (e: unknown) {
      setStatus('error');
      setLogs(prev => [...prev, `❌ 오류: ${e instanceof Error ? e.message : String(e)}`]);
    }
  }, [url, quality, outputPath, isTauri]);

  if (!isTauri) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-4xl">🖥️</div>
        <p className="text-base font-semibold text-text-primary">데스크탑 앱에서만 사용 가능</p>
        <p className="text-sm text-text-muted text-center max-w-sm">
          이 기능은 NOAH 데스크탑 앱(Tauri)에서만 사용할 수 있습니다. 웹 브라우저에서는 보안 정책상 직접 실행이 불가능합니다.
        </p>
        <p className="text-xs text-text-muted text-center max-w-sm">
          안내 탭의 명령어 생성기를 사용하여 터미널에서 직접 실행하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">다운로드 URL</label>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors placeholder:text-text-muted"
          />
        </div>

        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">화질 / 형식</label>
          <div className="flex flex-wrap gap-2">
            {QUALITY_OPTIONS.map(q => (
              <button
                key={q.id}
                onClick={() => setQuality(q.id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  quality === q.id
                    ? 'bg-[#e94560] text-white'
                    : 'bg-border/40 text-text-muted hover:text-text-primary'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">저장 폴더</label>
          <input
            value={outputPath}
            onChange={e => setOutputPath(e.target.value)}
            className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors font-mono"
          />
        </div>

        <button
          onClick={handleDownload}
          disabled={status === 'running' || !url.trim()}
          className="px-6 py-3 bg-[#e94560] text-white rounded-xl text-sm font-bold hover:bg-[#d63b55] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === 'running' ? '다운로드 중...' : status === 'done' ? '✅ 완료' : '다운로드 시작'}
        </button>
      </div>

      {logs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">로그</p>
            <button
              onClick={() => { setLogs([]); setStatus('idle'); }}
              className="text-[10px] px-2.5 py-1 border border-border rounded-lg text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
            >
              지우기
            </button>
          </div>
          <div className="h-64 bg-[#0d1117] rounded-xl border border-border p-4 overflow-y-auto font-mono text-xs text-green-400 space-y-0.5">
            {logs.map((line, idx) => (
              <div key={idx} className={line.startsWith('❌') ? 'text-red-400' : line.startsWith('✅') ? 'text-green-300 font-bold' : ''}>
                {line}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Status badge */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          status === 'idle' ? 'bg-border' :
          status === 'running' ? 'bg-yellow-400 animate-pulse' :
          status === 'done' ? 'bg-green-400' :
          'bg-red-400'
        }`} />
        <span className="text-xs text-text-muted">
          {status === 'idle' ? '대기중' : status === 'running' ? '다운로드 중' : status === 'done' ? '완료' : '오류 발생'}
        </span>
      </div>
    </div>
  );
}

// ── Tab: 지원 사이트 ──────────────────────────────────────────────────────────
function SitesTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        yt-dlp는 1,000개 이상의 사이트를 지원합니다. 주요 사이트 목록:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {SUPPORTED_SITES.map((site, idx) => (
          <div key={idx} className="flex items-start gap-3 p-3.5 bg-background rounded-xl border border-border">
            <span className="text-xl flex-shrink-0">{site.icon}</span>
            <div>
              <p className="text-sm font-semibold text-text-primary">{site.name}</p>
              <p className="text-xs text-text-muted mt-0.5">{site.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-muted">
        전체 목록: <a href="https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md" target="_blank" rel="noopener noreferrer" className="text-[#e94560] hover:underline">yt-dlp 지원 사이트 목록 →</a>
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DownloaderPage() {
  const [tab, setTab] = useState<Tab>('guide');

  const TABS: { id: Tab; label: string }[] = [
    { id: 'guide', label: '안내' },
    { id: 'desktop', label: 'Tauri 데스크탑' },
    { id: 'sites', label: '지원 사이트' },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <span className="text-2xl">⬇️</span>
          <h2 className="text-2xl font-extrabold text-text-primary">미디어 다운로더</h2>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-border/30 rounded-xl w-fit mb-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.id
                  ? 'bg-background-card text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content card */}
        <div className="bg-background-card rounded-2xl border border-border p-6">
          {tab === 'guide' && <GuideTab />}
          {tab === 'desktop' && <DesktopTab />}
          {tab === 'sites' && <SitesTab />}
        </div>
      </div>

      <FloatingAIBar
        getAction={() => 'chat'}
        getContext={(text) => ({ page: 'downloader', userMessage: text })}
        onResult={async () => {}}
        placeholder="미디어 다운로드에 대해 AI에게 질문하세요..."
      />
    </div>
  );
}
