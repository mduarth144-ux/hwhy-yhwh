export type ModuleId =
  | 'dashboard'
  | 'explorador'
  | 'biblioteca'
  | 'busca_continua'
  | 'repeticoes'
  | 'comparacao'
  | 'inversoes'
  | 'fonetica'
  | 'laboratorios'
  | 'caderno'
  | 'validacao';

export type CanonGroup =
  | 'torah'
  | 'prophets'
  | 'writings'
  | 'deuterocanonical'
  | 'apocrypha_addition'
  | 'new_testament';

export interface ManifestBook {
  order: number;
  title: string;
  slug: string;
  division: 'Torah' | 'Prophets' | 'Writings';
  heTitle: string;
  ptTitle: string;
  edition: string;
  license: string;
  json_url: string;
  original_sha256: string;
  search_file_sha256: string;
  stream_sha256: string;
  chapters: number;
  verses: number;
  words: number;
  letters: number;
  ketiv_qere_verses: number;
  authorized_lacunae: Array<{ chapter: number; verse: number; raw: string; reason: string }>;
  portuguese_translation: { versionTitle?: string; license?: string; language?: string } | null;
}

export interface ManifestPayload {
  manifest: {
    engine_name: string;
    blueprint_version: string;
    curadoria: string;
    generated_at_utc: string;
    source_repository: string;
    books_json_url: string;
    books_json_sha256: string;
    index_commit_sha: string;
    primary_edition: string;
    canonical_books_count: number;
    traditional_books_count: number;
    totals: {
      chapters: number;
      verses: number;
      words: number;
      letters: number;
    };
    normalization_policy: Record<string, unknown>;
    validation_tests: Record<string, boolean>;
    books: ManifestBook[];
  };
  algorithmVersions: Array<{ algorithm: string; version: string; description: string }>;
}

export interface TranslationSummary {
  id: string;
  name: string;
  sigla: string;
  language: string;
  edition: string;
  revision: string;
  origin: string;
  copyright: {
    status: 'public_domain' | 'restricted_local_only' | 'custom_license';
    license: string;
    restrictedLocalOnly: boolean;
    holder?: string;
    attribution?: string;
  };
  versification: {
    system: string;
    validated: boolean;
    notes?: string;
  };
  booksCount: number;
  chaptersCount: number;
  versesCount: number;
  canonGroups: CanonGroup[];
  warnings: string[];
}

export interface CatalogBookItem {
  bookId: string;
  canonOrder: number;
  canonGroup: CanonGroup;
  ptTitle: string;
  heTitle: string | null;
  hasMasoreticOriginal: boolean;
  expectedChapters: number;
  availableTranslations: Array<{
    translationId: string;
    sigla: string;
    name: string;
    language: string;
    chapters: number;
    versesCount: number;
  }>;
}

export interface InvolvedVerseDetail {
  reference: string;
  chapter: number;
  verse: number;
  verseVocalized: string;
  translationPt: string;
  translationPtSource: string | null;
  translationLanguage: string;
  translationState?: string | null;
  translationNote?: string | null;
  startOffset: number;
  endOffset: number;
}

export interface OccurrenceItem {
  id: string;
  book: string;
  slug: string;
  ptBook: string;
  heBook: string;
  division: string;
  chapter: number;
  verse: number;
  endChapter?: number;
  endVerse?: number;
  reference: string;
  matchedStream: string;
  matchedWordsOriginal: string;
  startOffset: number;
  endOffset: number;
  boundaryType: 'exact_word' | 'multi_word' | 'resegmented' | 'cross_verse' | 'substring';
  crossesWords: boolean;
  crossesVerse: boolean;
  isAramaicRange: boolean;
  evidenceTier: string;
  verseVocalized: string;
  verseConsonantal: string;
  verseStream: string;
  contextBefore: string;
  contextBeforeRef?: string;
  contextBeforePt?: string;
  contextAfter: string;
  contextAfterRef?: string;
  contextAfterPt?: string;
  translationPt: string;
  translationPtSource: string | null;
  translationId?: string | null;
  translationLanguage?: string;
  translationState?: string | null;
  translationNote?: string | null;
  involvedVerses?: InvolvedVerseDetail[];
  edition: string;
  language: string;
  parametersSummary: string;
  ketivQereInVerse: Array<{ type: string; ketiv: string; qere: string }>;
  matchType?: 'exact_consonantal' | 'phonetic_approximation';
  transformationLog?: string[];
  cost?: number;
  distance?: number;
  elsSkip?: number;
}

export interface NotebookEntryItem {
  id: number;
  title: string;
  reference: string;
  hebrew_snippet: string;
  evidence_tier: string;
  hypothesis: string;
  parameters_json: string;
  translations_snapshot_json?: string;
  algorithm_version: string;
  created_at: string;
}

export interface NotebookConnectionItem {
  id: number;
  from_entry_id: number;
  to_entry_id: number;
  relation_note: string;
  created_at: string;
}

export interface PinnedSearchItem {
  id: number;
  label: string;
  module: string;
  query_text: string;
  parameters_json: string;
  last_total_hits: number;
  live_total_hits?: number;
  created_at: string;
}

export interface SearchHistoryRecord {
  id: number;
  module: string;
  query_summary: string;
  parameters_json: string;
  total_hits: number;
  algorithm_version: string;
  created_at: string;
}

export interface SearchPresetPayload {
  subMode: 'stream' | 'els';
  query: string;
  division?: string;
  bookSlug?: string;
  boundaryFilter?: string;
  normalizeFinals?: boolean;
  elsBook?: string;
  minSkip?: number;
  maxSkip?: number;
  includeNegative?: boolean;
  nonce: number;
}

export interface ChapterComparePreset {
  leftSlug: string;
  leftChapter: number;
  rightSlug: string;
  rightChapter: number;
  nonce: number;
}

export interface DashboardDiscoveryItem {
  id: string;
  query: string;
  displayHebrew: string;
  transliteration: string;
  title: string;
  category: string;
  insight: string;
  totalCount: number;
  exactWordsCount?: number;
  nonWordStreamCount?: number;
  boundaryBreakdown: Record<string, number>;
  topBooks: Array<{ book: string; slug: string; ptBook: string; count: number }>;
  sample: {
    reference: string;
    slug: string;
    chapter: number;
    verse: number;
    verseVocalized: string;
    translationPt: string;
    translationPtSource?: string | null;
    matchedStream: string;
    startOffset: number;
    endOffset: number;
  } | null;
}

export interface DashboardPayload {
  generatedAtUtc: string;
  translationId?: string;
  translationName?: string;
  corpusTotals: {
    books: number;
    traditionalBooks: number;
    chapters: number;
    verses: number;
    words: number;
    letters: number;
    uniqueLexiconWords: number;
    ketivQereTotal: number;
  };
  divisionBreakdown: Array<{
    division: 'Torah' | 'Prophets' | 'Writings';
    ptLabel: string;
    booksCount: number;
    chapters: number;
    verses: number;
    words: number;
    letters: number;
    percentLetters: number;
  }>;
  topBooksByLetters: Array<{
    slug: string;
    ptTitle: string;
    heTitle: string;
    division: string;
    chapters: number;
    verses: number;
    letters: number;
    percentCorpus: number;
  }>;
  keyDiscoveries: DashboardDiscoveryItem[];
  repetitionsSummary: {
    total2xPlus: number;
    total3xPlus: number;
    topRepeatedUnits: Array<{
      unit: string;
      unitVocalized: string;
      occurrences: number;
      maxRepeats: number;
    }>;
    tripleOccurrences: Array<{
      unitVocalized: string;
      repeatCount: number;
      reference: string;
      slug: string;
      chapter: number;
      verseVocalized: string;
      translationPt: string;
    }>;
  };
  parallelsSummary: {
    identicalClustersCount: number;
    topClusters: Array<{
      count: number;
      letterLength: number;
      verseVocalized: string;
      translationPt: string;
      references: Array<{ reference: string; slug: string; chapter: number }>;
    }>;
    featuredComparisons: Array<{
      leftSlug: string;
      leftChapter: number;
      rightSlug: string;
      rightChapter: number;
      label: string;
      similarityPercent: number;
      identicalCount: number;
      totalVerses: number;
    }>;
  };
  elsSummary: {
    query: string;
    bookSlug: string;
    ptBook: string;
    minSkip: number;
    maxSkip: number;
    totalHits: number;
    expectedRandomHits: number;
    observedOverExpected: number | null;
    sampleHit: {
      skip: number;
      referenceStart: string;
      referenceEnd: string;
      letterOffsets: number[];
    } | null;
  };
  pinnedSearches?: PinnedSearchItem[];
  recentSearches?: SearchHistoryRecord[];
}
