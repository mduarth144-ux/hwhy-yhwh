type SpeechListener = (activeId: string | null) => void;

let currentActiveId: string | null = null;
const listeners = new Set<SpeechListener>();

function notify() {
  for (const fn of listeners) {
    fn(currentActiveId);
  }
}

export function subscribeSpeechState(listener: SpeechListener): () => void {
  listeners.add(listener);
  listener(currentActiveId);
  return () => {
    listeners.delete(listener);
  };
}

export function prepareTextForSpeech(text: string, lang: 'he-IL' | 'pt-BR'): string {
  if (lang === 'he-IL') {
    // Remove te'amim (cantilacao), sof pasuq e paseq; converte maqaf em espaco preservando niqqud
    return text
      .replace(/[\u0591-\u05AF\u05BD\u05C0\u05C3\u05C6]/g, '')
      .replace(/\u05BE/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return text.replace(/\[Sobrescrito salmódico no original hebraico\]/g, '').trim();
}

function pickVoice(lang: 'he-IL' | 'pt-BR'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const prefix = lang === 'he-IL' ? 'he' : 'pt';
  const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase());
  if (exact) return exact;
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ?? null;
}

export function stopSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  currentActiveId = null;
  notify();
}

export function toggleSpeech(id: string, text: string, lang: 'he-IL' | 'pt-BR'): { supported: boolean } {
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
  utterance.rate = lang === 'he-IL' ? 0.88 : 0.98;

  const voice = pickVoice(lang);
  if (voice) {
    utterance.voice = voice;
  }

  currentActiveId = id;
  notify();

  utterance.onend = () => {
    if (currentActiveId === id) {
      currentActiveId = null;
      notify();
    }
  };
  utterance.onerror = () => {
    if (currentActiveId === id) {
      currentActiveId = null;
      notify();
    }
  };

  window.speechSynthesis.speak(utterance);
  return { supported: true };
}
