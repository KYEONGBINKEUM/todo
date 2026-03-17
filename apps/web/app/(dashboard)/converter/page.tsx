'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

type Tab = 'image' | 'pdf-to-image' | 'image-to-pdf' | 'compress';

interface ConvertedFile {
  url: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
}

// ── Drag & Drop Zone ──────────────────────────────────────────────────────────
function DropZone({
  onFiles,
  accept,
  multiple = false,
  label = '파일을 드래그하거나 클릭하여 선택',
  hint,
}: {
  onFiles: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
        dragging
          ? 'border-[#e94560] bg-[#e94560]/5'
          : 'border-border hover:border-[#e94560]/50 hover:bg-[#e94560]/3'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files || []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
      <div className="w-14 h-14 rounded-2xl bg-border/30 flex items-center justify-center text-3xl">
        📁
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
      </div>
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-text-muted">{label}</p>}
      <div className="h-2 bg-border/40 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#e94560] to-[#8b5cf6] rounded-full transition-all duration-300"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function triggerDownload(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Tab 1: 이미지 변환 ───────────────────────────────────────────────────────
function ImageConvertTab() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [format, setFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'>('image/jpeg');
  const [quality, setQuality] = useState(90);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ConvertedFile | null>(null);
  const [converting, setConverting] = useState(false);

  const handleFiles = (files: File[]) => {
    const f = files[0];
    if (!f || !f.type.startsWith('image/')) return;
    setFile(f);
    setResult(null);
    setProgress(0);
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const handleConvert = useCallback(async () => {
    if (!file) return;
    setConverting(true);
    setProgress(10);

    const img = new window.Image();
    img.src = URL.createObjectURL(file);
    await new Promise<void>(res => { img.onload = () => res(); });

    setProgress(40);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    setProgress(70);
    const ext = format.split('/')[1];
    const q = format === 'image/png' || format === 'image/gif' ? undefined : quality / 100;

    await new Promise<void>(resolve => {
      canvas.toBlob(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setResult({
            url,
            name: `converted.${ext}`,
            size: blob.size,
            width: canvas.width,
            height: canvas.height,
          });
        }
        resolve();
      }, format, q);
    });

    setProgress(100);
    setConverting(false);
  }, [file, format, quality]);

  const formatOptions: { value: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; label: string }[] = [
    { value: 'image/jpeg', label: 'JPG' },
    { value: 'image/png', label: 'PNG' },
    { value: 'image/webp', label: 'WebP' },
    { value: 'image/gif', label: 'GIF' },
  ];

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={handleFiles}
          accept="image/*"
          label="이미지 파일을 드래그하거나 클릭하여 선택"
          hint="JPG, PNG, WebP, GIF, BMP 지원"
        />
      ) : (
        <div className="space-y-4">
          {/* Preview */}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-40 h-40 rounded-xl border border-border overflow-hidden bg-checkerboard">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="preview" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm font-semibold text-text-primary truncate">{file.name}</p>
              <p className="text-xs text-text-muted">원본 크기: {formatSize(file.size)}</p>
              <p className="text-xs text-text-muted">타입: {file.type}</p>
              <button
                onClick={() => { setFile(null); setPreview(''); setResult(null); setProgress(0); }}
                className="text-xs text-[#e94560] hover:underline mt-2"
              >
                다른 파일 선택
              </button>
            </div>
          </div>

          {/* Settings */}
          <div className="p-4 bg-background rounded-2xl border border-border space-y-4">
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-2">변환 형식</p>
              <div className="flex gap-2 flex-wrap">
                {formatOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFormat(opt.value)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      format === opt.value
                        ? 'bg-[#e94560] text-white'
                        : 'bg-border/40 text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {(format === 'image/jpeg' || format === 'image/webp') && (
              <div>
                <div className="flex justify-between mb-1.5">
                  <p className="text-xs font-semibold text-text-secondary">품질</p>
                  <span className="text-xs text-[#e94560] font-bold">{quality}%</span>
                </div>
                <input
                  type="range" min={1} max={100} value={quality}
                  onChange={e => setQuality(Number(e.target.value))}
                  className="w-full accent-[#e94560]"
                />
              </div>
            )}
          </div>

          {progress > 0 && progress < 100 && <ProgressBar value={progress} label="변환 중..." />}

          <div className="flex gap-3">
            <button
              onClick={handleConvert}
              disabled={converting}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white text-sm font-bold disabled:opacity-50 transition-opacity"
            >
              {converting ? '변환 중...' : '변환하기'}
            </button>
            {result && (
              <button
                onClick={() => triggerDownload(result.url, result.name)}
                className="flex-1 py-3 rounded-xl bg-border/40 text-text-primary text-sm font-bold text-center hover:bg-border transition-colors"
              >
                다운로드 ({formatSize(result.size)})
              </button>
            )}
          </div>

          {result && (
            <div className="p-3 bg-[#e94560]/5 border border-[#e94560]/20 rounded-xl">
              <p className="text-xs text-text-secondary">
                변환 완료: {result.width} × {result.height}px · {formatSize(result.size)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab 2: PDF → 이미지 ─────────────────────────────────────────────────────
function PdfToImageTab() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [imgFormat, setImgFormat] = useState<'image/jpeg' | 'image/png'>('image/jpeg');

  const handleFiles = (files: File[]) => {
    const f = files[0];
    if (!f || f.type !== 'application/pdf') {
      setError('PDF 파일만 지원합니다.');
      return;
    }
    setFile(f);
    setPages([]);
    setError('');
    setProgress(0);
  };

  const handleRender = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setPages([]);
    setProgress(5);

    try {
      // Dynamic import pdfjs from CDN
      const pdfjs = await import(
        /* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.mjs' as string
      ) as {
        GlobalWorkerOptions: { workerSrc: string };
        getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<{
          numPages: number;
          getPage: (n: number) => Promise<{
            getViewport: (opts: { scale: number }) => { width: number; height: number };
            render: (ctx: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
          }>;
        }> };
      };
      pdfjs.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.mjs';

      const arrayBuffer = await file.arrayBuffer();
      setProgress(20);

      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      const rendered: string[] = [];

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        rendered.push(canvas.toDataURL(imgFormat, 0.92));
        setProgress(20 + Math.round((i / totalPages) * 75));
      }

      setPages(rendered);
      setProgress(100);
    } catch (err) {
      console.error(err);
      setError('PDF 변환 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, [file, imgFormat]);

  const downloadPage = (dataUrl: string, index: number) => {
    const ext = imgFormat === 'image/jpeg' ? 'jpg' : 'png';
    triggerDownload(dataUrl, `page-${index + 1}.${ext}`);
  };

  const downloadAll = () => {
    pages.forEach((url, i) => downloadPage(url, i));
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={handleFiles}
          accept="application/pdf"
          label="PDF 파일을 드래그하거나 클릭하여 선택"
          hint="각 페이지를 이미지로 변환합니다"
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border">
            <span className="text-2xl">📄</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{file.name}</p>
              <p className="text-xs text-text-muted">{formatSize(file.size)}</p>
            </div>
            <button
              onClick={() => { setFile(null); setPages([]); setProgress(0); setError(''); }}
              className="text-xs text-[#e94560] hover:underline flex-shrink-0"
            >
              변경
            </button>
          </div>

          <div className="flex gap-3 items-center">
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-1.5">이미지 형식</p>
              <div className="flex gap-2">
                {(['image/jpeg', 'image/png'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setImgFormat(f)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      imgFormat === f ? 'bg-[#e94560] text-white' : 'bg-border/40 text-text-secondary hover:bg-border'
                    }`}
                  >
                    {f === 'image/jpeg' ? 'JPG' : 'PNG'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
              {error}
            </div>
          )}

          {loading && <ProgressBar value={progress} label="PDF 렌더링 중..." />}

          <div className="flex gap-3">
            <button
              onClick={handleRender}
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white text-sm font-bold disabled:opacity-50"
            >
              {loading ? '변환 중...' : '이미지로 변환'}
            </button>
            {pages.length > 1 && (
              <button
                onClick={downloadAll}
                className="flex-1 py-3 rounded-xl bg-border/40 text-text-primary text-sm font-bold hover:bg-border transition-colors"
              >
                전체 다운로드 ({pages.length}페이지)
              </button>
            )}
          </div>

          {pages.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-text-secondary">{pages.length}개 페이지 변환 완료</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {pages.map((url, i) => (
                  <div key={i} className="group relative rounded-xl border border-border overflow-hidden bg-background">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Page ${i + 1}`} className="w-full object-contain" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={() => downloadPage(url, i)}
                        className="px-3 py-1.5 bg-[#e94560] text-white text-xs rounded-lg font-semibold"
                      >
                        다운로드
                      </button>
                    </div>
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] rounded-lg">
                      {i + 1}페이지
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab 3: 이미지 → PDF ──────────────────────────────────────────────────────
function ImageToPdfTab() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [converting, setConverting] = useState(false);

  const handleFiles = (newFiles: File[]) => {
    const imgs = newFiles.filter(f => f.type.startsWith('image/'));
    setFiles(prev => [...prev, ...imgs]);
    imgs.forEach(f => {
      const url = URL.createObjectURL(f);
      setPreviews(prev => [...prev, url]);
    });
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    const newFiles = [...files];
    const newPreviews = [...previews];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= files.length) return;
    [newFiles[index], newFiles[target]] = [newFiles[target], newFiles[index]];
    [newPreviews[index], newPreviews[target]] = [newPreviews[target], newPreviews[index]];
    setFiles(newFiles);
    setPreviews(newPreviews);
  };

  const handleConvert = useCallback(async () => {
    if (!files.length) return;
    setConverting(true);

    // Open a print window with all images, one per page
    const win = window.open('', '_blank');
    if (!win) {
      alert('팝업이 차단되었습니다. 팝업을 허용하고 다시 시도해주세요.');
      setConverting(false);
      return;
    }

    const imageDataUrls: string[] = [];
    for (const file of files) {
      const url = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
      imageDataUrls.push(url);
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>이미지를 PDF로</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: white; }
  .page {
    page-break-after: always;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .page:last-child { page-break-after: avoid; }
  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  @media print {
    .page { page-break-after: always; }
    .page:last-child { page-break-after: avoid; }
  }
</style>
</head>
<body>
${imageDataUrls.map(url => `<div class="page"><img src="${url}" /></div>`).join('\n')}
<script>
  window.onload = function() {
    setTimeout(function() { window.print(); }, 500);
  };
</script>
</body>
</html>`;

    win.document.write(html);
    win.document.close();
    setConverting(false);
  }, [files]);

  return (
    <div className="space-y-5">
      <DropZone
        onFiles={handleFiles}
        accept="image/*"
        multiple
        label="이미지 파일들을 드래그하거나 클릭하여 선택"
        hint="여러 이미지를 선택하면 페이지 순서대로 PDF에 포함됩니다"
      />

      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-text-secondary">{files.length}개 이미지 선택됨</p>
            <button
              onClick={() => { setFiles([]); setPreviews([]); }}
              className="text-xs text-[#e94560] hover:underline"
            >
              전체 삭제
            </button>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 bg-background rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previews[i]} alt={f.name} className="w-12 h-12 object-contain rounded-lg border border-border flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">{f.name}</p>
                  <p className="text-[10px] text-text-muted">{formatSize(f.size)}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => moveFile(i, 'up')}
                    disabled={i === 0}
                    className="w-6 h-6 flex items-center justify-center rounded-lg bg-border/40 text-text-muted disabled:opacity-30 hover:bg-border text-xs"
                  >↑</button>
                  <button
                    onClick={() => moveFile(i, 'down')}
                    disabled={i === files.length - 1}
                    className="w-6 h-6 flex items-center justify-center rounded-lg bg-border/40 text-text-muted disabled:opacity-30 hover:bg-border text-xs"
                  >↓</button>
                  <button
                    onClick={() => removeFile(i)}
                    className="w-6 h-6 flex items-center justify-center rounded-lg bg-[#e94560]/10 text-[#e94560] hover:bg-[#e94560]/20 text-xs"
                  >×</button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-border/20 rounded-xl">
            <p className="text-[11px] text-text-muted">
              💡 브라우저의 인쇄 대화창이 열립니다. &quot;대상&quot;을 &quot;PDF로 저장&quot;으로 선택하세요.
            </p>
          </div>

          <button
            onClick={handleConvert}
            disabled={converting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white text-sm font-bold disabled:opacity-50"
          >
            {converting ? '준비 중...' : 'PDF로 변환 (인쇄 창 열기)'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: 압축/리사이즈 ─────────────────────────────────────────────────────
function CompressTab() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [origDimensions, setOrigDimensions] = useState({ w: 0, h: 0 });
  const [quality, setQuality] = useState(80);
  const [maxWidth, setMaxWidth] = useState('');
  const [maxHeight, setMaxHeight] = useState('');
  const [keepAspect, setKeepAspect] = useState(true);
  const [result, setResult] = useState<ConvertedFile | null>(null);
  const [resultPreview, setResultPreview] = useState('');
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFiles = (files: File[]) => {
    const f = files[0];
    if (!f || !f.type.startsWith('image/')) return;
    setFile(f);
    setResult(null);
    setResultPreview('');
    setProgress(0);
    const url = URL.createObjectURL(f);
    setPreview(url);
    const img = new window.Image();
    img.onload = () => {
      setOrigDimensions({ w: img.naturalWidth, h: img.naturalHeight });
      setMaxWidth(String(img.naturalWidth));
      setMaxHeight(String(img.naturalHeight));
    };
    img.src = url;
  };

  const handleWidthChange = (val: string) => {
    setMaxWidth(val);
    if (keepAspect && origDimensions.w > 0 && val) {
      const ratio = origDimensions.h / origDimensions.w;
      setMaxHeight(String(Math.round(Number(val) * ratio)));
    }
  };

  const handleHeightChange = (val: string) => {
    setMaxHeight(val);
    if (keepAspect && origDimensions.h > 0 && val) {
      const ratio = origDimensions.w / origDimensions.h;
      setMaxWidth(String(Math.round(Number(val) * ratio)));
    }
  };

  const handleCompress = useCallback(async () => {
    if (!file) return;
    setConverting(true);
    setProgress(20);

    const img = new window.Image();
    img.src = URL.createObjectURL(file);
    await new Promise<void>(res => { img.onload = () => res(); });

    const targetW = maxWidth ? Math.min(Number(maxWidth), img.naturalWidth) : img.naturalWidth;
    const targetH = maxHeight ? Math.min(Number(maxHeight), img.naturalHeight) : img.naturalHeight;

    setProgress(50);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    setProgress(75);
    await new Promise<void>(resolve => {
      canvas.toBlob(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setResultPreview(url);
          setResult({
            url,
            name: `compressed_${file.name.replace(/\.[^.]+$/, '')}.jpg`,
            size: blob.size,
            width: targetW,
            height: targetH,
          });
        }
        resolve();
      }, 'image/jpeg', quality / 100);
    });

    setProgress(100);
    setConverting(false);
  }, [file, quality, maxWidth, maxHeight]);

  const savings = result ? Math.max(0, Math.round((1 - result.size / file!.size) * 100)) : 0;

  const ic = "w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors";

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={handleFiles}
          accept="image/*"
          label="이미지를 드래그하거나 클릭하여 선택"
          hint="압축 및 크기 조정을 합니다"
        />
      ) : (
        <div className="space-y-4">
          {/* Before / After */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-text-secondary text-center">원본</p>
              <div className="rounded-xl border border-border overflow-hidden bg-background aspect-square flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="original" className="max-w-full max-h-full object-contain" />
              </div>
              <p className="text-[10px] text-text-muted text-center">
                {origDimensions.w}×{origDimensions.h} · {formatSize(file.size)}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-text-secondary text-center">결과</p>
              <div className="rounded-xl border border-border overflow-hidden bg-background aspect-square flex items-center justify-center">
                {resultPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resultPreview} alt="result" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-text-muted text-3xl">🖼️</span>
                )}
              </div>
              {result && (
                <p className="text-[10px] text-center">
                  <span className="text-text-muted">{result.width}×{result.height} · {formatSize(result.size)}</span>
                  {savings > 0 && <span className="text-green-500 font-bold ml-1">-{savings}%</span>}
                </p>
              )}
            </div>
          </div>

          {/* Settings */}
          <div className="p-4 bg-background rounded-2xl border border-border space-y-4">
            <div>
              <div className="flex justify-between mb-1.5">
                <p className="text-xs font-semibold text-text-secondary">품질 (JPG)</p>
                <span className="text-xs text-[#e94560] font-bold">{quality}%</span>
              </div>
              <input
                type="range" min={1} max={100} value={quality}
                onChange={e => setQuality(Number(e.target.value))}
                className="w-full accent-[#e94560]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-text-secondary">크기 조정</p>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox" checked={keepAspect}
                    onChange={e => setKeepAspect(e.target.checked)}
                    className="accent-[#e94560]"
                  />
                  <span className="text-xs text-text-muted">비율 유지</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-text-muted block mb-1">너비 (px)</label>
                  <input
                    value={maxWidth}
                    onChange={e => handleWidthChange(e.target.value)}
                    type="number"
                    min={1}
                    className={ic}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted block mb-1">높이 (px)</label>
                  <input
                    value={maxHeight}
                    onChange={e => handleHeightChange(e.target.value)}
                    type="number"
                    min={1}
                    className={ic}
                  />
                </div>
              </div>
            </div>
          </div>

          {progress > 0 && progress < 100 && <ProgressBar value={progress} label="처리 중..." />}

          <div className="flex gap-3">
            <button
              onClick={() => { setFile(null); setPreview(''); setResult(null); setResultPreview(''); setProgress(0); }}
              className="px-4 py-3 rounded-xl bg-border/40 text-text-secondary text-sm font-semibold hover:bg-border transition-colors"
            >
              초기화
            </button>
            <button
              onClick={handleCompress}
              disabled={converting}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white text-sm font-bold disabled:opacity-50"
            >
              {converting ? '처리 중...' : '압축/리사이즈'}
            </button>
            {result && (
              <button
                onClick={() => triggerDownload(result.url, result.name)}
                className="flex-1 py-3 rounded-xl bg-border/40 text-text-primary text-sm font-bold text-center hover:bg-border transition-colors"
              >
                다운로드
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const TABS: { id: Tab; icon: string; label: string; desc: string }[] = [
  { id: 'image', icon: '🖼️', label: '이미지 변환', desc: 'JPG·PNG·WebP' },
  { id: 'pdf-to-image', icon: '📄', label: 'PDF→이미지', desc: '페이지별 변환' },
  { id: 'image-to-pdf', icon: '📑', label: '이미지→PDF', desc: '여러 장 합치기' },
  { id: 'compress', icon: '🗜️', label: '압축/리사이즈', desc: '크기·품질 조정' },
];

export default function ConverterPage() {
  const [activeTab, setActiveTab] = useState<Tab>('image');

  const activeTabDef = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-28">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <span className="text-2xl">📁</span>
          <h2 className="text-2xl font-extrabold text-text-primary">파일 변환기</h2>
        </div>

        <div className="flex gap-5">
          {/* Sidebar Tabs */}
          <div className="w-40 flex-shrink-0">
            <p className="text-[10px] text-text-muted uppercase tracking-widest font-semibold px-1 mb-2">변환 도구</p>
            <nav className="space-y-0.5">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                    activeTab === tab.id
                      ? 'bg-[#e94560]/10 text-[#e94560] border border-[#e94560]/20'
                      : 'hover:bg-border/30 text-text-secondary border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm w-5 text-center flex-shrink-0">{tab.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold truncate ${activeTab === tab.id ? 'text-[#e94560]' : 'text-text-primary'}`}>
                        {tab.label}
                      </p>
                      <p className="text-[10px] text-text-muted truncate">{tab.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          {/* Content Card */}
          <div className="flex-1 min-w-0 bg-background-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
              <span>{activeTabDef.icon}</span>
              <h3 className="text-sm font-bold text-text-primary">{activeTabDef.label}</h3>
              <span className="text-[11px] text-text-muted ml-1">{activeTabDef.desc}</span>
            </div>
            <div className="p-5">
              {activeTab === 'image' && <ImageConvertTab />}
              {activeTab === 'pdf-to-image' && <PdfToImageTab />}
              {activeTab === 'image-to-pdf' && <ImageToPdfTab />}
              {activeTab === 'compress' && <CompressTab />}
            </div>
          </div>
        </div>
      </div>

      <FloatingAIBar
        commands={[
          { label: '변환 도움말', icon: '❓', desc: '변환 기능 사용 방법 안내', action: 'chat' },
          { label: '지원 형식', icon: '📋', desc: '지원하는 파일 형식 목록', action: 'chat' },
        ]}
        getContext={(text) => ({
          page: 'file-converter',
          activeTab,
          userMessage: text,
        })}
        getAction={() => 'chat'}
        placeholder="파일 변환에 대해 질문하세요..."
      />
    </div>
  );
}
