export type Division = 'Torah' | 'Prophets' | 'Writings';

export type MatchBoundaryType =
  | 'exact_word'
  | 'multi_word'
  | 'resegmented'
  | 'cross_verse'
  | 'substring';

export type EvidenceTier =
  | 'evidencia_textual'
  | 'confirmacao_lexical'
  | 'correspondencia_estrutural'
  | 'hipotese_fonetica'
  | 'hipotese_interpretativa';

export interface KetivQereItem {
  type: 'ketiv_qere' | 'ketiv_velo_qere' | 'qere_velo_ketiv';
  ketiv: string;
  qere: string;
}

export interface MasoreticDiffRecord {
  chapter: number;
  verse: number;
  items: KetivQereItem[];
}

export interface VerseRecord {
  c: number;
  v: number;
  s: number;
  e: number;
  orig: string;
  voc: string;
  cons: string;
  pt?: string;
}

export interface WordEntry {
  chapter: number;
  verse: number;
  wordIndex: number;
  start: number;
  end: number;
  cons: string;
  voc: string;
}

export interface BookData {
  order: number;
  title: string;
  slug: string;
  division: Division;
  heTitle: string;
  ptTitle: string;
  edition: string;
  license: string;
  chapters: number;
  verseCount: number;
  wordCount: number;
  letterCount: number;
  streamSha256: string;
  stream: string;
  streamFinalsNorm: string;
  refs: [number, number, number, number][]; // [c, v, s, e]
  words: WordEntry[];
  verses: VerseRecord[];
  masoreticDiffs: MasoreticDiffRecord[];
  authorizedLacunae: { chapter: number; verse: number; raw: string; reason: string }[];
  ptVersionTitle: string | null;
}

export interface InvolvedVerseDetail {
  chapter: number;
  verse: number;
  reference: string;
  vocalized: string;
  consonantal: string;
  stream: string;
  translationPt: string;
  translationState?: string | null;
  translationNote?: string | null;
}

export interface OccurrenceResult {
  id: string;
  book: string;
  slug: string;
  ptBook: string;
  heBook: string;
  division: Division;
  chapter: number;
  verse: number;
  endChapter?: number;
  endVerse?: number;
  reference: string;
  matchedStream: string;
  matchedWordsOriginal: string;
  startOffset: number;
  endOffset: number;
  boundaryType: MatchBoundaryType;
  crossesWords: boolean;
  crossesVerse: boolean;
  isAramaicRange: boolean;
  evidenceTier: EvidenceTier;
  verseVocalized: string;
  verseConsonantal: string;
  verseStream: string;
  contextBefore: string;
  contextBeforeRef?: string;
  contextBeforePt?: string;
  contextAfter: string;
  contextAfterRef?: string;
  contextAfterPt?: string;
  involvedVerses?: InvolvedVerseDetail[];
  translationPt: string;
  translationPtSource: string | null;
  translationId?: string;
  edition: string;
  language: 'Hebraico Bíblico' | 'Aramaico Bíblico';
  parametersSummary: string;
  ketivQereInVerse: KetivQereItem[];
  transformationLog?: string[];
  cost?: number;
  distance?: number;
  elsSkip?: number;
  matchType?: 'exact_consonantal' | 'phonetic_approximation';
}

export interface LexiconStats {
  word: string;
  count: number;
  booksCount: number;
  hasAramaic: boolean;
  hasHebrew: boolean;
}

export interface EngineVersionInfo {
  algorithm: string;
  version: string;
  description: string;
}
