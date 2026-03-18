'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

type SidebarTab = 'adjust' | 'filter' | 'text' | 'crop';

interface Adjustments {
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
}

interface FilterPreset {
  id: string;
  label: string;
  style: React.CSSProperties;
  filter: string;
}

interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  bold: boolean;
}

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', label: '원본', style: {}, filter: '' },
  { id: 'grayscale', label: '흑백', style: {}, filter: 'grayscale(100%)' },
  { id: 'sepia', label: '세피아', style: {}, filter: 'sepia(80%)' },
  { id: 'invert', label: '반전', style: {}, filter: 'invert(100%)' },
  { id: 'vintage', label: '빈티지', style: {}, filter: 'sepia(40%) contrast(1.1) brightness(0.9) saturate(1.2)' },
  { id: 'cool', label: '쿨톤', style: {}, filter: 'hue-rotate(30deg) saturate(1.2) brightness(1.05)' },
  { id: 'warm', label: '웜톤', style: {}, filter: 'hue-rotate(-20deg) saturate(1.3) brightness(1.05)' },
  { id: 'fade', label: '페이드', style: {}, filter: 'opacity(0.8) brightness(1.1) contrast(0.85) saturate(0.8)' },
];

const MAX_HISTORY = 20;

function buildFilterString(adj: Adjustments, preset: FilterPreset): string {
  const adjustStr = [
    `brightness(${adj.brightness / 100})`,
    `contrast(${adj.contrast / 100})`,
    `saturate(${adj.saturate / 100})`,
    adj.blur > 0 ? `blur(${adj.blur}px)` : '',
  ].filter(Boolean).join(' ');
  return [adjustStr, preset.filter].filter(Boolean).join(' ');
}

export default function ImageEditorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [imageSrc, setImageSrc] = useState<string>('');
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('adjust');

  const [adjustments, setAdjustments] = useState<Adjustments>({
    brightness: 100,
    contrast: 100,
    saturate: 100,
    blur: 0,
  });

  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  const [selectedPreset, setSelectedPreset] = useState<FilterPreset>(FILTER_PRESETS[0]);

  // Text tool
  const [textInput, setTextInput] = useState('');
  const [textSize, setTextSize] = useState(32);
  const [textColor, setTextColor] = useState('#ffffff');
  const [textBold, setTextBold] = useState(false);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [addingText, setAddingText] = useState(false);

  // Crop
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [cropDragging, setCropDragging] = useState(false);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);

  // History (ImageData snapshots for undo/redo)
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(-1);

  const [downloadFormat, setDownloadFormat] = useState<'image/jpeg' | 'image/png'>('image/jpeg');
  const [hasImage, setHasImage] = useState(false);

  // ── Draw to canvas ───────────────────────────────────────────────────────────
  const redraw = useCallback((
    img: HTMLImageElement | null,
    adj: Adjustments,
    preset: FilterPreset,
    rot: number,
    fH: boolean,
    fV: boolean,
    layers: TextLayer[],
  ) => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rad = (rot % 360) * Math.PI / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const newW = Math.floor(img.naturalWidth * cos + img.naturalHeight * sin);
    const newH = Math.floor(img.naturalWidth * sin + img.naturalHeight * cos);
    canvas.width = newW;
    canvas.height = newH;

    ctx.save();
    ctx.translate(newW / 2, newH / 2);
    ctx.rotate(rad);
    ctx.scale(fH ? -1 : 1, fV ? -1 : 1);
    ctx.filter = buildFilterString(adj, preset);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.filter = 'none';
    ctx.restore();

    // Draw text layers
    layers.forEach(layer => {
      ctx.save();
      ctx.font = `${layer.bold ? 'bold ' : ''}${layer.size}px sans-serif`;
      ctx.fillStyle = layer.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = layer.size / 16;
      ctx.strokeText(layer.text, layer.x, layer.y);
      ctx.fillText(layer.text, layer.x, layer.y);
      ctx.restore();
    });
  }, []);

  useEffect(() => {
    if (originalImage) {
      redraw(originalImage, adjustments, selectedPreset, rotation, flipH, flipV, textLayers);
    }
  }, [originalImage, adjustments, selectedPreset, rotation, flipH, flipV, textLayers, redraw]);

  // ── History helpers ──────────────────────────────────────────────────────────
  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const snap = historyRef.current[historyIndexRef.current];
    canvas.width = snap.width;
    canvas.height = snap.height;
    ctx.putImageData(snap, 0, 0);
  }, []);

  const redo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const snap = historyRef.current[historyIndexRef.current];
    canvas.width = snap.width;
    canvas.height = snap.height;
    ctx.putImageData(snap, 0, 0);
  }, []);

  // ── File load ────────────────────────────────────────────────────────────────
  const loadFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    const img = new window.Image();
    img.onload = () => {
      setOriginalImage(img);
      setHasImage(true);
      setAdjustments({ brightness: 100, contrast: 100, saturate: 100, blur: 0 });
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setSelectedPreset(FILTER_PRESETS[0]);
      setTextLayers([]);
      setCropRect(null);
      setCropMode(false);
      historyRef.current = [];
      historyIndexRef.current = -1;
    };
    img.src = url;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) loadFile(f);
  };

  // ── Rotation / Flip ──────────────────────────────────────────────────────────
  const rotate = (deg: number) => {
    pushHistory();
    setRotation(prev => (prev + deg + 360) % 360);
  };

  const handleFlipH = () => { pushHistory(); setFlipH(prev => !prev); };
  const handleFlipV = () => { pushHistory(); setFlipV(prev => !prev); };

  // ── Adjustment change ─────────────────────────────────────────────────────────
  const handleAdjChange = (key: keyof Adjustments, value: number) => {
    setAdjustments(prev => ({ ...prev, [key]: value }));
  };

  // ── Canvas click → place text ─────────────────────────────────────────────────
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (addingText && textInput.trim()) {
      const { x, y } = getCanvasCoords(e);
      pushHistory();
      const newLayer: TextLayer = {
        id: `text_${Date.now()}`,
        text: textInput,
        x,
        y,
        size: textSize,
        color: textColor,
        bold: textBold,
      };
      setTextLayers(prev => [...prev, newLayer]);
      setAddingText(false);
    }
  };

  // ── Crop mouse events ─────────────────────────────────────────────────────────
  const handleCropMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropMode) return;
    const { x, y } = getCanvasCoords(e);
    cropStartRef.current = { x, y };
    setCropRect({ x, y, w: 0, h: 0 });
    setCropDragging(true);
  };

  const handleCropMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropDragging || !cropStartRef.current) return;
    const { x, y } = getCanvasCoords(e);
    const start = cropStartRef.current;
    setCropRect({
      x: Math.min(x, start.x),
      y: Math.min(y, start.y),
      w: Math.abs(x - start.x),
      h: Math.abs(y - start.y),
    });
  };

  const handleCropMouseUp = () => {
    setCropDragging(false);
  };

  const applyCrop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cropRect || cropRect.w < 2 || cropRect.h < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    pushHistory();
    const imageData = ctx.getImageData(
      Math.round(cropRect.x),
      Math.round(cropRect.y),
      Math.round(cropRect.w),
      Math.round(cropRect.h),
    );

    canvas.width = Math.round(cropRect.w);
    canvas.height = Math.round(cropRect.h);
    ctx.putImageData(imageData, 0, 0);

    setCropRect(null);
    setCropMode(false);

    // Update the originalImage reference with the cropped canvas content
    const croppedImg = new window.Image();
    croppedImg.onload = () => setOriginalImage(croppedImg);
    croppedImg.src = canvas.toDataURL();
  }, [cropRect, pushHistory]);

  // ── Reset ─────────────────────────────────────────────────────────────────────
  const resetAll = () => {
    setAdjustments({ brightness: 100, contrast: 100, saturate: 100, blur: 0 });
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setSelectedPreset(FILTER_PRESETS[0]);
    setTextLayers([]);
    setCropRect(null);
    setCropMode(false);
  };

  // ── Download ──────────────────────────────────────────────────────────────────
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ext = downloadFormat === 'image/jpeg' ? 'jpg' : 'png';
    const a = document.createElement('a');
    a.href = canvas.toDataURL(downloadFormat, 0.95);
    a.download = `edited_image.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Canvas display size ────────────────────────────────────────────────────────
  const getCanvasDisplayStyle = (): React.CSSProperties => {
    if (!originalImage) return {};
    const maxW = 600;
    const maxH = 500;
    const w = canvasRef.current?.width || originalImage.naturalWidth;
    const h = canvasRef.current?.height || originalImage.naturalHeight;
    const scale = Math.min(maxW / w, maxH / h, 1);
    return { width: `${w * scale}px`, height: `${h * scale}px` };
  };

  // ── Crop overlay style relative to displayed canvas ───────────────────────────
  const getCropOverlayStyle = (): React.CSSProperties => {
    if (!cropRect || !canvasRef.current) return {};
    const canvas = canvasRef.current;
    const displayStyle = getCanvasDisplayStyle();
    const displayW = parseFloat(displayStyle.width as string);
    const displayH = parseFloat(displayStyle.height as string);
    const scaleX = displayW / canvas.width;
    const scaleY = displayH / canvas.height;
    return {
      left: `${cropRect.x * scaleX}px`,
      top: `${cropRect.y * scaleY}px`,
      width: `${cropRect.w * scaleX}px`,
      height: `${cropRect.h * scaleY}px`,
    };
  };

  const sliderClass = "w-full accent-[#e94560]";
  const inputClass = "w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors";

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 md:px-6 pt-6 pb-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎨</span>
            <h2 className="text-2xl font-extrabold text-text-primary">이미지 편집기</h2>
          </div>

          {hasImage && (
            <div className="flex items-center gap-2">
              <button
                onClick={undo}
                disabled={!canUndo}
                title="실행 취소"
                className="px-3 py-2 rounded-xl border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-border/30 disabled:opacity-30 transition-all"
              >
                ↩ 취소
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                title="다시 실행"
                className="px-3 py-2 rounded-xl border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-border/30 disabled:opacity-30 transition-all"
              >
                ↪ 다시
              </button>
              <button
                onClick={resetAll}
                className="px-3 py-2 rounded-xl border border-border text-xs text-text-secondary hover:text-[#e94560] hover:border-[#e94560]/40 transition-all"
              >
                초기화
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Top Toolbar (Rotate/Flip) */}
      {hasImage && (
        <div className="flex-shrink-0 px-4 md:px-6 pb-3">
          <div className="max-w-6xl mx-auto flex items-center gap-2 flex-wrap">
            <span className="text-xs text-text-muted font-semibold">변환:</span>
            {[
              { label: '↺ 90°', action: () => rotate(-90) },
              { label: '↻ 90°', action: () => rotate(90) },
              { label: '180°', action: () => rotate(180) },
              { label: '↔ 좌우', action: handleFlipH },
              { label: '↕ 상하', action: handleFlipV },
            ].map(btn => (
              <button
                key={btn.label}
                onClick={btn.action}
                className="px-3 py-1.5 rounded-xl bg-background-card border border-border text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-border/30 transition-all"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Area */}
      <div className="flex-1 overflow-hidden px-4 md:px-6 pb-28">
        <div className="max-w-6xl mx-auto h-full flex gap-5">
          {/* Canvas Area */}
          <div className="flex-1 min-w-0 bg-background-card border border-border rounded-2xl overflow-hidden flex flex-col">
            {!hasImage ? (
              <div
                className="flex-1 flex flex-col items-center justify-center gap-4 m-5 rounded-2xl border-2 border-dashed border-border hover:border-[#e94560]/50 cursor-pointer transition-all"
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <div className="w-16 h-16 rounded-2xl bg-border/30 flex items-center justify-center text-4xl">
                  🖼️
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-text-primary">이미지를 드래그하거나 클릭하여 선택</p>
                  <p className="text-xs text-text-muted mt-1">JPG, PNG, WebP, GIF 지원</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-auto flex flex-col">
                {/* Canvas container */}
                <div
                  ref={containerRef}
                  className="flex-1 flex items-center justify-center p-5 min-h-0"
                >
                  <div className="relative" style={getCanvasDisplayStyle()}>
                    <canvas
                      ref={canvasRef}
                      className={`rounded-xl shadow-lg border border-border block ${cropMode ? 'cursor-crosshair' : addingText ? 'cursor-text' : 'cursor-default'}`}
                      style={getCanvasDisplayStyle()}
                      onClick={handleCanvasClick}
                      onMouseDown={handleCropMouseDown}
                      onMouseMove={handleCropMouseMove}
                      onMouseUp={handleCropMouseUp}
                    />
                    {/* Crop overlay */}
                    {cropMode && cropRect && cropRect.w > 0 && (
                      <div
                        className="absolute border-2 border-[#e94560] bg-[#e94560]/10 pointer-events-none"
                        style={getCropOverlayStyle()}
                      />
                    )}
                  </div>
                </div>

                {/* Canvas info bar */}
                <div className="flex-shrink-0 px-4 py-2 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-text-muted">
                      {canvasRef.current ? `${canvasRef.current.width} × ${canvasRef.current.height}px` : ''}
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-[#e94560] hover:underline"
                    >
                      다른 이미지 열기
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={downloadFormat}
                      onChange={e => setDownloadFormat(e.target.value as 'image/jpeg' | 'image/png')}
                      className="text-xs px-2 py-1 bg-background border border-border rounded-lg text-text-primary outline-none cursor-pointer"
                    >
                      <option value="image/jpeg">JPG</option>
                      <option value="image/png">PNG</option>
                    </select>
                    <button
                      onClick={handleDownload}
                      className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white text-xs font-bold"
                    >
                      다운로드
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="w-64 flex-shrink-0 bg-background-card border border-border rounded-2xl overflow-hidden flex flex-col">
            {/* Sidebar Tab Bar */}
            <div className="flex border-b border-border">
              {([
                { id: 'adjust' as const, label: '조정', icon: '🔆' },
                { id: 'filter' as const, label: '필터', icon: '✨' },
                { id: 'text' as const, label: '텍스트', icon: '📝' },
                { id: 'crop' as const, label: '자르기', icon: '✂️' },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSidebarTab(tab.id)}
                  className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-all text-center ${
                    sidebarTab === tab.id
                      ? 'text-[#e94560] border-b-2 border-[#e94560]'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  <span className="text-sm">{tab.icon}</span>
                  <span className="text-[10px] font-semibold">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Sidebar Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* ─ 조정 ─ */}
              {sidebarTab === 'adjust' && (
                <div className="space-y-5">
                  {([
                    { key: 'brightness' as const, label: '밝기', min: 0, max: 200, icon: '☀️' },
                    { key: 'contrast' as const, label: '대비', min: 0, max: 300, icon: '◑' },
                    { key: 'saturate' as const, label: '채도', min: 0, max: 300, icon: '🎨' },
                    { key: 'blur' as const, label: '흐림', min: 0, max: 20, icon: '💧' },
                  ]).map(({ key, label, min, max, icon }) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                          <span>{icon}</span>{label}
                        </p>
                        <span className="text-xs text-[#e94560] font-bold">
                          {key === 'blur' ? `${adjustments[key]}px` : `${adjustments[key]}%`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={adjustments[key]}
                        onChange={e => handleAdjChange(key, Number(e.target.value))}
                        className={sliderClass}
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => setAdjustments({ brightness: 100, contrast: 100, saturate: 100, blur: 0 })}
                    className="w-full py-2 rounded-xl border border-border text-xs text-text-muted hover:text-[#e94560] hover:border-[#e94560]/40 transition-colors"
                  >
                    조정 초기화
                  </button>
                </div>
              )}

              {/* ─ 필터 ─ */}
              {sidebarTab === 'filter' && (
                <div className="grid grid-cols-2 gap-2">
                  {FILTER_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset)}
                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all ${
                        selectedPreset.id === preset.id
                          ? 'border-[#e94560] bg-[#e94560]/10 text-[#e94560]'
                          : 'border-border bg-background hover:border-[#e94560]/40 text-text-secondary'
                      }`}
                    >
                      {/* Filter preview swatch */}
                      <div
                        className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 flex-shrink-0"
                        style={{ filter: preset.filter || undefined }}
                      />
                      <span className="text-[10px] font-semibold">{preset.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* ─ 텍스트 ─ */}
              {sidebarTab === 'text' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-text-secondary block mb-1.5">텍스트 내용</label>
                    <input
                      value={textInput}
                      onChange={e => setTextInput(e.target.value)}
                      placeholder="입력할 텍스트..."
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-xs font-semibold text-text-secondary">글자 크기</label>
                      <span className="text-xs text-[#e94560] font-bold">{textSize}px</span>
                    </div>
                    <input
                      type="range" min={8} max={200} value={textSize}
                      onChange={e => setTextSize(Number(e.target.value))}
                      className={sliderClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-text-secondary block mb-1.5">색상</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={textColor}
                        onChange={e => setTextColor(e.target.value)}
                        className="w-10 h-10 rounded-xl cursor-pointer border border-border p-0.5 bg-transparent"
                      />
                      <input
                        value={textColor}
                        onChange={e => setTextColor(e.target.value)}
                        className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-xs font-mono text-text-primary outline-none focus:border-[#e94560] transition-colors"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={textBold}
                      onChange={e => setTextBold(e.target.checked)}
                      className="accent-[#e94560]"
                    />
                    <span className="text-xs font-semibold text-text-secondary">굵게 (Bold)</span>
                  </label>

                  <button
                    onClick={() => {
                      if (!textInput.trim()) return;
                      setAddingText(true);
                    }}
                    disabled={!hasImage || !textInput.trim()}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${
                      addingText
                        ? 'bg-[#e94560] text-white animate-pulse'
                        : 'bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white disabled:opacity-40'
                    }`}
                  >
                    {addingText ? '이미지를 클릭하여 텍스트 추가' : '텍스트 추가'}
                  </button>

                  {addingText && (
                    <button
                      onClick={() => setAddingText(false)}
                      className="w-full py-2 rounded-xl border border-border text-xs text-text-muted hover:text-[#e94560] transition-colors"
                    >
                      취소
                    </button>
                  )}

                  {textLayers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">추가된 텍스트</p>
                      {textLayers.map((layer, i) => (
                        <div key={layer.id} className="flex items-center gap-2 p-2 bg-background rounded-xl border border-border">
                          <span className="flex-1 text-xs text-text-primary truncate">{layer.text}</span>
                          <button
                            onClick={() => setTextLayers(prev => prev.filter((_, idx) => idx !== i))}
                            className="text-[#e94560] text-xs w-5 h-5 flex items-center justify-center hover:bg-[#e94560]/10 rounded"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ─ 자르기 ─ */}
              {sidebarTab === 'crop' && (
                <div className="space-y-4">
                  <p className="text-xs text-text-muted leading-relaxed">
                    자르기 모드를 활성화하고 이미지 위에서 드래그하여 영역을 선택하세요.
                  </p>

                  <button
                    onClick={() => {
                      setCropMode(prev => !prev);
                      setCropRect(null);
                    }}
                    disabled={!hasImage}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${
                      cropMode
                        ? 'bg-[#e94560] text-white'
                        : 'bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white disabled:opacity-40'
                    }`}
                  >
                    {cropMode ? '✂️ 자르기 모드 활성화됨' : '자르기 모드 시작'}
                  </button>

                  {cropMode && cropRect && cropRect.w > 2 && cropRect.h > 2 && (
                    <>
                      <div className="p-3 bg-background rounded-xl border border-border space-y-1">
                        <p className="text-[10px] text-text-muted">선택 영역</p>
                        <p className="text-xs text-text-primary font-mono">
                          {Math.round(cropRect.w)} × {Math.round(cropRect.h)} px
                        </p>
                        <p className="text-[10px] text-text-muted">
                          위치: ({Math.round(cropRect.x)}, {Math.round(cropRect.y)})
                        </p>
                      </div>
                      <button
                        onClick={applyCrop}
                        className="w-full py-2.5 rounded-xl bg-[#e94560] text-white text-xs font-bold"
                      >
                        이 영역으로 자르기
                      </button>
                    </>
                  )}

                  {cropMode && (
                    <button
                      onClick={() => { setCropMode(false); setCropRect(null); }}
                      className="w-full py-2 rounded-xl border border-border text-xs text-text-muted hover:text-[#e94560] transition-colors"
                    >
                      취소
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <FloatingAIBar
        commands={[
          { label: '편집 팁', icon: '💡', desc: '이미지 편집 팁 안내', action: 'chat' },
          { label: '필터 추천', icon: '✨', desc: 'AI 필터 추천', action: 'chat' },
        ]}
        getContext={(text) => ({
          page: 'image-editor',
          hasImage,
          currentAdjustments: adjustments,
          currentFilter: selectedPreset.label,
          userMessage: text,
        })}
        getAction={() => 'chat'}
        placeholder="이미지 편집에 대해 AI에게 질문하세요..."
      />
    </div>
  );
}
