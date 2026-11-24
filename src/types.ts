export type ModuleId =
  | 'explorador'
  | 'busca_continua'
  | 'repeticoes'
  | 'comparacao'
  | 'inversoes'
  | 'fonetica'
  | 'laboratorios'
  | 'caderno'
  | 'validacao';

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
  contextAfter: string;
  translationPt: string;
  translationPtSource: string | null;
  edition: string;
  language: string;
  parametersSummary: string;
  ketivQereInVerse: Array<{ type: string; ketiv: string; qere: string }>;
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
  algorithm_version: string;
  created_at: string;
}
