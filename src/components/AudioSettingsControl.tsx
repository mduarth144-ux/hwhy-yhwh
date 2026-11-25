import React, { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, Volume2 } from 'lucide-react';
import {
  getAudioSettings,
  listVoicesForLang,
  normalizeLangKey,
  setAudioRate,
  setPreferredVoice,
  subscribeAudioSettings,
  subscribeVoices,
  type AudioSettings,
  type VoiceOption,
} from '../utils/speech';

interface AudioSettingsControlProps {
  activeTranslationLang?: string;
}

export const AudioSettingsControl: React.FC<AudioSettingsControlProps> = ({
  activeTranslationLang = 'pt-BR',
}) => {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AudioSettings>(() => getAudioSettings());
  const [heVoices, setHeVoices] = useState<VoiceOption[]>([]);
  const [trVoices, setTrVoices] = useState<VoiceOption[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedTrLang = normalizeLangKey(activeTranslationLang);

  useEffect(() => subscribeAudioSettings(setSettings), []);

  useEffect(() => {
    const refresh = () => {
      setHeVoices(listVoicesForLang('he-IL'));
      setTrVoices(listVoicesForLang(normalizedTrLang));
    };
    const unsub = subscribeVoices(refresh);
    refresh();
    return unsub;
  }, [normalizedTrLang]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative no-print">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Configurar voz e velocidade de leitura"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#1f1912] qumran-glass-inset hover:border-[#0e4d64]/50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-[#0e4d64]" />
        <span className="hidden sm:inline">Áudio</span>
        <span className="font-mono tabular-nums text-[#9a5410]">{settings.rate.toFixed(1)}×</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Preferências de síntese de voz"
          className="absolute right-0 mt-2 w-80 max-w-[92vw] z-50 qumran-glass gem-border rounded-xl p-4 shadow-xl space-y-3 text-xs text-[#1f1912]"
        >
          <div className="flex items-center justify-between border-b qumran-divider pb-2">
            <div className="flex items-center gap-1.5 font-bold text-[#0b3948]">
              <Volume2 className="w-4 h-4 text-[#9a5410]" />
              <span>Síntese de Voz (Web Speech)</span>
            </div>
            <span className="font-mono tabular-nums text-[#5c4d3c]">
              {settings.rate.toFixed(2)}×
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="audio-rate-slider" className="text-[#4a3d2d] font-medium">
                Velocidade de leitura
              </label>
              <button
                type="button"
                onClick={() => setAudioRate(1.0)}
                className="text-[11px] text-[#0e4d64] hover:underline cursor-pointer"
              >
                Padrão (1.0×)
              </button>
            </div>
            <input
              id="audio-rate-slider"
              type="range"
              min={0.6}
              max={1.4}
              step={0.05}
              value={settings.rate}
              onChange={(e) => setAudioRate(Number(e.target.value))}
              className="w-full accent-[#0e4d64]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="voice-he" className="block text-[#4a3d2d] font-medium">
              Voz para Hebraico (he-IL)
            </label>
            <select
              id="voice-he"
              value={settings.preferredVoicesByLang['he-IL'] ?? ''}
              onChange={(e) => setPreferredVoice('he-IL', e.target.value || null)}
              className="w-full px-2.5 py-1.5 text-xs border rounded"
            >
              <option value="">Automática do navegador ({heVoices.length} disponíveis)</option>
              {heVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang}) · {v.localService ? 'Local (offline)' : 'Remota — requer rede'}
                </option>
              ))}
            </select>
            {heVoices.length === 0 && (
              <p className="text-[11px] text-[#6d5b45]">
                Nenhuma voz hebraica nativa detectada; o navegador tentará síntese fallback.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="voice-tr" className="block text-[#4a3d2d] font-medium">
              Voz para Tradução ({normalizedTrLang})
            </label>
            <select
              id="voice-tr"
              value={settings.preferredVoicesByLang[normalizedTrLang] ?? ''}
              onChange={(e) => setPreferredVoice(normalizedTrLang, e.target.value || null)}
              className="w-full px-2.5 py-1.5 text-xs border rounded"
            >
              <option value="">Automática do navegador ({trVoices.length} disponíveis)</option>
              {trVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang}) · {v.localService ? 'Local (offline)' : 'Remota — requer rede'}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
