'use client';

import { useState, useRef, useCallback } from 'react';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

type Quality = 'best' | '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p' | 'audio';

const QUALITY_OPTIONS: { id: Quality; label: string; arg: string; badge?: string }[] = [
  { id: 'best',   label: '최고화질',    arg: 'bestvideo+bestaudio/best', badge: '추천' },
  { id: '2160p',  label: '4K (2160p)', arg: 'bestvideo[height<=2160]+bestaudio/best[height<=2160]' },
  { id: '1440p',  label: '2K (1440p)', arg: 'bestvideo[height<=1440]+bestaudio/best[height<=1440]' },
  { id: '1080p',  label: '1080p FHD',  arg: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]' },
  { id: '720p',   label: '720p HD',    arg: 'bestvideo[height<=720]+bestaudio/best[height<=720]' },
  { id: '480p',   label: '480p SD',    arg: 'bestvideo[height<=480]+bestaudio/best[height<=480]' },
  { id: '360p',   label: '360p',       arg: 'bestvideo[height<=360]+bestaudio/best[height<=360]' },
  { id: 'audio',  label: 'MP3 오디오', arg: '-x --audio-format mp3' },
];

interface VideoInfo {
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  view_count?: number;
  upload_date?: string;
  description?: string;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function DownloaderPage() {
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState<Quality>('best');
  const [outputPath, setOutputPath] = useState('~/Downloads');
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'ready' | 'downloading' | 'done' | 'error'>('idle');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (line: string) => setLogs(prev => [...prev, line]);

  const runShell = useCallback(async (program: string, args: string[]) => {
    try {
      const { Command } = await import('@tauri-apps/plugin-shell');
      return Command.create(program, args);
    } catch {
      throw new Error('NOAH 데스크탑 앱에서만 사용 가능합니다. 현재 환경에서는 shell 실행이 지원되지 않습니다.');
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setStatus('analyzing');
    setVideoInfo(null);
    setLogs([]);
    setErrorMsg('');

    try {
      const cmd = await runShell('yt-dlp', ['--dump-json', '--no-playlist', trimmed]);
      let jsonStr = '';

      cmd.stdout.on('data', (line: string) => { jsonStr += line; });
      cmd.stderr.on('data', (line: string) => {
        if (!line.includes('[download]')) addLog(line);
      });

      const result = await cmd.execute();

      if (result.code === 0 && jsonStr) {
        try {
          const info = JSON.parse(jsonStr) as VideoInfo;
          setVideoInfo(info);
          setStatus('ready');
        } catch {
          setVideoInfo(null);
          setStatus('ready');
        }
      } else {
        throw new Error('영상 정보를 가져올 수 없습니다. URL을 확인하세요.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg.includes('shell') ? msg : `yt-dlp 오류: ${msg}`);
      setStatus('error');
    }
  }, [url, runShell]);

  const handleDownload = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setStatus('downloading');
    setLogs(['⬇️ 다운로드를 시작합니다...']);
    setErrorMsg('');

    try {
      const selected = QUALITY_OPTIONS.find(q => q.id === quality)!;
      const outputTemplate = `${outputPath}/%(title)s.%(ext)s`;

      let args: string[];
      if (quality === 'audio') {
        args = [trimmed, '-x', '--audio-format', 'mp3', '-o', outputTemplate];
      } else {
        args = [trimmed, '-f', selected.arg, '-o', outputTemplate];
      }

      const cmd = await runShell('yt-dlp', args);
      cmd.stdout.on('data', (line: string) => {
        addLog(line);
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
      cmd.stderr.on('data', (line: string) => {
        addLog(`[info] ${line}`);
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });

      const result = await cmd.execute();
      if (result.code === 0) {
        setStatus('done');
        addLog('✅ 다운로드 완료!');
      } else {
        setStatus('error');
        addLog(`❌ 오류 (종료 코드: ${result.code})`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setStatus('error');
    }
  }, [url, quality, outputPath, runShell]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text.trim());
    } catch {
      // clipboard read failed
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setVideoInfo(null);
    setLogs([]);
    setErrorMsg('');
    setUrl('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⬇️</span>
            <div>
              <h2 className="text-2xl font-extrabold text-text-primary">미디어 다운로더</h2>
              <p className="text-xs text-text-muted mt-0.5">YouTube · Vimeo · TikTok · Instagram 등 1,000개+ 지원</p>
            </div>
          </div>
          {status !== 'idle' && (
            <button onClick={handleReset} className="text-xs text-text-muted hover:text-[#e94560] transition-colors">
              처음으로
            </button>
          )}
        </div>

        {/* URL Input Card */}
        <div className="bg-background-card border border-border rounded-2xl p-5 space-y-4">
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-2">영상 URL</label>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={e => { setUrl(e.target.value); setVideoInfo(null); setStatus('idle'); }}
                onKeyDown={e => { if (e.key === 'Enter') handleAnalyze(); }}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 px-4 py-3 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors placeholder:text-text-muted font-mono"
              />
              <button
                onClick={handlePaste}
                className="flex-shrink-0 px-4 py-2 rounded-xl bg-border/40 text-text-secondary text-sm font-semibold hover:bg-border transition-colors"
              >
                붙여넣기
              </button>
            </div>
          </div>

          {/* Analyze button */}
          {status === 'idle' && url.trim() && (
            <button
              onClick={handleAnalyze}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white text-sm font-bold hover:opacity-90 transition-opacity"
            >
              🔍 영상 정보 가져오기
            </button>
          )}

          {/* Analyzing spinner */}
          {status === 'analyzing' && (
            <div className="flex items-center justify-center gap-3 py-4">
              <span className="w-5 h-5 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-text-muted">영상 정보를 불러오는 중...</span>
            </div>
          )}

          {/* Error */}
          {status === 'error' && errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-xs text-red-400 font-semibold mb-1">오류 발생</p>
              <p className="text-xs text-red-300/80">{errorMsg}</p>
              {errorMsg.includes('데스크탑') && (
                <p className="text-xs text-text-muted mt-2">yt-dlp 설치: <code className="bg-border/40 px-1 rounded font-mono">winget install yt-dlp</code></p>
              )}
            </div>
          )}
        </div>

        {/* Video Info Card */}
        {videoInfo && (status === 'ready' || status === 'downloading' || status === 'done' || status === 'error') && (
          <div className="bg-background-card border border-border rounded-2xl p-5">
            <div className="flex gap-4">
              {videoInfo.thumbnail && (
                <div className="flex-shrink-0 w-32 h-20 rounded-xl overflow-hidden bg-border/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={videoInfo.thumbnail} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-bold text-text-primary line-clamp-2 leading-snug">{videoInfo.title}</p>
                <p className="text-xs text-text-muted">{videoInfo.uploader}</p>
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  {videoInfo.duration > 0 && <span>⏱ {formatDuration(videoInfo.duration)}</span>}
                  {videoInfo.view_count && videoInfo.view_count > 0 && <span>👁 {formatViews(videoInfo.view_count)}</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Download Settings */}
        {(status === 'ready' || status === 'downloading' || status === 'done') && (
          <div className="bg-background-card border border-border rounded-2xl p-5 space-y-5">
            {/* Quality */}
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-3">화질 / 형식</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {QUALITY_OPTIONS.map(q => (
                  <button
                    key={q.id}
                    onClick={() => setQuality(q.id)}
                    className={`relative px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left ${
                      quality === q.id
                        ? 'bg-[#e94560] text-white shadow-sm'
                        : 'bg-border/40 text-text-muted hover:text-text-primary hover:bg-border/60'
                    }`}
                  >
                    {q.label}
                    {q.badge && (
                      <span className={`ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        quality === q.id ? 'bg-white/20 text-white' : 'bg-[#e94560]/20 text-[#e94560]'
                      }`}>{q.badge}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Output path */}
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">저장 폴더</label>
              <input
                value={outputPath}
                onChange={e => setOutputPath(e.target.value)}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors font-mono"
              />
            </div>

            {/* Download button */}
            <button
              onClick={handleDownload}
              disabled={status === 'downloading'}
              className="w-full py-3.5 rounded-xl bg-[#e94560] text-white text-sm font-bold hover:bg-[#d63b55] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {status === 'downloading' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  다운로드 중...
                </>
              ) : status === 'done' ? (
                '✅ 완료 — 다시 다운로드'
              ) : (
                '⬇️ 다운로드 시작'
              )}
            </button>
          </div>
        )}

        {/* Log output */}
        {logs.length > 0 && (
          <div className="bg-background-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  status === 'downloading' ? 'bg-yellow-400 animate-pulse' :
                  status === 'done' ? 'bg-green-400' :
                  status === 'error' ? 'bg-red-400' : 'bg-border'
                }`} />
                <span className="text-xs font-semibold text-text-secondary">
                  {status === 'downloading' ? '다운로드 중' : status === 'done' ? '완료' : status === 'error' ? '오류' : '로그'}
                </span>
              </div>
              <button
                onClick={() => setLogs([])}
                className="text-[10px] px-2.5 py-1 border border-border rounded-lg text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
              >
                지우기
              </button>
            </div>
            <div className="h-52 bg-[#0d1117] rounded-xl border border-border p-4 overflow-y-auto font-mono text-xs space-y-0.5">
              {logs.map((line, idx) => (
                <div key={idx} className={
                  line.startsWith('❌') ? 'text-red-400' :
                  line.startsWith('✅') ? 'text-green-300 font-bold' :
                  line.includes('[download]') ? 'text-cyan-400' :
                  'text-green-400/80'
                }>
                  {line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Supported sites hint (only on idle with no URL) */}
        {status === 'idle' && !url.trim() && (
          <div className="bg-background-card border border-border rounded-2xl p-5">
            <p className="text-xs font-semibold text-text-secondary mb-3">지원 사이트</p>
            <div className="flex flex-wrap gap-2">
              {[
                ['▶️', 'YouTube'], ['🎬', 'Vimeo'], ['🐦', 'Twitter/X'],
                ['🎵', 'TikTok'], ['📸', 'Instagram'], ['🟣', 'Twitch'],
                ['📘', 'Facebook'], ['🔊', 'SoundCloud'], ['📺', 'Bilibili'],
              ].map(([icon, name]) => (
                <div key={name} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-background rounded-lg border border-border">
                  <span className="text-sm">{icon}</span>
                  <span className="text-xs text-text-secondary">{name}</span>
                </div>
              ))}
              <div className="flex items-center px-2.5 py-1.5 bg-background rounded-lg border border-border">
                <span className="text-xs text-text-muted">외 990개+</span>
              </div>
            </div>
            <p className="text-[11px] text-text-muted mt-3">
              ※ yt-dlp 설치 필요: <code className="bg-border/40 px-1 rounded">winget install yt-dlp</code> / <code className="bg-border/40 px-1 rounded">brew install yt-dlp</code>
            </p>
          </div>
        )}
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
