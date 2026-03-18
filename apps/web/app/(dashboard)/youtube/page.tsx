'use client';

import { useState, useCallback } from 'react';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

type Tab = 'thumbnail' | 'info' | 'batch';

interface ThumbnailQuality {
  key: string;
  label: string;
  resolution: string;
}

const THUMBNAIL_QUALITIES: ThumbnailQuality[] = [
  { key: 'maxresdefault', label: 'Max Resolution', resolution: '1280×720' },
  { key: 'sddefault', label: 'SD Default', resolution: '640×480' },
  { key: 'hqdefault', label: 'HQ Default', resolution: '480×360' },
  { key: 'mqdefault', label: 'MQ Default', resolution: '320×180' },
  { key: 'default', label: 'Default', resolution: '120×90' },
];

function parseYouTubeId(input: string): string | null {
  input = input.trim();
  // Full URL patterns
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
}

function parseVimeoId(input: string): string | null {
  const m = input.match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}

function isVimeoUrl(input: string): boolean {
  return input.includes('vimeo.com');
}

interface OEmbedInfo {
  title: string;
  author_name: string;
  thumbnail_url: string;
  width: number;
  height: number;
  html: string;
  provider_name?: string;
}

// ── 공통 다운로드 함수 (CORS 우회, Tauri plugin-http 사용) ─────────────────────
async function downloadImage(url: string, filename: string) {
  try {
    let blob: Blob;
    try {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      const res = await tauriFetch(url);
      blob = await res.blob();
    } catch {
      const res = await fetch(url);
      blob = await res.blob();
    }
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
  } catch {
    window.open(url, '_blank');
  }
}

// ── Tab: 썸네일 추출 ──────────────────────────────────────────────────────────
function ThumbnailTab() {
  const [input, setInput] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [vimeoId, setVimeoId] = useState<string | null>(null);
  const [vimeoThumb, setVimeoThumb] = useState<string | null>(null);
  const [vimeoLoading, setVimeoLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [error, setError] = useState('');

  const handleExtract = useCallback(async () => {
    setError('');
    setVideoId(null);
    setVimeoId(null);
    setVimeoThumb(null);

    if (isVimeoUrl(input)) {
      const vid = parseVimeoId(input);
      if (!vid) { setError('유효한 Vimeo URL이 아닙니다.'); return; }
      setVimeoId(vid);
      setVimeoLoading(true);
      try {
        const res = await fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${vid}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setVimeoThumb(data.thumbnail_url ?? null);
      } catch {
        setError('Vimeo 썸네일을 가져오지 못했습니다.');
      } finally {
        setVimeoLoading(false);
      }
    } else {
      const id = parseYouTubeId(input);
      if (!id) { setError('유효한 YouTube URL 또는 ID가 아닙니다.'); return; }
      setVideoId(id);
    }
  }, [input]);

  const handleDownload = useCallback((url: string, filename: string) => {
    return downloadImage(url, filename);
  }, []);

  const handleCopyUrl = useCallback((url: string, key: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1500);
    });
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleExtract()}
          placeholder="YouTube URL 또는 비디오 ID (Vimeo URL도 지원)"
          className="flex-1 px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors placeholder:text-text-muted"
        />
        <button
          onClick={handleExtract}
          className="px-5 py-2.5 bg-[#e94560] text-white rounded-xl text-sm font-semibold hover:bg-[#d63b55] transition-colors"
        >
          추출
        </button>
      </div>

      {error && (
        <p className="text-sm text-[#e94560] bg-[#e94560]/10 px-4 py-2.5 rounded-xl border border-[#e94560]/20">{error}</p>
      )}

      {/* YouTube thumbnails */}
      {videoId && (
        <div className="space-y-3">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-wider">Video ID: <span className="text-text-primary font-mono">{videoId}</span></p>
          <div className="grid gap-4">
            {THUMBNAIL_QUALITIES.map(q => {
              const url = `https://img.youtube.com/vi/${videoId}/${q.key}.jpg`;
              return (
                <div key={q.key} className="bg-background rounded-xl border border-border p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <div className="relative w-40 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-border/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={q.label}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{q.label}</p>
                    <p className="text-xs text-text-muted mt-0.5">{q.resolution}</p>
                    <p className="text-[10px] text-text-muted font-mono mt-1 break-all">{url}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleCopyUrl(url, q.key)}
                      className="px-3 py-1.5 text-xs border border-border rounded-lg text-text-secondary hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
                    >
                      {copiedKey === q.key ? '복사됨' : 'URL 복사'}
                    </button>
                    <button
                      onClick={() => handleDownload(url, `${videoId}_${q.key}.jpg`)}
                      className="px-3 py-1.5 text-xs bg-[#e94560]/10 text-[#e94560] border border-[#e94560]/20 rounded-lg hover:bg-[#e94560]/20 transition-colors font-semibold"
                    >
                      다운로드
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vimeo thumbnail */}
      {vimeoId && (
        <div className="space-y-3">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-wider">Vimeo ID: <span className="text-text-primary font-mono">{vimeoId}</span></p>
          {vimeoLoading && <p className="text-sm text-text-muted">로딩 중...</p>}
          {vimeoThumb && (
            <div className="bg-background rounded-xl border border-border p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="relative w-40 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-border/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={vimeoThumb} alt="Vimeo thumbnail" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary">Vimeo 썸네일</p>
                <p className="text-[10px] text-text-muted font-mono mt-1 break-all">{vimeoThumb}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleCopyUrl(vimeoThumb, 'vimeo')}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg text-text-secondary hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
                >
                  {copiedKey === 'vimeo' ? '복사됨' : 'URL 복사'}
                </button>
                <button
                  onClick={() => handleDownload(vimeoThumb, `vimeo_${vimeoId}.jpg`)}
                  className="px-3 py-1.5 text-xs bg-[#e94560]/10 text-[#e94560] border border-[#e94560]/20 rounded-lg hover:bg-[#e94560]/20 transition-colors font-semibold"
                >
                  다운로드
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab: 영상 정보 ─────────────────────────────────────────────────────────────
function InfoTab() {
  const [input, setInput] = useState('');
  const [info, setInfo] = useState<OEmbedInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const handleFetch = useCallback(async () => {
    setError('');
    setInfo(null);
    const trimmed = input.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      let oembedUrl: string;
      if (isVimeoUrl(trimmed)) {
        oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(trimmed)}`;
      } else {
        const id = parseYouTubeId(trimmed);
        if (!id) { setError('유효한 YouTube/Vimeo URL이 아닙니다.'); setLoading(false); return; }
        oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
      }
      const res = await fetch(oembedUrl);
      if (!res.ok) throw new Error('정보를 가져오지 못했습니다.');
      const data: OEmbedInfo = await res.json();
      setInfo(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '정보를 가져오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [input]);

  const copyEmbed = () => {
    if (!info) return;
    navigator.clipboard.writeText(info.html).then(() => {
      setCopiedEmbed(true);
      setTimeout(() => setCopiedEmbed(false), 1500);
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleFetch()}
          placeholder="YouTube 또는 Vimeo URL 입력"
          className="flex-1 px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors placeholder:text-text-muted"
        />
        <button
          onClick={handleFetch}
          disabled={loading}
          className="px-5 py-2.5 bg-[#e94560] text-white rounded-xl text-sm font-semibold hover:bg-[#d63b55] transition-colors disabled:opacity-60"
        >
          {loading ? '로딩...' : '조회'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-[#e94560] bg-[#e94560]/10 px-4 py-2.5 rounded-xl border border-[#e94560]/20">{error}</p>
      )}

      {info && (
        <div className="space-y-4">
          {/* Thumbnail + basic info */}
          <div className="bg-background rounded-xl border border-border p-5 flex flex-col sm:flex-row gap-5">
            <div className="w-full sm:w-48 flex-shrink-0 rounded-xl overflow-hidden bg-border/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={info.thumbnail_url} alt={info.title} className="w-full h-auto" />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">제목</p>
                <p className="text-base font-bold text-text-primary">{info.title}</p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">채널 / 작성자</p>
                <p className="text-sm text-text-primary">{info.author_name}</p>
              </div>
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">너비</p>
                  <p className="text-sm text-text-primary font-mono">{info.width}px</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">높이</p>
                  <p className="text-sm text-text-primary font-mono">{info.height}px</p>
                </div>
              </div>
            </div>
          </div>

          {/* Embed code */}
          <div className="bg-background rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">임베드 코드</p>
              <button
                onClick={copyEmbed}
                className="px-3 py-1 text-xs border border-border rounded-lg text-text-secondary hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
              >
                {copiedEmbed ? '복사됨 ✓' : '복사'}
              </button>
            </div>
            <pre className="text-[11px] text-text-muted font-mono bg-background-card rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border border-border">
              {info.html}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: 일괄 썸네일 ──────────────────────────────────────────────────────────
function BatchTab() {
  const [textarea, setTextarea] = useState('');
  const [videoIds, setVideoIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const handleExtractAll = useCallback(() => {
    setError('');
    const lines = textarea.split('\n').map(l => l.trim()).filter(Boolean);
    const ids: string[] = [];
    const failed: string[] = [];
    for (const line of lines) {
      const id = parseYouTubeId(line);
      if (id) ids.push(id);
      else failed.push(line);
    }
    if (ids.length === 0) { setError('유효한 YouTube URL을 찾지 못했습니다.'); return; }
    if (failed.length > 0) setError(`${failed.length}개 항목을 파싱할 수 없었습니다.`);
    setVideoIds(ids);
  }, [textarea]);

  const handleDownloadAll = useCallback(async () => {
    setDownloading(true);
    for (const id of videoIds) {
      const url = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
      await downloadImage(url, `${id}_maxres.jpg`);
      await new Promise(r => setTimeout(r, 300));
    }
    setDownloading(false);
  }, [videoIds]);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-xs text-text-muted font-semibold uppercase tracking-wider">YouTube URL 목록 (한 줄에 하나)</label>
        <textarea
          value={textarea}
          onChange={e => setTextarea(e.target.value)}
          placeholder={`https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://youtu.be/abcdefghijk\n...`}
          rows={5}
          className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors placeholder:text-text-muted resize-none font-mono"
        />
      </div>
      <button
        onClick={handleExtractAll}
        className="px-5 py-2.5 bg-[#e94560] text-white rounded-xl text-sm font-semibold hover:bg-[#d63b55] transition-colors"
      >
        일괄 추출
      </button>

      {error && (
        <p className="text-sm text-[#e94560] bg-[#e94560]/10 px-4 py-2.5 rounded-xl border border-[#e94560]/20">{error}</p>
      )}

      {videoIds.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">{videoIds.length}개 영상</p>
            <button
              onClick={handleDownloadAll}
              disabled={downloading}
              className="px-4 py-2 bg-[#e94560] text-white rounded-xl text-sm font-semibold hover:bg-[#d63b55] transition-colors disabled:opacity-60"
            >
              {downloading ? '다운로드 중...' : '모두 다운로드 (Max)'}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {videoIds.map((id, idx) => {
              const url = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
              const maxUrl = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
              return (
                <div key={idx} className="bg-background rounded-xl border border-border overflow-hidden group">
                  <div className="relative aspect-video bg-border/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={id}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2 space-y-1.5">
                    <p className="text-[10px] text-text-muted font-mono truncate">{id}</p>
                    <button
                      onClick={() => downloadImage(maxUrl, `${id}_maxres.jpg`)}
                      className="w-full text-[10px] py-1 bg-[#e94560]/10 text-[#e94560] rounded-lg hover:bg-[#e94560]/20 transition-colors font-semibold"
                    >
                      다운로드
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function YouTubePage() {
  const [tab, setTab] = useState<Tab>('thumbnail');

  const TABS: { id: Tab; label: string }[] = [
    { id: 'thumbnail', label: '썸네일 추출' },
    { id: 'info', label: '영상 정보' },
    { id: 'batch', label: '일괄 추출' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-2 flex items-center gap-3">
          <span className="text-2xl">🎬</span>
          <h2 className="text-2xl font-extrabold text-text-primary">유튜브 도구</h2>
        </div>

        {/* Disclaimer */}
        <div className="mb-5 px-4 py-2.5 bg-border/30 border border-border rounded-xl">
          <p className="text-xs text-text-muted">⚠️ 썸네일은 공개 URL에서 직접 추출됩니다. 저작권에 유의하세요.</p>
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
          {tab === 'thumbnail' && <ThumbnailTab />}
          {tab === 'info' && <InfoTab />}
          {tab === 'batch' && <BatchTab />}
        </div>
      </div>

      <FloatingAIBar
        getAction={() => 'chat'}
        getContext={(text) => ({ page: 'youtube', userMessage: text })}
        onResult={async () => {}}
        placeholder="YouTube 도구에 대해 AI에게 질문하세요..."
      />
    </div>
  );
}
