import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, BookOpenCheck, GitCompare, Languages } from 'lucide-react';
import type {
  CanonGroup,
  CatalogBookItem,
  ChapterComparePreset,
  ManifestBook,
  TranslationSummary,
} from '../types';
import { fetchJson } from '../utils/api';
import { AudioPlayButton } from './AudioPlayButton';

interface IdenticalCluster {
  hash: string;
  letterLength: number;
  count: number;
  stream: string;
  occurrences: Array<{
    book: string;
    slug: string;
    ptBook: string;
    chapter: number;
    verse: number;
    reference: string;
    verseVocalized: string;
    translationPt: string;
  }>;
}

interface DiffOp {
  op: 'eq' | 'del' | 'ins' | 'sub';
  a: string;
  b: string;
}

interface ChapterComparisonResponse {
  leftLabel: string;
  rightLabel: string;
  leftVerseCount: number;
  rightVerseCount: number;
  identicalCount: number;
  averageSimilarityPercent: number;
  comparisons: Array<{
    leftRef: string;
    rightRef: string;
    leftVocalized: string;
    rightVocalized: string;
    leftStream: string;
    rightStream: string;
    editDistance: number;
    similarityPercent: number;
    identical: boolean;
    diffOps: DiffOp[];
  }>;
  algorithmVersion: string;
}

interface TranslationComparisonEntry {
  translationId: string;
  translationName: string;
  sigla: string;
  language: string;
  text: string | null;
  state: { status: string; note?: string; combinedWith?: string | number[] } | null;
  versificationValidated: boolean;
  mappedToMasoretic: boolean;
  unmappedWarning: string | null;
  signals: {
    wordCount: number;
    charCount: number;
    divineRenderings: string[];
    properNames: string[];
  };
}

interface TranslationDiffAnalysis {
  comparedCount: number;
  identicalText: boolean;
  sharedTokens: string[];
  distinctiveByTranslation: Array<{
    sigla: string;
    distinctiveTokens: string[];
    divineRenderings: string[];
  }>;
  divineNameDivergence: boolean;
  punctuationDivergence: boolean;
  conceptDifferences: Array<{
    concept: string;
    byTranslation: Record<string, string[]>;
  }>;
}

interface MultiTranslationCompareResponse {
  mode: 'verse' | 'chapter';
  hasHebrewOriginal: boolean;
  bookId: string;
  ptTitle: string;
  heTitle: string | null;
  chapter: number;
  verse?: number;
  original?: {
    originalPlain: string;
    vocalized: string;
    consonantalSpaced: string;
    stream: string;
    startOffset: number;
    endOffset: number;
  } | null;
  entries?: TranslationComparisonEntry[];
  deterministicDiffs?: TranslationDiffAnalysis;
  methodologicalNote?: string;
  rows?: Array<{
    verse: number;
    original: {
      originalPlain: string;
      vocalized: string;
      consonantalSpaced: string;
      stream: string;
    } | null;
    entries: TranslationComparisonEntry[];
    deterministicDiffs: TranslationDiffAnalysis;
  }>;
}

const CONCEPT_LABELS: Record<string, string> = {
  torah_lei: 'Torá / Lei / Instrução',
  nefesh_alma: 'Nefesh / Alma / Vida / Pessoa',
  ruach_espirito: 'Ruach / Espírito / Sopro / Vento',
  olam_eterno: 'Olam / Eterno / Perpétuo',
};

const CANON_GROUPS: Array<{ group: CanonGroup; label: string }> = [
  { group: 'torah', label: 'Torá' },
  { group: 'prophets', label: 'Nevi’im' },
  { group: 'writings', label: 'Ketuvim' },
  { group: 'deuterocanonical', label: 'Deuterocanônicos' },
  { group: 'apocrypha_addition', label: 'Adições Gregas' },
  { group: 'new_testament', label: 'Novo Testamento' },
];

export interface TranslationComparePreset {
  bookId: string;
  chapter: number;
  verse?: number | null;
  nonce: number;
}

interface CompareParallelsViewProps {
  books: ManifestBook[];
  catalogBooks: CatalogBookItem[];
  translations: TranslationSummary[];
  defaultComparisonIds: string[];
  initialPreset?: ChapterComparePreset | null;
  initialTranslationComparePreset?: TranslationComparePreset | null;
  onInspectChapter: (slug: string, chapter: number) => void;
}

export const CompareParallelsView: React.FC<CompareParallelsViewProps> = ({
  books,
  catalogBooks,
  translations,
  defaultComparisonIds,
  initialPreset,
  initialTranslationComparePreset,
  onInspectChapter,
}) => {
  const [tab, setTab] = useState<'chapters' | 'identical' | 'translations'>('chapters');
  const [leftSlug, setLeftSlug] = useState(initialPreset?.leftSlug ?? 'psalms');
  const [leftChapter, setLeftChapter] = useState(initialPreset?.leftChapter ?? 14);
  const [rightSlug, setRightSlug] = useState(initialPreset?.rightSlug ?? 'psalms');
  const [rightChapter, setRightChapter] = useState(initialPreset?.rightChapter ?? 53);
  const [cmpData, setCmpData] = useState<ChapterComparisonResponse | null>(null);
  const [identicalClusters, setIdenticalClusters] = useState<IdenticalCluster[]>([]);

  // Multi-translation comparator state
  const [trBookId, setTrBookId] = useState('genesis');
  const [trChapter, setTrChapter] = useState(1);
  const [trScopeMode, setTrScopeMode] = useState<'verse' | 'chapter'>('verse');
  const [trVerse, setTrVerse] = useState(1);
  const [selectedTranslationIds, setSelectedTranslationIds] = useState<string[]>(
    defaultComparisonIds.length > 0 ? defaultComparisonIds : ['acf'],
  );
  const [trResult, setTrResult] = useState<MultiTranslationCompareResponse | null>(null);
  const [trLayer, setTrLayer] = useState<'vocalized' | 'original' | 'consonantal' | 'stream'>('vocalized');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultComparisonIds.length > 0 && selectedTranslationIds.length === 0) {
      setSelectedTranslationIds(defaultComparisonIds);
    }
  }, [defaultComparisonIds]);

  const runChapterCompare = async (
    ls = leftSlug,
    lc = leftChapter,
    rs = rightSlug,
    rc = rightChapter,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson<ChapterComparisonResponse>('/api/compare/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leftSlug: ls, leftChapter: lc, rightSlug: rs, rightChapter: rc }),
      });
      setCmpData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao comparar capítulos.');
    } finally {
      setLoading(false);
    }
  };

  const runTranslationCompare = async (opts?: {
    bId?: string;
    ch?: number;
    v?: number | null;
    ids?: string[];
  }) => {
    const bId = opts?.bId ?? trBookId;
    const ch = opts?.ch ?? trChapter;
    const v = opts?.v !== undefined ? opts.v : trScopeMode === 'verse' ? trVerse : null;
    const ids = opts?.ids ?? selectedTranslationIds;
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson<MultiTranslationCompareResponse>('/api/compare/translations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: bId,
          chapter: ch,
          verse: v,
          translationIds: ids,
        }),
      });
      setTrResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao comparar traduções.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialPreset) {
      setTab('chapters');
      setLeftSlug(initialPreset.leftSlug);
      setLeftChapter(initialPreset.leftChapter);
      setRightSlug(initialPreset.rightSlug);
      setRightChapter(initialPreset.rightChapter);
      runChapterCompare(
        initialPreset.leftSlug,
        initialPreset.leftChapter,
        initialPreset.rightSlug,
        initialPreset.rightChapter,
      );
    } else if (!initialTranslationComparePreset) {
      runChapterCompare('psalms', 14, 'psalms', 53);
    }
  }, [initialPreset?.nonce]);

  useEffect(() => {
    if (!initialTranslationComparePreset) return;
    setTab('translations');
    setTrBookId(initialTranslationComparePreset.bookId);
    setTrChapter(initialTranslationComparePreset.chapter);
    if (initialTranslationComparePreset.verse) {
      setTrScopeMode('verse');
      setTrVerse(initialTranslationComparePreset.verse);
    } else {
      setTrScopeMode('verse');
      setTrVerse(1);
    }
    runTranslationCompare({
      bId: initialTranslationComparePreset.bookId,
      ch: initialTranslationComparePreset.chapter,
      v: initialTranslationComparePreset.verse ?? 1,
    });
  }, [initialTranslationComparePreset?.nonce]);

  const loadIdentical = async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson<{ clusters: IdenticalCluster[] }>('/api/compare/identical?minLetters=18&limit=80');
      setIdenticalClusters(json.clusters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar versículos idênticos.');
    } finally {
      setLoading(false);
    }
  };

  const toggleTranslationChoice = (id: string) => {
    setSelectedTranslationIds((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id],
    );
  };

  const selectableBooks = useMemo(() => {
    if (catalogBooks.length > 0) {
      return catalogBooks.filter((b) => b.hasMasoreticOriginal || b.availableTranslations.length > 0);
    }
    return books.map((b) => ({
      bookId: b.slug,
      canonOrder: b.order,
      canonGroup:
        b.division === 'Torah' ? ('torah' as const) : b.division === 'Prophets' ? ('prophets' as const) : ('writings' as const),
      ptTitle: b.ptTitle,
      heTitle: b.heTitle,
      hasMasoreticOriginal: true,
      expectedChapters: b.chapters,
      availableTranslations: [],
    }));
  }, [catalogBooks, books]);

  const selectedBookMaxCh =
    selectableBooks.find((b) => b.bookId === trBookId)?.expectedChapters ?? 150;

  return (
    <div className="space-y-6">
      <div className="qumran-glass gem-border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 qumran-glass-inset rounded-lg">
            <button
              type="button"
              onClick={() => setTab('chapters')}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                tab === 'chapters'
                  ? 'bg-[#0e4d64] text-[#fefaf0] shadow-xs'
                  : 'text-[#4a3d2d] hover:text-[#1f1912]'
              }`}
            >
              Comparação Paralela & Diff Letra a Letra
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('identical');
                if (identicalClusters.length === 0) loadIdentical();
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                tab === 'identical'
                  ? 'bg-[#0e4d64] text-[#fefaf0] shadow-xs'
                  : 'text-[#4a3d2d] hover:text-[#1f1912]'
              }`}
            >
              Versículos Idênticos (SHA-256)
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('translations');
                if (!trResult) runTranslationCompare();
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                tab === 'translations'
                  ? 'bg-[#0e4d64] text-[#fefaf0] shadow-xs'
                  : 'text-[#4a3d2d] hover:text-[#1f1912]'
              }`}
            >
              <Languages className="w-3.5 h-3.5" />
              Comparador Multitradução
            </button>
          </div>

          {tab === 'chapters' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#5c4d3c]">Paralelos clássicos:</span>
              <button
                type="button"
                onClick={() => {
                  setLeftSlug('psalms');
                  setLeftChapter(14);
                  setRightSlug('psalms');
                  setRightChapter(53);
                  runChapterCompare('psalms', 14, 'psalms', 53);
                }}
                className="px-2.5 py-1 qumran-glass-inset hover:bg-[#ebd8b5]/80 rounded text-[#1f1912] cursor-pointer"
              >
                Salmos 14 ↔ Salmos 53
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeftSlug('psalms');
                  setLeftChapter(18);
                  setRightSlug('ii_samuel');
                  setRightChapter(22);
                  runChapterCompare('psalms', 18, 'ii_samuel', 22);
                }}
                className="px-2.5 py-1 qumran-glass-inset hover:bg-[#ebd8b5]/80 rounded text-[#1f1912] cursor-pointer"
              >
                Salmos 18 ↔ II Samuel 22
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeftSlug('isaiah');
                  setLeftChapter(37);
                  setRightSlug('ii_kings');
                  setRightChapter(19);
                  runChapterCompare('isaiah', 37, 'ii_kings', 19);
                }}
                className="px-2.5 py-1 qumran-glass-inset hover:bg-[#ebd8b5]/80 rounded text-[#1f1912] cursor-pointer"
              >
                Isaías 37 ↔ II Reis 19
              </button>
            </div>
          )}
        </div>

        {tab === 'chapters' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3">
              <label className="block text-xs text-[#5c4d3c] mb-1">Livro A</label>
              <select
                value={leftSlug}
                onChange={(e) => {
                  setLeftSlug(e.target.value);
                  setLeftChapter(1);
                }}
                className="w-full px-3 py-2 text-sm border rounded"
              >
                {books.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {b.ptTitle}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[#5c4d3c] mb-1">Cap. A</label>
              <input
                type="number"
                min={1}
                max={books.find((b) => b.slug === leftSlug)?.chapters ?? 150}
                value={leftChapter}
                onChange={(e) => setLeftChapter(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border rounded"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs text-[#5c4d3c] mb-1">Livro B</label>
              <select
                value={rightSlug}
                onChange={(e) => {
                  setRightSlug(e.target.value);
                  setRightChapter(1);
                }}
                className="w-full px-3 py-2 text-sm border rounded"
              >
                {books.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {b.ptTitle}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[#5c4d3c] mb-1">Cap. B</label>
              <input
                type="number"
                min={1}
                max={books.find((b) => b.slug === rightSlug)?.chapters ?? 150}
                value={rightChapter}
                onChange={(e) => setRightChapter(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border rounded"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => runChapterCompare()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-[#fefaf0] bg-[#0e4d64] hover:bg-[#0b3948] border border-[#d99f45]/45 rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                <GitCompare className="w-4 h-4 text-[#fbbf24]" />
                Comparar
              </button>
            </div>
          </div>
        )}

        {tab === 'translations' && (
          <div className="space-y-4 pt-2 border-t qumran-divider">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="block text-xs text-[#5c4d3c] mb-1">Livro (Multicânon)</label>
                <select
                  value={trBookId}
                  onChange={(e) => {
                    setTrBookId(e.target.value);
                    setTrChapter(1);
                    setTrVerse(1);
                  }}
                  className="w-full px-3 py-2 text-sm border rounded"
                >
                  {CANON_GROUPS.map(({ group, label }) => {
                    const list = selectableBooks.filter((b) => b.canonGroup === group);
                    if (list.length === 0) return null;
                    return (
                      <optgroup key={group} label={label}>
                        {list.map((b) => (
                          <option key={b.bookId} value={b.bookId}>
                            {b.ptTitle}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs text-[#5c4d3c] mb-1">Capítulo</label>
                <input
                  type="number"
                  min={1}
                  max={selectedBookMaxCh}
                  value={trChapter}
                  onChange={(e) => setTrChapter(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border rounded"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs text-[#5c4d3c] mb-1">Modo</label>
                <select
                  value={trScopeMode}
                  onChange={(e) => setTrScopeMode(e.target.value as 'verse' | 'chapter')}
                  className="w-full px-3 py-2 text-sm border rounded"
                >
                  <option value="verse">Versículo único</option>
                  <option value="chapter">Capítulo inteiro</option>
                </select>
              </div>

              {trScopeMode === 'verse' && (
                <div className="md:col-span-2">
                  <label className="block text-xs text-[#5c4d3c] mb-1">Versículo</label>
                  <input
                    type="number"
                    min={1}
                    max={176}
                    value={trVerse}
                    onChange={(e) => setTrVerse(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border rounded"
                  />
                </div>
              )}

              <div className={trScopeMode === 'verse' ? 'md:col-span-2' : 'md:col-span-4'}>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => runTranslationCompare()}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-[#fefaf0] bg-[#0e4d64] hover:bg-[#0b3948] border border-[#d99f45]/45 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Languages className="w-4 h-4 text-[#fbbf24]" />
                  {loading ? 'Comparando…' : 'Comparar traduções'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-[#5c4d3c] font-medium">Traduções selecionadas:</span>
              {translations.map((t) => (
                <label
                  key={t.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 qumran-glass-inset rounded border border-[#926c3c]/30 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedTranslationIds.includes(t.id)}
                    onChange={() => toggleTranslationChoice(t.id)}
                    className="accent-[#0e4d64]"
                  />
                  <span className="font-mono font-bold text-[#0b3948]">{t.sigla}</span>
                  <span className="text-[#4a3d2d]">{t.name}</span>
                </label>
              ))}
              {translations.length < 2 && (
                <span className="text-[#9a5410]">
                  Apenas 1 tradução instalada no momento; importe outras traduções via yawe-bible-importer em data/translations/.
                </span>
              )}
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="flex items-center gap-2 px-3 py-2 text-xs text-rose-900 bg-rose-100/85 border border-rose-300 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {tab === 'chapters' && cmpData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 qumran-glass gem-border rounded-xl p-4">
            <div>
              <div className="text-xs text-[#5c4d3c]">Passagens alinhadas</div>
              <div className="text-base font-bold text-[#1f1912]">
                {cmpData.leftLabel} ↔ {cmpData.rightLabel}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#5c4d3c]">Similaridade consonantal média</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-[#0b3948]">
                {cmpData.averageSimilarityPercent}%
              </div>
            </div>
            <div>
              <div className="text-xs text-[#5c4d3c]">Versículos 100% idênticos</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-[#047857]">
                {cmpData.identicalCount} / {cmpData.comparisons.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#5c4d3c]">Algoritmo</div>
              <div className="text-xs font-mono text-[#4a3d2d] mt-1">{cmpData.algorithmVersion}</div>
            </div>
          </div>

          <div className="divide-y qumran-divider qumran-glass gem-border rounded-xl">
            {cmpData.comparisons.map((row, idx) => (
              <div key={idx} className="p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4a3d2d]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#1f1912]">{row.leftRef}</span>
                    <span>↔</span>
                    <span className="font-semibold text-[#1f1912]">{row.rightRef}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className={row.identical ? 'text-[#047857] font-semibold' : 'text-[#4a3d2d]'}>
                      {row.identical ? 'Idêntico (100%)' : `${row.similarityPercent}% similar`}
                    </span>
                    <span className="text-[#926c3c]">·</span>
                    <span>Levenshtein: {row.editDistance} letras</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 qumran-glass-inset p-3 rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] text-[#5c4d3c]">{row.leftRef}</span>
                      <AudioPlayButton
                        audioId={`cmp-left-${idx}`}
                        text={row.leftVocalized}
                        lang="he-IL"
                        label="Ouvir"
                      />
                    </div>
                    <p className="font-hebrew text-lg text-[#1f1912]" dir="rtl" lang="he">{row.leftVocalized}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] text-[#5c4d3c]">{row.rightRef}</span>
                      <AudioPlayButton
                        audioId={`cmp-right-${idx}`}
                        text={row.rightVocalized}
                        lang="he-IL"
                        label="Ouvir"
                      />
                    </div>
                    <p className="font-hebrew text-lg text-[#1f1912]" dir="rtl" lang="he">{row.rightVocalized}</p>
                  </div>
                </div>

                {row.diffOps.length > 0 && (
                  <div className="pt-1">
                    <div className="text-[11px] text-[#5c4d3c] mb-1">
                      Alinhamento consonantal letra a letra (azul petróleo = igual, âmbar = substituição, rubi = remoção em A, esmeralda = inserção em B)
                    </div>
                    <div className="flex flex-wrap gap-0.5 font-hebrew text-base p-2.5 qumran-glass-inset rounded" dir="rtl" lang="he">
                      {row.diffOps.map((d, i) => {
                        if (d.op === 'eq') {
                          return <span key={i} className="text-[#1f1912]">{d.a}</span>;
                        }
                        if (d.op === 'sub') {
                          return (
                            <span key={i} className="px-0.5 bg-[#fbbf24]/55 text-[#78350f] rounded font-bold" title={`A:${d.a} → B:${d.b}`}>
                              {d.a}/{d.b}
                            </span>
                          );
                        }
                        if (d.op === 'del') {
                          return (
                            <span key={i} className="px-0.5 bg-rose-200/70 text-rose-900 line-through rounded" title={`Ausente em B: ${d.a}`}>
                              {d.a}
                            </span>
                          );
                        }
                        return (
                          <span key={i} className="px-0.5 bg-emerald-200/70 text-emerald-900 rounded" title={`Inserido em B: ${d.b}`}>
                            +{d.b}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'identical' && (
        <div className="space-y-4">
          <div className="qumran-glass gem-border rounded-xl p-4 text-xs text-[#4a3d2d] flex items-center justify-between">
            <span>Agrupamentos de versículos consonantalmente idênticos por SHA-256 (≥ 18 letras)</span>
            <span className="font-mono tabular-nums font-semibold text-[#0b3948]">{identicalClusters.length} grupos</span>
          </div>

          <div className="divide-y qumran-divider qumran-glass gem-border rounded-xl">
            {identicalClusters.map((cl) => (
              <div key={cl.hash} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4a3d2d]">
                  <div>
                    <strong className="font-mono tabular-nums text-[#047857]">{cl.count}× idêntico</strong>
                    <span className="mx-2">·</span>
                    <span className="font-mono tabular-nums">{cl.letterLength} letras</span>
                    <span className="mx-2">·</span>
                    <span className="font-mono text-[#6d5b45]">SHA-256: {cl.hash.slice(0, 16)}…</span>
                  </div>
                </div>
                <div className="qumran-glass-inset p-3 rounded-lg space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex-1 font-hebrew text-xl text-[#1f1912]" dir="rtl" lang="he">
                      {cl.occurrences[0]?.verseVocalized}
                    </p>
                    {cl.occurrences[0]?.verseVocalized && (
                      <AudioPlayButton
                        audioId={`cmp-cl-he-${cl.hash}`}
                        text={cl.occurrences[0].verseVocalized}
                        lang="he-IL"
                        label="Ouvir"
                      />
                    )}
                  </div>
                  {cl.occurrences[0]?.translationPt && (
                    <div className="flex items-start justify-between gap-3">
                      <p className="flex-1 text-sm text-[#4a3d2d]">{cl.occurrences[0].translationPt}</p>
                      <AudioPlayButton
                        audioId={`cmp-cl-pt-${cl.hash}`}
                        text={cl.occurrences[0].translationPt}
                        lang="pt-BR"
                        label="Ouvir"
                      />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  {cl.occurrences.map((o, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onInspectChapter(o.slug, o.chapter)}
                      className="text-[#0e4d64] hover:text-[#9a5410] hover:underline cursor-pointer font-medium"
                    >
                      {o.reference}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'translations' && trResult && (
        <div className="space-y-4">
          <div className="qumran-glass gem-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#4a3d2d]">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="w-4 h-4 text-[#0e4d64]" />
              <strong className="text-[#1f1912]">
                {trResult.ptTitle} {trResult.chapter}
                {trResult.mode === 'verse' && trResult.verse ? `:${trResult.verse}` : ''}
              </strong>
              {trResult.heTitle && (
                <span className="font-hebrew text-base font-bold gem-hebrew" dir="rtl" lang="he">
                  {trResult.heTitle}
                </span>
              )}
              <span>·</span>
              <span>
                {trResult.hasHebrewOriginal
                  ? 'Original hebraico massorético disponível (4 camadas)'
                  : 'Sem original massorético indexado — comparação estritamente entre traduções'}
              </span>
            </div>

            {trResult.hasHebrewOriginal && (
              <div className="flex flex-wrap items-center gap-1 p-1 qumran-glass-inset rounded-lg">
                {(
                  [
                    ['vocalized', 'Vocalizado'],
                    ['original', 'Com Te’amim'],
                    ['consonantal', 'Consonantal'],
                    ['stream', 'Stream'],
                  ] as const
                ).map(([lid, lbl]) => (
                  <button
                    key={lid}
                    type="button"
                    onClick={() => setTrLayer(lid)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                      trLayer === lid ? 'bg-[#0e4d64] text-[#fefaf0]' : 'text-[#4a3d2d]'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>

          {trResult.methodologicalNote && (
            <div className="text-xs text-[#5c4d3c] px-1">{trResult.methodologicalNote}</div>
          )}

          {trResult.mode === 'verse' && (
            <div className="space-y-4">
              {trResult.original && (
                <div className="qumran-glass gem-border rounded-xl p-5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#5c4d3c]">
                    <span>Texto Original Massorético ({trResult.ptTitle} {trResult.chapter}:{trResult.verse})</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono tabular-nums">
                        [{trResult.original.startOffset}..{trResult.original.endOffset})
                      </span>
                      <AudioPlayButton
                        audioId={`trcmp-orig-${trResult.bookId}-${trResult.chapter}-${trResult.verse}`}
                        text={trResult.original.vocalized}
                        lang="he-IL"
                        label="Ouvir Hebraico"
                      />
                    </div>
                  </div>
                  <p className="font-hebrew text-2xl leading-relaxed text-[#1f1912]" dir="rtl" lang="he">
                    {trLayer === 'original'
                      ? trResult.original.originalPlain
                      : trLayer === 'consonantal'
                        ? trResult.original.consonantalSpaced
                        : trLayer === 'stream'
                          ? trResult.original.stream
                          : trResult.original.vocalized}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {(trResult.entries ?? []).map((entry) => (
                  <div key={entry.translationId} className="qumran-glass gem-border rounded-xl p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2 border-b qumran-divider pb-2">
                      <div>
                        <span className="font-mono text-sm font-bold text-[#0b3948]">{entry.sigla}</span>
                        <span className="mx-2 text-[#926c3c]">·</span>
                        <span className="text-xs font-semibold text-[#1f1912]">{entry.translationName}</span>
                        <span className="ml-2 text-[11px] text-[#5c4d3c]">({entry.language})</span>
                      </div>
                      {entry.text && (
                        <AudioPlayButton
                          audioId={`trcmp-${entry.translationId}-${trResult.bookId}-${trResult.chapter}-${trResult.verse}`}
                          text={entry.text}
                          lang={entry.language || 'pt-BR'}
                          label="Ouvir"
                        />
                      )}
                    </div>

                    {entry.text ? (
                      <p className="text-sm text-[#1f1912] leading-relaxed">{entry.text}</p>
                    ) : (
                      <p className="text-xs text-[#9a5410]">
                        Texto indisponível neste versículo ({entry.state?.status ?? 'lacuna/ausente'}).
                      </p>
                    )}

                    {(entry.unmappedWarning || entry.state?.note || entry.signals.divineRenderings.length > 0) && (
                      <div className="text-[11px] text-[#5c4d3c] space-y-1 pt-1 border-t qumran-divider">
                        {entry.signals.divineRenderings.length > 0 && (
                          <div>Nomes divinos detectados: {entry.signals.divineRenderings.join(', ')}</div>
                        )}
                        {entry.state?.note && (
                          <div className="text-[#9a5410]">Estado ({entry.state.status}): {entry.state.note}</div>
                        )}
                        {entry.unmappedWarning && (
                          <div className="flex items-center gap-1 text-[#9a5410]">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            {entry.unmappedWarning}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {trResult.deterministicDiffs && trResult.deterministicDiffs.comparedCount >= 2 && (
                <div className="qumran-glass gem-border rounded-xl p-5 space-y-3 text-xs">
                  <h3 className="text-sm font-bold text-[#1f1912]">
                    Diferenças Determinísticas Entre Traduções
                  </h3>
                  <div className="flex flex-wrap gap-4 text-[#4a3d2d]">
                    <span>
                      Texto idêntico: <strong>{trResult.deterministicDiffs.identicalText ? 'Sim' : 'Não'}</strong>
                    </span>
                    <span>
                      Divergência em nome divino:{' '}
                      <strong className={trResult.deterministicDiffs.divineNameDivergence ? 'text-[#9a5410]' : ''}>
                        {trResult.deterministicDiffs.divineNameDivergence ? 'Sim' : 'Não'}
                      </strong>
                    </span>
                    <span>
                      Divergência de pontuação:{' '}
                      <strong>{trResult.deterministicDiffs.punctuationDivergence ? 'Sim' : 'Não'}</strong>
                    </span>
                  </div>

                  {trResult.deterministicDiffs.conceptDifferences.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t qumran-divider">
                      <div className="font-semibold text-[#0b3948]">Variações em termos conceituais chave:</div>
                      {trResult.deterministicDiffs.conceptDifferences.map((cd) => (
                        <div key={cd.concept} className="qumran-glass-inset p-2.5 rounded">
                          <span className="font-semibold text-[#1f1912]">
                            {CONCEPT_LABELS[cd.concept] ?? cd.concept}:
                          </span>{' '}
                          {Object.entries(cd.byTranslation)
                            .map(([sig, vals]) => `${sig}: "${vals.join(', ')}"`)
                            .join(' | ')}
                        </div>
                      ))}
                    </div>
                  )}

                  {trResult.deterministicDiffs.distinctiveByTranslation.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t qumran-divider">
                      {trResult.deterministicDiffs.distinctiveByTranslation.map((dt) => (
                        <div key={dt.sigla} className="qumran-glass-inset p-2.5 rounded">
                          <div className="font-mono font-bold text-[#0b3948] mb-1">
                            Vocabulário distintivo em {dt.sigla} ({dt.distinctiveTokens.length})
                          </div>
                          <div className="text-[#4a3d2d]">
                            {dt.distinctiveTokens.slice(0, 20).join(', ') || 'Nenhum termo exclusivo'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {trResult.mode === 'chapter' && trResult.rows && (
            <div className="divide-y qumran-divider qumran-glass gem-border rounded-xl">
              {trResult.rows.map((row) => (
                <div key={row.verse} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-[#0b3948]">
                      {trResult.ptTitle} {trResult.chapter}:{row.verse}
                    </span>
                    {row.deterministicDiffs.divineNameDivergence && (
                      <span className="text-[#9a5410] font-semibold">
                        Divergência em nome divino
                      </span>
                    )}
                  </div>

                  {row.original && (
                    <div className="flex items-start justify-between gap-3 qumran-glass-inset p-2.5 rounded">
                      <p className="flex-1 font-hebrew text-lg text-[#1f1912]" dir="rtl" lang="he">
                        {trLayer === 'original'
                          ? row.original.originalPlain
                          : trLayer === 'consonantal'
                            ? row.original.consonantalSpaced
                            : trLayer === 'stream'
                              ? row.original.stream
                              : row.original.vocalized}
                      </p>
                      <AudioPlayButton
                        audioId={`trcmp-ch-he-${trResult.bookId}-${trResult.chapter}-${row.verse}`}
                        text={row.original.vocalized}
                        lang="he-IL"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {row.entries.map((entry) => (
                      <div key={entry.translationId} className="qumran-glass-inset p-3 rounded space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-mono font-bold text-[#0b3948]">{entry.sigla}</span>
                          {entry.text && (
                            <AudioPlayButton
                              audioId={`trcmp-ch-${entry.translationId}-${trResult.chapter}-${row.verse}`}
                              text={entry.text}
                              lang={entry.language || 'pt-BR'}
                            />
                          )}
                        </div>
                        <p className="text-xs text-[#4a3d2d] leading-relaxed">
                          {entry.text ?? `[${entry.state?.status ?? 'ausente'}]`}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
