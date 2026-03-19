'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

type Tab = 'generate' | 'style' | 'barcode' | 'scan';
type ECLevel = 'L' | 'M' | 'Q' | 'H';
type BarcodeType = 'code128' | 'qr';

// ── QR 생성 Tab ───────────────────────────────────────────────────────────────
function GenerateTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState('https://');
  const [size, setSize] = useState(256);
  const [ecLevel, setEcLevel] = useState<ECLevel>('M');
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const generate = useCallback(async () => {
    if (!text.trim() || !canvasRef.current) return;
    setError('');
    try {
      await QRCode.toCanvas(canvasRef.current, text.trim(), {
        width: size,
        margin: 2,
        color: { dark: fgColor, light: bgColor },
        errorCorrectionLevel: ecLevel,
      });
      setGenerated(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'QR 생성 실패');
    }
  }, [text, size, ecLevel, fgColor, bgColor]);

  useEffect(() => {
    if (text.trim().length > 0) {
      const t = setTimeout(() => generate(), 400);
      return () => clearTimeout(t);
    }
  }, [text, size, ecLevel, fgColor, bgColor, generate]);

  const downloadPNG = () => {
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/png');
    a.download = 'qrcode.png';
    a.click();
  };

  const downloadSVG = async () => {
    if (!text.trim()) return;
    try {
      const svg = await QRCode.toString(text.trim(), {
        type: 'svg',
        width: size,
        margin: 2,
        color: { dark: fgColor, light: bgColor },
        errorCorrectionLevel: ecLevel,
      });
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qrcode.svg';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'SVG 생성 실패');
    }
  };

  const copyToClipboard = async () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        setCopied(false);
      }
    });
  };

  const EC_LEVELS: { id: ECLevel; label: string; desc: string }[] = [
    { id: 'L', label: 'L', desc: '7%' },
    { id: 'M', label: 'M', desc: '15%' },
    { id: 'Q', label: 'Q', desc: '25%' },
    { id: 'H', label: 'H', desc: '30%' },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Settings */}
      <div className="flex-1 space-y-4">
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">텍스트 / URL</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors placeholder:text-text-muted resize-none"
            placeholder="QR코드로 인코딩할 텍스트나 URL"
          />
        </div>

        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">크기</label>
          <div className="flex gap-2">
            {[128, 256, 512].map(s => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                  size === s ? 'bg-[#e94560] text-white' : 'bg-border/40 text-text-muted hover:text-text-primary'
                }`}
              >
                {s}px
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">오류 수정 레벨</label>
          <div className="flex gap-2">
            {EC_LEVELS.map(ec => (
              <button
                key={ec.id}
                onClick={() => setEcLevel(ec.id)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                  ecLevel === ec.id ? 'bg-[#e94560] text-white' : 'bg-border/40 text-text-muted hover:text-text-primary'
                }`}
                title={`복원율 ${ec.desc}`}
              >
                {ec.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-text-muted mt-1">현재: {EC_LEVELS.find(e => e.id === ecLevel)?.desc} 복원율</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">전경색 (QR 점)</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-xl">
              <input type="color" value={fgColor} onChange={e => setFgColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0" />
              <span className="text-sm font-mono text-text-primary">{fgColor}</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">배경색</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-xl">
              <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0" />
              <span className="text-sm font-mono text-text-primary">{bgColor}</span>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-[#e94560]">{error}</p>}
      </div>

      {/* Preview */}
      <div className="flex flex-col items-center gap-4">
        <div className="p-4 bg-white rounded-2xl shadow-lg border border-border" style={{ width: 288, height: 288, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated', width: 256, height: 256 }} />
        </div>

        {generated && (
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={downloadPNG}
              className="px-4 py-2 bg-[#e94560] text-white rounded-xl text-sm font-semibold hover:bg-[#d63b55] transition-colors"
            >
              PNG 다운로드
            </button>
            <button
              onClick={downloadSVG}
              className="px-4 py-2 bg-[#e94560]/10 text-[#e94560] border border-[#e94560]/20 rounded-xl text-sm font-semibold hover:bg-[#e94560]/20 transition-colors"
            >
              SVG 다운로드
            </button>
            <button
              onClick={copyToClipboard}
              className="px-4 py-2 border border-border text-text-secondary rounded-xl text-sm font-semibold hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
            >
              {copied ? '복사됨 ✓' : '클립보드 복사'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── QR 스타일 Tab ─────────────────────────────────────────────────────────────
function StyleTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('https://');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [gradFrom, setGradFrom] = useState('#e94560');
  const [gradTo, setGradTo] = useState('#000000');
  const [useGradient, setUseGradient] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState('');

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const generate = useCallback(async () => {
    if (!text.trim() || !canvasRef.current) return;
    setError('');
    const canvas = canvasRef.current;
    const size = 256;

    try {
      // Generate QR to canvas first
      await QRCode.toCanvas(canvas, text.trim(), {
        width: size,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      });

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (useGradient) {
        // Apply gradient to dark pixels
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;

        // Parse colors
        const from = { r: parseInt(gradFrom.slice(1, 3), 16), g: parseInt(gradFrom.slice(3, 5), 16), b: parseInt(gradFrom.slice(5, 7), 16) };
        const to = { r: parseInt(gradTo.slice(1, 3), 16), g: parseInt(gradTo.slice(3, 5), 16), b: parseInt(gradTo.slice(5, 7), 16) };

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const isDark = r < 128 && g < 128 && b < 128;
          if (isDark) {
            const pixelIdx = i / 4;
            const x = pixelIdx % size;
            const t = x / size;
            data[i] = Math.round(from.r + (to.r - from.r) * t);
            data[i + 1] = Math.round(from.g + (to.g - from.g) * t);
            data[i + 2] = Math.round(from.b + (to.b - from.b) * t);
          }
        }
        ctx.putImageData(imageData, 0, 0);
      }

      // Overlay logo
      if (logoPreview) {
        const img = new Image();
        img.onload = () => {
          const logoSize = size * 0.2;
          const x = (size - logoSize) / 2;
          const y = (size - logoSize) / 2;
          // White background for logo
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x - 4, y - 4, logoSize + 8, logoSize + 8);
          ctx.drawImage(img, x, y, logoSize, logoSize);
        };
        img.src = logoPreview;
      }

      setGenerated(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'QR 생성 실패');
    }
  }, [text, useGradient, gradFrom, gradTo, logoPreview]);

  const downloadPNG = () => {
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/png');
    a.download = 'qrcode_styled.png';
    a.click();
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 space-y-5">
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">텍스트 / URL</label>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors"
          />
        </div>

        {/* Logo overlay */}
        <div className="p-4 bg-background rounded-xl border border-border space-y-3">
          <p className="text-xs font-semibold text-text-primary">로고 오버레이</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoChange}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 border border-border rounded-xl text-sm text-text-secondary hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
            >
              이미지 선택
            </button>
            {logoFile && <p className="text-xs text-text-muted truncate">{logoFile.name}</p>}
            {logoPreview && (
              <button onClick={() => { setLogoFile(null); setLogoPreview(null); }} className="text-[10px] text-[#e94560] hover:underline">제거</button>
            )}
          </div>
          {logoPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview} alt="Logo preview" className="w-12 h-12 object-contain rounded-lg border border-border" />
          )}
          <p className="text-[10px] text-text-muted">로고 사용 시 오류 수정 레벨이 H로 자동 설정됩니다.</p>
        </div>

        {/* Gradient */}
        <div className="p-4 bg-background rounded-xl border border-border space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-xs font-semibold text-text-primary flex-1">그라디언트 색상</p>
            <button
              onClick={() => setUseGradient(p => !p)}
              className={`w-10 h-5 rounded-full transition-all relative ${useGradient ? 'bg-[#e94560]' : 'bg-border'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${useGradient ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
          {useGradient && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-text-muted font-semibold block mb-1">시작 색상</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-background-card border border-border rounded-xl">
                  <input type="color" value={gradFrom} onChange={e => setGradFrom(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0" />
                  <span className="text-xs font-mono text-text-primary">{gradFrom}</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-text-muted font-semibold block mb-1">끝 색상</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-background-card border border-border rounded-xl">
                  <input type="color" value={gradTo} onChange={e => setGradTo(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0" />
                  <span className="text-xs font-mono text-text-primary">{gradTo}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-[#e94560]">{error}</p>}

        <button
          onClick={generate}
          className="w-full py-3 bg-[#e94560] text-white rounded-xl text-sm font-bold hover:bg-[#d63b55] transition-colors"
        >
          QR 생성
        </button>
      </div>

      {/* Preview */}
      <div className="flex flex-col items-center gap-4">
        <div className="p-4 bg-white rounded-2xl shadow-lg border border-border">
          <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated', width: 256, height: 256 }} />
        </div>
        {generated && (
          <button
            onClick={downloadPNG}
            className="px-5 py-2.5 bg-[#e94560] text-white rounded-xl text-sm font-semibold hover:bg-[#d63b55] transition-colors"
          >
            PNG 다운로드
          </button>
        )}
      </div>
    </div>
  );
}

// ── Code128 Barcode Encoder ───────────────────────────────────────────────────
const CODE128_TABLE: Record<string, number> = {};
const CODE128_CHARS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
CODE128_CHARS.split('').forEach((ch, i) => { CODE128_TABLE[ch] = i; });

// Code128B bar widths for each symbol (0-106)
// Each symbol is 11 bits encoded in 3 bars + 3 spaces
const CODE128_PATTERNS = [
  '11011001100','11001101100','11001100110','10010011000','10010001100',
  '10001001100','10011001000','10011000100','10001100100','11001001000',
  '11001000100','11000100100','10110011100','10011011100','10011001110',
  '10111001100','10011101100','10011100110','11001110010','11001011100',
  '11001001110','11011100100','11001110100','11101101110','11101001100',
  '11100101100','11100100110','11101100100','11100110100','11100110010',
  '11011011000','11011000110','11000110110','10100011000','10001011000',
  '10001000110','10110001000','10001101000','10001100010','11010001000',
  '11000101000','11000100010','10110111000','10110001110','10001101110',
  '10111011000','10111000110','10001110110','11101110110','11010001110',
  '11000101110','11011101000','11011100010','11011101110','11101011000',
  '11101000110','11100010110','11101101000','11101100010','11100011010',
  '11101111010','11001000010','11110001010','10100110000','10100001100',
  '10010110000','10010000110','10000101100','10000100110','10110010000',
  '10110000100','10011010000','10011000010','10000110100','10000110010',
  '11000010010','11001010000','11110111010','11000010100','10001111010',
  '10100111100','10010111100','10010011110','10111100100','10011110100',
  '10011110010','11110100100','11110010100','11110010010','11011011110',
  '11011110110','11110110110','10101111000','10100011110','10001011110',
  '10111101000','10111100010','11110101000','11110100010','10111011110',
  '10111101110','11101011110','11110101110','11010000100','11010010000',
  '11010011100','1100011101011',
];

function encodeCode128(text: string): number[] | null {
  // Code128B: start with code 104
  const START_B = 104;
  const STOP = 106;

  const symbols: number[] = [START_B];
  let checksum = START_B;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const val = CODE128_TABLE[ch];
    if (val === undefined) return null; // unsupported char
    symbols.push(val);
    checksum += val * (i + 1);
  }

  symbols.push(checksum % 103);
  symbols.push(STOP);
  return symbols;
}

function drawCode128(canvas: HTMLCanvasElement, text: string) {
  const symbols = encodeCode128(text);
  const ctx = canvas.getContext('2d');
  if (!ctx || !symbols) return false;

  // Build bar pattern
  let pattern = '';
  for (const sym of symbols) {
    pattern += CODE128_PATTERNS[sym] ?? '';
  }

  const barWidth = 2;
  const height = 80;
  const quietZone = 20;
  const totalWidth = pattern.length * barWidth + quietZone * 2;

  canvas.width = totalWidth;
  canvas.height = height + 30;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let x = quietZone;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, 10, barWidth, height);
    }
    x += barWidth;
  }

  // Draw text below
  ctx.fillStyle = '#000000';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, height + 25);

  return true;
}

// ── Barcode Tab ───────────────────────────────────────────────────────────────
function BarcodeTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState('Hello World');
  const [type, setType] = useState<BarcodeType>('code128');
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState(false);

  const generate = useCallback(async () => {
    setError('');
    if (!text.trim() || !canvasRef.current) return;
    const canvas = canvasRef.current;

    if (type === 'qr') {
      try {
        await QRCode.toCanvas(canvas, text.trim(), {
          width: 200,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        });
        setGenerated(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'QR 생성 실패');
      }
    } else {
      const ok = drawCode128(canvas, text.trim());
      if (!ok) {
        setError('Code128에서 지원하지 않는 문자가 포함되어 있습니다. ASCII 범위의 문자만 사용 가능합니다.');
        setGenerated(false);
      } else {
        setGenerated(true);
      }
    }
  }, [text, type]);

  useEffect(() => {
    const t = setTimeout(() => generate(), 500);
    return () => clearTimeout(t);
  }, [generate]);

  const downloadPNG = () => {
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL('image/png');
    a.download = `barcode_${type}.png`;
    a.click();
  };

  const TYPES: { id: BarcodeType; label: string; desc: string }[] = [
    { id: 'code128', label: 'Code128', desc: '문자+숫자, 범용' },
    { id: 'qr', label: 'QR Code', desc: '2차원 코드' },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 space-y-4">
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">바코드 내용</label>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors"
            placeholder="인코딩할 텍스트 또는 숫자"
          />
        </div>

        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">바코드 형식</label>
          <div className="space-y-2">
            {TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                  type === t.id
                    ? 'border-[#e94560]/40 bg-[#e94560]/5'
                    : 'border-border bg-background hover:border-border/60'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${type === t.id ? 'border-[#e94560] bg-[#e94560]' : 'border-border'}`} />
                <div>
                  <p className={`text-sm font-semibold ${type === t.id ? 'text-[#e94560]' : 'text-text-primary'}`}>{t.label}</p>
                  <p className="text-xs text-text-muted">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-[#e94560] bg-[#e94560]/10 px-4 py-2.5 rounded-xl border border-[#e94560]/20">{error}</p>}

        <div className="text-xs text-text-muted space-y-1 p-3 bg-background rounded-xl border border-border">
          <p className="font-semibold text-text-secondary">참고</p>
          <p>Code128: ASCII 문자(공백~~) 지원, 고밀도 선형 바코드</p>
          <p>QR Code: URL, 텍스트, 연락처 등 다목적 2D 코드</p>
        </div>
      </div>

      {/* Preview */}
      <div className="flex flex-col items-center gap-4">
        <div className="p-4 bg-white rounded-2xl shadow-lg border border-border min-w-[220px] flex items-center justify-center">
          <canvas ref={canvasRef} className="block max-w-full" />
        </div>
        {generated && (
          <button
            onClick={downloadPNG}
            className="px-5 py-2.5 bg-[#e94560] text-white rounded-xl text-sm font-semibold hover:bg-[#d63b55] transition-colors"
          >
            PNG 다운로드
          </button>
        )}
      </div>
    </div>
  );
}

// ── QR 읽기 Tab ───────────────────────────────────────────────────────────────
function ScanTab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'camera' | 'file'>('file');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [streamRef, setStreamRef] = useState<MediaStream | null>(null);
  const [scanInterval, setScanInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [hasBarcodeDetector, setHasBarcodeDetector] = useState(false);

  useEffect(() => {
    setHasBarcodeDetector('BarcodeDetector' in window);
    return () => {
      if (streamRef) streamRef.getTracks().forEach(t => t.stop());
      if (scanInterval) clearInterval(scanInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStreamRef(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      if (!('BarcodeDetector' in window)) {
        setError('이 브라우저는 BarcodeDetector API를 지원하지 않습니다. Chrome 83+, Edge 83+에서 지원됩니다.');
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });
      const interval = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const video = videoRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        try {
          const barcodes = await detector.detect(canvas);
          if (barcodes.length > 0) {
            setResult(barcodes[0].rawValue);
          }
        } catch { /* ignore */ }
      }, 500);
      setScanInterval(interval);
    } catch {
      setError('카메라 접근 권한이 없거나 카메라를 사용할 수 없습니다.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef) streamRef.getTracks().forEach(t => t.stop());
    if (scanInterval) clearInterval(scanInterval);
    setScanInterval(null);
    setStreamRef(null);
    setCameraActive(false);
  }, [streamRef, scanInterval]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setResult('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!('BarcodeDetector' in window)) {
      setError('이 브라우저는 BarcodeDetector API를 지원하지 않습니다. Chrome 83+ 또는 Edge 83+를 사용해 주세요.');
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'data_matrix', 'pdf417'] });
        const barcodes = await detector.detect(canvas);
        if (barcodes.length > 0) {
          setResult(barcodes[0].rawValue);
        } else {
          setError('QR/바코드를 인식하지 못했습니다. 이미지가 선명한지 확인하세요.');
        }
      } catch {
        setError('QR/바코드 인식에 실패했습니다.');
      }
    };
    img.src = url;
  }, []);

  return (
    <div className="space-y-5">
      {/* Mode selector */}
      <div className="flex gap-1 p-1 bg-border/30 rounded-xl w-fit">
        {([['file', '이미지 업로드'], ['camera', '카메라']] as const).map(([m, l]) => (
          <button
            key={m}
            onClick={() => { setMode(m); if (cameraActive) stopCamera(); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === m ? 'bg-background-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {!hasBarcodeDetector && (
        <div className="px-4 py-3 bg-[#e94560]/5 border border-[#e94560]/20 rounded-xl">
          <p className="text-sm text-[#e94560] font-semibold">BarcodeDetector API 미지원</p>
          <p className="text-xs text-text-muted mt-1">이 브라우저는 QR 읽기를 지원하지 않습니다. Chrome 83+, Edge 83+ 또는 Android Chrome을 사용해 주세요.</p>
        </div>
      )}

      <p className="text-xs text-text-muted">
        QR 읽기는 카메라 또는 이미지에서 가능합니다. BarcodeDetector API를 사용합니다.
      </p>

      {mode === 'file' && (
        <div className="space-y-4">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileRef.current?.click()}
            className="px-5 py-3 border-2 border-dashed border-border rounded-xl text-sm text-text-muted hover:border-[#e94560]/40 hover:text-text-primary transition-colors w-full text-center"
          >
            이미지 파일 선택 (QR코드 또는 바코드 이미지)
          </button>
        </div>
      )}

      {mode === 'camera' && (
        <div className="space-y-4">
          <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '4/3', maxHeight: 360 }}>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            {!cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={startCamera}
                  className="px-6 py-3 bg-[#e94560] text-white rounded-xl text-sm font-semibold hover:bg-[#d63b55] transition-colors"
                >
                  카메라 시작
                </button>
              </div>
            )}
          </div>
          {cameraActive && (
            <button
              onClick={stopCamera}
              className="px-4 py-2 border border-border rounded-xl text-sm text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
            >
              카메라 중지
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-[#e94560] bg-[#e94560]/10 px-4 py-2.5 rounded-xl border border-[#e94560]/20">{error}</p>
      )}

      {result && (
        <div className="space-y-2">
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">인식된 내용</p>
          <div className="px-4 py-3 bg-[#e94560]/5 border border-[#e94560]/20 rounded-xl">
            <p className="text-sm font-mono text-text-primary break-all">{result}</p>
          </div>
          {(result.startsWith('http://') || result.startsWith('https://')) && (
            <a
              href={result}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-[#e94560] hover:underline"
            >
              링크 열기 →
            </a>
          )}
          <button
            onClick={() => { navigator.clipboard.writeText(result); }}
            className="block text-xs px-3 py-1.5 border border-border rounded-lg text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
          >
            복사
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function QRCodePage() {
  const [tab, setTab] = useState<Tab>('generate');

  const TABS: { id: Tab; label: string }[] = [
    { id: 'generate', label: 'QR 생성' },
    { id: 'style', label: 'QR 스타일' },
    { id: 'barcode', label: '바코드' },
    { id: 'scan', label: 'QR 읽기' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <h2 className="text-2xl font-extrabold text-text-primary">QR / 바코드</h2>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-border/30 rounded-xl w-fit mb-6 flex-wrap">
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
          {tab === 'generate' && <GenerateTab />}
          {tab === 'style' && <StyleTab />}
          {tab === 'barcode' && <BarcodeTab />}
          {tab === 'scan' && <ScanTab />}
        </div>
      </div>

      <FloatingAIBar
        getAction={() => 'chat'}
        getContext={(text) => ({ page: 'qrcode', userMessage: text })}
        onResult={async () => {}}
        placeholder="QR코드에 대해 AI에게 질문하세요..."
      />
    </div>
  );
}
