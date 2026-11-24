import React, { useEffect, useState } from 'react';
import { Square, Volume2 } from 'lucide-react';
import { subscribeSpeechState, toggleSpeech } from '../utils/speech';

interface AudioPlayButtonProps {
  audioId: string;
  text: string;
  lang: 'he-IL' | 'pt-BR';
  label?: string;
}

export const AudioPlayButton: React.FC<AudioPlayButtonProps> = ({
  audioId,
  text,
  lang,
  label,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => subscribeSpeechState(setActiveId), []);

  const isPlaying = activeId === audioId;
  const defaultTitle =
    lang === 'he-IL'
      ? isPlaying
        ? 'Parar áudio em Hebraico'
        : 'Ouvir texto em Hebraico'
      : isPlaying
        ? 'Parar áudio em PT-BR'
        : 'Ouvir texto em Português (PT-BR)';

  if (!text || !text.trim()) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        const res = toggleSpeech(audioId, text, lang);
        if (!res.supported) setUnsupported(true);
      }}
      title={unsupported ? 'Síntese de voz indisponível neste navegador' : defaultTitle}
      aria-label={defaultTitle}
      aria-pressed={isPlaying}
      className={`inline-flex items-center justify-center gap-1.5 px-2 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer no-print ${
        isPlaying
          ? 'bg-blue-700 text-white border-blue-700 hover:bg-blue-800'
          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-600 hover:text-blue-700'
      }`}
    >
      {isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Volume2 className="w-3.5 h-3.5" />}
      {label ? <span>{isPlaying ? 'Parar' : label}</span> : null}
    </button>
  );
};
