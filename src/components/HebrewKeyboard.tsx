import React from 'react';

const HEBREW_LETTERS = [
  'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י',
  'כ', 'ך', 'ל', 'מ', 'ם', 'נ', 'ן', 'ס', 'ע', 'פ',
  'ף', 'צ', 'ץ', 'ק', 'ר', 'ש', 'ת',
];

interface HebrewKeyboardProps {
  onInsert: (char: string) => void;
  presets?: Array<{ label: string; value: string }>;
  onSelectPreset?: (value: string) => void;
}

export const HebrewKeyboard: React.FC<HebrewKeyboardProps> = ({
  onInsert,
  presets,
  onSelectPreset,
}) => {
  return (
    <div className="space-y-2 pt-2 border-t border-slate-200">
      <div className="flex flex-wrap items-center gap-1" dir="rtl" lang="he">
        {HEBREW_LETTERS.map((ch) => (
          <button
            key={ch}
            type="button"
            onClick={() => onInsert(ch)}
            className="w-7 h-7 flex items-center justify-center text-base font-hebrew bg-white border border-slate-200 rounded hover:border-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
            title={`Inserir ${ch}`}
          >
            {ch}
          </button>
        ))}
      </div>
      {presets && presets.length > 0 && onSelectPreset && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500 mr-1">Exemplos:</span>
          {presets.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onSelectPreset(p.value)}
              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="font-hebrew text-sm" dir="rtl" lang="he">{p.value}</span>
              <span className="text-slate-500 ml-1.5">{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
