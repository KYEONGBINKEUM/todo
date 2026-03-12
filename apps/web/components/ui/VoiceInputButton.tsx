'use client';

import { useState, useRef } from 'react';

interface Props {
  onResult: (text: string) => void;
  className?: string;
}

export default function VoiceInputButton({ onResult, className = '' }: Props) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  if (!isSupported) return null;

  const handleClick = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      onResult(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={listening ? '음성 인식 중단' : '음성으로 입력'}
      className={`px-2 border-l border-border flex items-center justify-center transition-colors ${
        listening
          ? 'text-[#e94560] bg-[#e94560]/10'
          : 'text-text-muted hover:text-[#e94560]'
      } ${className}`}
    >
      {listening ? (
        // 녹음 중 애니메이션 점
        <span className="flex gap-0.5 items-end h-4">
          <span className="w-0.5 bg-[#e94560] rounded animate-bounce" style={{ height: '60%', animationDelay: '0ms' }} />
          <span className="w-0.5 bg-[#e94560] rounded animate-bounce" style={{ height: '100%', animationDelay: '150ms' }} />
          <span className="w-0.5 bg-[#e94560] rounded animate-bounce" style={{ height: '70%', animationDelay: '300ms' }} />
        </span>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      )}
    </button>
  );
}
