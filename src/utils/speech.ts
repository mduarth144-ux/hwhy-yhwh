export interface AudioSettings {
  rate: number;
  preferredVoicesByLang: Record<string, string>;
}

export interface VoiceOption {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  isDefault: boolean;
}

const STORAGE_KEY = 'yawe_audio_settings_v1';

type SpeechListener = (activeId: string | null) => void;
type SettingsListener = (settings: AudioSettings) => void;
type VoicesListener = (voices: SpeechSynthesisVoice[]) => void;

let currentActiveId: string | null = null;
const speechListeners = new Set<SpeechListener>();
const settingsListeners = new Set<SettingsListener>();
const voicesListeners = new Set<VoicesListener>();
let voicesSubscriptionAttached = false;

function loadSettings(): AudioSettings {
  if (typeof window === 'undefined') {
    return { rate: 1.0, preferredVoicesByLang: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { rate: 1.0, preferredVoicesByLang: {} };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      rate:
        typeof parsed.rate === 'number' && parsed.rate >= 0.5 && parsed.rate <= 1.6
          ? Number(parsed.rate.toFixed(2))
          : 1.0,
      preferredVoicesByLang:
        parsed.preferredVoicesByLang && typeof parsed.preferredVoicesByLang === 'object'
          ? parsed.preferredVoicesByLang
          : {},
    };
  } catch {
    return { rate: 1.0, preferredVoicesByLang: {} };
  }
}

let cachedSettings: AudioSettings = loadSettings();

function persistSettings(next: AudioSettings): void {
  cachedSettings = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignora erro de quota ou modo privado
    }
  }
  for (const fn of settingsListeners) {
    fn(cachedSettings);
  }
}

function notifySpeech() {
  for (const fn of speechListeners) {
    fn(currentActiveId);
  }
}

function ensureVoicesListener(): void {
  if (voicesSubscriptionAttached || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  voicesSubscriptionAttached = true;
  const dispatch = () => {
    const voices = window.speechSynthesis.getVoices();
    for (const fn of voicesListeners) {
      fn(voices);
    }
  };
  if (typeof window.speechSynthesis.addEventListener === 'function') {
    window.speechSynthesis.addEventListener('voiceschanged', dispatch);
  } else {
    window.speechSynthesis.onvoiceschanged = dispatch;
  }
}

export function getAudioSettings(): AudioSettings {
  return cachedSettings;
}

export function subscribeAudioSettings(listener: SettingsListener): () => void {
  settingsListeners.add(listener);
  listener(cachedSettings);
  return () => {
    settingsListeners.delete(listener);
  };
}

export function setAudioRate(rate: number): void {
  const clamped = Math.min(1.6, Math.max(0.5, Number(rate) || 1.0));
  persistSettings({
    ...cachedSettings,
    rate: Number(clamped.toFixed(2)),
  });
}

export function setPreferredVoice(lang: string, voiceURI: string | null): void {
  const normalizedLang = normalizeLangKey(lang);
  const nextMap = { ...cachedSettings.preferredVoicesByLang };
  if (!voiceURI) {
    delete nextMap[normalizedLang];
  } else {
    nextMap[normalizedLang] = voiceURI;
  }
  persistSettings({
    ...cachedSettings,
    preferredVoicesByLang: nextMap,
  });
}

export function normalizeLangKey(lang: string): string {
  const l = (lang || 'pt-BR').trim();
  const low = l.toLowerCase();
  if (low.startsWith('he') || low.startsWith('iw')) return 'he-IL';
  if (low === 'pt' || low === 'pt-br') return 'pt-BR';
  if (low === 'pt-pt') return 'pt-PT';
  return l;
}

export function subscribeSpeechState(listener: SpeechListener): () => void {
  speechListeners.add(listener);
  listener(currentActiveId);
  return () => {
    speechListeners.delete(listener);
  };
}

export function subscribeVoices(listener: VoicesListener): () => void {
  ensureVoicesListener();
  voicesListeners.add(listener);
  const voices =
    typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis.getVoices()
      : [];
  listener(voices);
  return () => {
    voicesListeners.delete(listener);
  };
}

export function listVoicesForLang(lang: string): VoiceOption[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  ensureVoicesListener();
  const voices = window.speechSynthesis.getVoices();
  const basePrefix = normalizeLangKey(lang).split('-')[0].toLowerCase();
  return voices
    .filter((v) => {
      const vl = v.lang.toLowerCase();
      if (basePrefix === 'he') return vl.startsWith('he') || vl.startsWith('iw');
      return vl.startsWith(basePrefix);
    })
    .map((v) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      localService: Boolean(v.localService),
      isDefault: Boolean(v.default),
    }));
}

export function prepareTextForSpeech(text: string, lang: string): string {
  const low = lang.toLowerCase();
  if (low.startsWith('he') || low.startsWith('iw')) {
    // Remove te'amim (cantilacao), sof pasuq e paseq; converte maqaf em espaco preservando niqqud
    return text
      .replace(/[\u0591-\u05AF\u05BD\u05C0\u05C3\u05C6]/g, '')
      .replace(/\u05BE/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return text
    .replace(/\[Sobrescrito salmódico no original hebraico\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const langKey = normalizeLangKey(lang);
  const preferredUri = cachedSettings.preferredVoicesByLang[langKey];
  if (preferredUri) {
    const match = voices.find((v) => v.voiceURI === preferredUri);
    if (match) return match;
  }

  const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase());
  if (exact) return exact;

  const prefix = langKey.split('-')[0].toLowerCase();
  const byPrefixLocal = voices.find(
    (v) => v.localService && (v.lang.toLowerCase().startsWith(prefix) || (prefix === 'he' && v.lang.toLowerCase().startsWith('iw'))),
  );
  if (byPrefixLocal) return byPrefixLocal;

  return (
    voices.find(
      (v) => v.lang.toLowerCase().startsWith(prefix) || (prefix === 'he' && v.lang.toLowerCase().startsWith('iw')),
    ) ?? null
  );
}

export function stopSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  currentActiveId = null;
  notifySpeech();
}

export function toggleSpeech(id: string, text: string, lang: string): { supported: boolean } {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { supported: false };
  }

  if (currentActiveId === id) {
    stopSpeech();
    return { supported: true };
  }

  const clean = prepareTextForSpeech(text, lang);
  if (!clean) {
    stopSpeech();
    return { supported: true };
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = lang;
  const isHebrew = lang.toLowerCase().startsWith('he') || lang.toLowerCase().startsWith('iw');
  const baseFactor = isHebrew ? 0.9 : 1.0;
  utterance.rate = Math.min(1.6, Math.max(0.5, Number((baseFactor * cachedSettings.rate).toFixed(2))));

  const voice = pickVoice(lang);
  if (voice) {
    utterance.voice = voice;
  }

  currentActiveId = id;
  notifySpeech();

  utterance.onend = () => {
    if (currentActiveId === id) {
      currentActiveId = null;
      notifySpeech();
    }
  };
  utterance.onerror = () => {
    if (currentActiveId === id) {
      currentActiveId = null;
      notifySpeech();
    }
  };

  window.speechSynthesis.speak(utterance);
  return { supported: true };
}
