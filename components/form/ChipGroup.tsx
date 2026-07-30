'use client';

import { cn } from '@/lib/utils';
import type { ChipOption } from '@/lib/types';

/**
 * Tap targets, not checkboxes. DSPs fill these one-handed on a phone during a
 * shift, so every chip is at least 44px tall and the whole row is the target.
 */
export function ChipGroup({
  options,
  value,
  multiple,
  onChange,
  interpolateLabel,
  disabled
}: {
  options: ChipOption[];
  value: string[];
  multiple: boolean;
  onChange: (next: string[]) => void;
  interpolateLabel: (text: string) => string;
  disabled?: boolean;
}) {
  function toggle(optionValue: string) {
    if (disabled) return;
    if (multiple) {
      onChange(
        value.includes(optionValue)
          ? value.filter((v) => v !== optionValue)
          : [...value, optionValue]
      );
    } else {
      // Tapping the selected chip again clears it — otherwise a mis-tap on a
      // single-select field can never be undone.
      onChange(value.includes(optionValue) ? [] : [optionValue]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => toggle(option.value)}
            className={cn(
              'min-h-[44px] rounded-xl border px-3 py-2 text-left text-sm font-medium transition',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/50',
              selected
                ? 'border-brand-teal bg-brand-teal text-white shadow-sm'
                : 'border-brand-navy/15 bg-white text-brand-navy hover:border-brand-teal/40 hover:bg-brand-sand/70',
              option.flags_concern && selected && 'border-status-draft bg-status-draft text-white',
              disabled && 'cursor-not-allowed opacity-60'
            )}
          >
            {interpolateLabel(option.label)}
          </button>
        );
      })}
    </div>
  );
}
