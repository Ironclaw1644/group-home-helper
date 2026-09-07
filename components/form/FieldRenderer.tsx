'use client';

import { ChipGroup } from './ChipGroup';
import type { FormField, StructuredData } from '@/lib/types';
import { fieldKey, isFieldRequired, isFieldVisible } from '@/lib/forms/interpolate';

/**
 * Maps a template field type to an input. Adding a field type to the template
 * schema means adding a branch here and a matching one in lib/pdf/TemplatePdf.tsx.
 */
export function FieldRenderer({
  field,
  sectionKey,
  data,
  onChange,
  interpolateLabel,
  disabled
}: {
  field: FormField;
  sectionKey: string;
  data: StructuredData;
  onChange: (key: string, value: string[] | boolean | string) => void;
  interpolateLabel: (text: string) => string;
  disabled?: boolean;
}) {
  if (!isFieldVisible(field, data, sectionKey)) return null;

  const key = fieldKey(sectionKey, field);
  const value = data[key];
  const required = isFieldRequired(field, data, sectionKey);
  const label = interpolateLabel(field.label);

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-brand-navy">
          {label}
          {required ? <span className="ml-1 text-status-missing">*</span> : null}
        </p>
        {field.help ? <p className="mt-0.5 text-xs text-brand-slate">{field.help}</p> : null}
      </div>

      {field.type === 'chips' ? (
        <ChipGroup
          options={field.options}
          value={Array.isArray(value) ? value : []}
          multiple={field.multiple}
          onChange={(next) => onChange(key, next)}
          interpolateLabel={interpolateLabel}
          disabled={disabled}
        />
      ) : null}

      {field.type === 'boolean' ? (
        <div className="flex gap-2">
          {[
            { label: 'No', v: false },
            { label: 'Yes', v: true }
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              aria-pressed={value === opt.v}
              disabled={disabled}
              onClick={() => onChange(key, opt.v)}
              className={
                value === opt.v
                  ? 'min-h-[44px] rounded-xl border border-brand-teal bg-brand-teal px-5 py-2 text-sm font-semibold text-white'
                  : 'min-h-[44px] rounded-xl border border-brand-navy/15 bg-white px-5 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-sand/70'
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}

      {field.type === 'text' ? (
        field.multiline ? (
          <textarea
            className="field-input min-h-[96px]"
            value={typeof value === 'string' ? value : ''}
            placeholder={field.placeholder}
            disabled={disabled}
            required={required}
            onChange={(e) => onChange(key, e.target.value)}
          />
        ) : (
          <input
            type="text"
            className="field-input"
            value={typeof value === 'string' ? value : ''}
            placeholder={field.placeholder}
            disabled={disabled}
            required={required}
            onChange={(e) => onChange(key, e.target.value)}
          />
        )
      ) : null}
    </div>
  );
}
