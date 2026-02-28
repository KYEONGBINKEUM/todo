'use client';

import type { AISuggestionChip } from '@/lib/noah-ai-context';

interface NoahAISuggestionChipProps {
  chip: AISuggestionChip;
  onClick: (chip: AISuggestionChip) => void;
  disabled?: boolean;
}

export default function NoahAISuggestionChip({ chip, onClick, disabled }: NoahAISuggestionChipProps) {
  return (
    <button
      onClick={() => onClick(chip)}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
        bg-background-hover hover:bg-border text-text-secondary hover:text-text-primary
        transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
        border border-border hover:border-border-hover
        active:scale-95"
    >
      <span>{chip.icon}</span>
      <span>{chip.label}</span>
    </button>
  );
}
