import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, BookmarkPlus, ChevronDown, ChevronUp, Search } from 'lucide-react';
import type { ManifestBook, OccurrenceItem, SearchPresetPayload } from '../types';
import { fetchJson } from '../utils/api';
import { AudioPlayButton } from './AudioPlayButton';
import { HebrewKeyboard } from './HebrewKeyboard';
import { HighlightedHebrewText } from './HighlightedHebrewText';
import { OccurrenceList } from './OccurrenceList';

interface ContinuousSearchResult {
  queries: string[];
  totalCount: number;
  page: number;
  pageSize: number;
  boundaryBreakdown: Record<string, number>;
  bookBreakdown: Array<{ book: string; slug: string; ptBook: string; count: number }>;
  occurrences: OccurrenceItem[];
  crossBookMatches: Array<{
    fromBook: string;
    toBook: string;
    matchedStream: string;
    globalStart: number;
    globalEnd: number;
  }>;
  algorithmVersion: string;
  computationalLimits: string;
}

interface ElsResult {
  query: string;
  book: string;
  ptBook?: string;
  totalHits: number;
  expectedRandomHits: number;
  observedOverExpected: number | null;
  hits: Array<{
    skip: number;
    bookSlug: string;
    startOffset: number;
    endOffset: number;
    referenceStart: string;
    referenceEnd: string;
    letterOffsets: number[];
    verseStartVocalized: string;
    matchedLetters: Array<{
      queryIndex: number;
      letter: string;
      offset: number;
      reference: string;
      chapter: number;
      verse: number;
      localOffset: number;
    }>;
    verseSpans: Array<{
      reference: string;
      slug: string;
      chapter: number;
      verse: number;
      vocalized: string;
      consonantal: string;
      translationPt: string;
      streamLength: number;
      highlights: Array<{ localOffset: number; queryIndex: number; letter: string }>;
    }>;
    letterWindows: Array<{
      queryIndex: number;
      offset: number;
      reference: string;
      before: string;
      letter: string;
      after: string;
    }>;
  }>;
  computationalLimits: string;
  algorithmVersion: string;
}

interface ContinuousSearchViewProps {
  books: ManifestBook[];
  preferredTranslationId?: string;
  initialPreset?: SearchPresetPayload | null;
  onSaveToNotebook: (item: {
    title: string;
    reference: string;
    hebrew_snippet: string;
    evidence_tier: string;
    parameters_json: string;
  }) => void;
  onInspectChapter: (slug: string, chapter: number) => void;
}

export const ContinuousSearchView: React.FC<ContinuousSearchViewProps> = ({
  books,
  preferredTranslationId,
  initialPreset,
  onSaveToNotebook,
  onInspectChapter,
}) => {
  const [subMode, setSubMode] = useState<'stream' | 'els'>('stream');
  const [query, setQuery] = useState('יהוה');
  const [division, setDivision] = useState('all');
  const [bookSlug, setBookSlug] = useState('all');
  const [boundaryFilter, setBoundaryFilter] = useState('all');
  const [normalizeFinals, setNormalizeFinals] = useState(false);
  const [crossBooks, setCrossBooks] = useState(false);
  const [page, setPage] = useState(1);

  // ELS state
  const [elsBook, setElsBook] = useState('genesis');
  const [minSkip, setMinSkip] = useState(49);
  const [maxSkip, setMaxSkip] = useState(50);
  const [includeNegative, setIncludeNegative] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamResult, setStreamResult] = useState<ContinuousSearchResult | null>(null);
  const [elsResult, setElsResult] = useState<ElsResult | null>(null);
  const [expandedElsWindows, setExpandedElsWindows] = useState<Record<number, boolean>>({});
  const activeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();
    };
  }, []);

  const executeStreamSearch = async (params: {
    targetPage: number;
    q: string;
    div: string;
    bk: string;
    bf: string;
    norm: boolean;
    cb: boolean;
  }) => {
    activeAbortRef.current?.abort();
    const controller = new AbortController();
    activeAbortRef.current = controller;

    setLoading(true);
    setError(null);
    setPage(params.targetPage);
    try {
      const json = await fetchJson<ContinuousSearchResult>('/api/search/continuous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          query: params.q,
          division: params.div,
          bookSlug: params.bk,
          boundaryFilter: params.bf,
          normalizeFinals: params.norm,
          crossBooks: params.cb,
          page: params.targetPage,
          pageSize: 40,
          translationId: preferredTranslationId,
        }),
      });
      setStreamResult(json);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Erro ao executar busca no stream contínuo.');
    } finally {
      if (activeAbortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  const executeElsSearch = async (params: {
    q: string;
    bk: string;
    minS: number;
    maxS: number;
    neg: boolean;
    norm: boolean;
  }) => {
    activeAbortRef.current?.abort();
    const controller = new AbortController();
    activeAbortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson<ElsResult>('/api/search/els', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          query: params.q,
          bookSlug: params.bk,
          minSkip: params.minS,
          maxSkip: params.maxS,
          includeNegative: params.neg,
          normalizeFinals: params.norm,
          translationId: preferredTranslationId,
        }),
      });
      setElsResult(json);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Erro ao executar varredura ELS.');
    } finally {
      if (activeAbortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!initialPreset) return;
    setSubMode(initialPreset.subMode);
    setQuery(initialPreset.query);
    if (initialPreset.subMode === 'stream') {
      const nextDiv = initialPreset.division ?? 'all';
      const nextBk = initialPreset.bookSlug ?? 'all';
      const nextBf = initialPreset.boundaryFilter ?? 'all';
      const nextNorm = Boolean(initialPreset.normalizeFinals);
      setDivision(nextDiv);
      setBookSlug(nextBk);
      setBoundaryFilter(nextBf);
      setNormalizeFinals(nextNorm);
      executeStreamSearch({
        targetPage: 1,
        q: initialPreset.query,
        div: nextDiv,
        bk: nextBk,
        bf: nextBf,
        norm: nextNorm,
        cb: false,
      });
    } else {
      const nextBook = initialPreset.elsBook ?? 'genesis';
      const nextMin = initialPreset.minSkip ?? 49;
      const nextMax = initialPreset.maxSkip ?? 50;
      const nextNeg = Boolean(initialPreset.includeNegative);
      setElsBook(nextBook);
      setMinSkip(nextMin);
      setMaxSkip(nextMax);
      setIncludeNegative(nextNeg);
      executeElsSearch({
        q: initialPreset.query,
        bk: nextBook,
        minS: nextMin,
        maxS: nextMax,
        neg: nextNeg,
        norm: false,
      });
    }
  }, [initialPreset?.nonce]);

  const runStreamSearch = (targetPage = 1) =>
    executeStreamSearch({
      targetPage,
      q: query,
      div: division,
      bk: bookSlug,
      bf: boundaryFilter,
      norm: normalizeFinals,
      cb: crossBooks,
    });

  const runElsSearch = () =>
    executeElsSearch({
      q: query,
      bk: elsBook,
      minS: minSkip,
      maxS: maxSkip,
      neg: includeNegative,
      norm: normalizeFinals,
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (subMode === 'stream') {
      runStreamSearch(1);
    } else {
      runElsSearch();
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="qumran-glass gem-border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 qumran-glass-inset rounded-lg">
            <button
              type="button"
              onClick={() => setSubMode('stream')}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                subMode === 'stream'
                  ? 'bg-[#0e4d64] text-[#fefaf0] shadow-xs'
                  : 'text-[#4a3d2d] hover:text-[#1f1912]'
              }`}
            >
              Stream Contínuo & Ressegmentação
            </button>
            <button
              type="button"
              onClick={() => setSubMode('els')}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                subMode === 'els'
                  ? 'bg-[#0e4d64] text-[#fefaf0] shadow-xs'
                  : 'text-[#4a3d2d] hover:text-[#1f1912]'
              }`}
            >
              ELS Opcional (Equidistante)
            </button>
          </div>

          <span className="text-xs text-[#5c4d3c]">
            Consultas múltiplas: separe termos por vírgula (autômato Aho-Corasick)
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-6">
            <label htmlFor="continuous-query" className="block text-xs text-[#5c4d3c] mb-1">
              Sequência consonantal hebraica (ou múltiplos termos separados por vírgula)
            </label>
            <input
              id="continuous-query"
              type="text"
              dir="rtl"
              lang="he"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex.: יהוה ou אניאניהוא"
              className="w-full px-3.5 py-2 text-lg font-hebrew border rounded"
            />
          </div>

          {subMode === 'stream' ? (
            <>
              <div className="lg:col-span-3">
                <label htmlFor="search-division" className="block text-xs text-[#5c4d3c] mb-1">
                  Divisão / Livro
                </label>
                <select
                  id="search-division"
                  value={bookSlug !== 'all' ? `book:${bookSlug}` : `div:${division}`}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith('book:')) {
                      setBookSlug(val.slice(5));
                      setDivision('all');
                    } else {
                      setDivision(val.slice(4));
                      setBookSlug('all');
                    }
                  }}
                  className="w-full px-3 py-2.5 text-sm border rounded"
                >
                  <option value="div:all">Todo o Tanakh (39 livros)</option>
                  <option value="div:Torah">Torá (5 livros)</option>
                  <option value="div:Prophets">Nevi’im / Profetas (21 livros)</option>
                  <option value="div:Writings">Ketuvim / Escritos (13 livros)</option>
                  <optgroup label="Livros individuais">
                    {books.map((b) => (
                      <option key={b.slug} value={`book:${b.slug}`}>
                        {b.ptTitle}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="lg:col-span-3">
                <label htmlFor="search-boundary" className="block text-xs text-[#5c4d3c] mb-1">
                  Classificação de fronteira
                </label>
                <select
                  id="search-boundary"
                  value={boundaryFilter}
                  onChange={(e) => setBoundaryFilter(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border rounded"
                >
                  <option value="all">Todas as ocorrências no stream</option>
                  <option value="exact_word">Somente palavra exata</option>
                  <option value="multi_word">Múltiplas palavras íntegras</option>
                  <option value="resegmented">Ressegmentação (cruza palavras)</option>
                  <option value="cross_verse">Cruza fronteira de versículos</option>
                  <option value="substring">Subcadeia intra-palavra</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="lg:col-span-2">
                <label htmlFor="els-book" className="block text-xs text-[#5c4d3c] mb-1">
                  Livro alvo
                </label>
                <select
                  id="els-book"
                  value={elsBook}
                  onChange={(e) => setElsBook(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border rounded"
                >
                  {books.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.ptTitle}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label htmlFor="els-min" className="block text-xs text-[#5c4d3c] mb-1">
                  Salto mín. |d|
                </label>
                <input
                  id="els-min"
                  type="number"
                  min={1}
                  max={500}
                  value={minSkip}
                  onChange={(e) => setMinSkip(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border rounded"
                />
              </div>
              <div className="lg:col-span-2">
                <label htmlFor="els-max" className="block text-xs text-[#5c4d3c] mb-1">
                  Salto máx. |d|
                </label>
                <input
                  id="els-max"
                  type="number"
                  min={1}
                  max={500}
                  value={maxSkip}
                  onChange={(e) => setMaxSkip(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border rounded"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs text-[#4a3d2d]">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={normalizeFinals}
                onChange={(e) => setNormalizeFinals(e.target.checked)}
                className="rounded border-[#926c3c]/50 accent-[#0e4d64]"
              />
              Camada experimental: normalizar letras finais (ךםןףץ → כמנפצ)
            </label>
            {subMode === 'stream' ? (
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={crossBooks}
                  onChange={(e) => setCrossBooks(e.target.checked)}
                  className="rounded border-[#926c3c]/50 accent-[#0e4d64]"
                />
                Permitir travessia entre fronteiras de livros
              </label>
            ) : (
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeNegative}
                  onChange={(e) => setIncludeNegative(e.target.checked)}
                  className="rounded border-[#926c3c]/50 accent-[#0e4d64]"
                />
                Incluir saltos negativos (-d)
              </label>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-[#fefaf0] bg-[#0e4d64] hover:bg-[#0b3948] border border-[#d99f45]/45 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
          >
            <Search className="w-4 h-4 text-[#fbbf24]" />
            {loading ? 'Pesquisando…' : subMode === 'stream' ? 'Executar busca no stream' : 'Executar varredura ELS'}
          </button>
        </div>

        <HebrewKeyboard
          onInsert={(ch) => setQuery((q) => q + ch)}
          presets={[
            { label: 'Tetragrama', value: 'יהוה' },
            { label: 'Dt 32:39', value: 'אניאניהוא' },
            { label: 'Êx 34:6', value: 'יהוהיהוה' },
            { label: 'Is 43:11', value: 'אנכיאנכייהוה' },
            { label: 'Gn 3:13', value: 'מהזאתעשית' },
            { label: 'Torah (ELS)', value: 'תורה' },
          ]}
          onSelectPreset={(val) => setQuery(val)}
        />
      </form>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-rose-900 bg-rose-100/85 border border-rose-300 rounded-xl">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => (subMode === 'stream' ? runStreamSearch(1) : runElsSearch())}
            className="px-2.5 py-1 font-semibold bg-rose-900 text-white rounded hover:bg-rose-800 cursor-pointer shrink-0"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {subMode === 'stream' && streamResult && (
        <div className="space-y-4">
          <div className="qumran-glass gem-border rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-2xl font-mono font-bold tabular-nums text-[#0b3948]">
                  {streamResult.totalCount.toLocaleString('pt-BR')}
                </span>
                <span className="text-sm text-[#4a3d2d]">ocorrências totais encontradas</span>
                <span className="text-xs text-[#926c3c]">·</span>
                <span className="text-xs font-mono text-[#5c4d3c]">{streamResult.algorithmVersion}</span>
              </div>
              <div className="text-xs text-[#5c4d3c]">{streamResult.computationalLimits}</div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#4a3d2d] pt-2 border-t qumran-divider">
              <span>Palavra exata: <strong className="font-mono tabular-nums text-[#0b3948]">{streamResult.boundaryBreakdown.exact_word}</strong></span>
              <span>·</span>
              <span>Múltiplas palavras: <strong className="font-mono tabular-nums text-[#0b3948]">{streamResult.boundaryBreakdown.multi_word}</strong></span>
              <span>·</span>
              <span className="text-[#9a5410]">Ressegmentação: <strong className="font-mono tabular-nums">{streamResult.boundaryBreakdown.resegmented}</strong></span>
              <span>·</span>
              <span className="text-[#9a5410]">Cruza versículo: <strong className="font-mono tabular-nums">{streamResult.boundaryBreakdown.cross_verse}</strong></span>
              <span>·</span>
              <span>Subcadeia interna: <strong className="font-mono tabular-nums text-[#1f1912]">{streamResult.boundaryBreakdown.substring}</strong></span>
            </div>

            {streamResult.bookBreakdown.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5c4d3c] pt-2 border-t qumran-divider">
                <span>Distribuição principal:</span>
                {streamResult.bookBreakdown.slice(0, 10).map((b) => (
                  <span key={b.slug}>
                    {b.ptBook} (<strong className="font-mono tabular-nums text-[#1f1912]">{b.count}</strong>)
                  </span>
                ))}
              </div>
            )}

            {streamResult.crossBookMatches.length > 0 && (
              <div className="p-3 bg-[#f59e0b]/15 border border-[#b45309]/35 rounded text-xs text-[#78350f] space-y-1">
                <div className="font-semibold">Ocorrências atravessando fronteira entre livros ({streamResult.crossBookMatches.length}):</div>
                {streamResult.crossBookMatches.map((cm, idx) => (
                  <div key={idx} className="font-mono">
                    {cm.fromBook} → {cm.toBook} | offsets globais [{cm.globalStart}..{cm.globalEnd}) |{' '}
                    <span className="font-hebrew text-sm" dir="rtl" lang="he">{cm.matchedStream}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <OccurrenceList
            items={streamResult.occurrences}
            onSaveToNotebook={onSaveToNotebook}
            onInspectChapter={onInspectChapter}
          />

          {streamResult.totalCount > streamResult.pageSize && (
            <div className="flex items-center justify-between qumran-glass gem-border rounded-xl px-4 py-3 text-xs">
              <span className="font-mono tabular-nums text-[#4a3d2d]">
                Página {page} de {Math.ceil(streamResult.totalCount / streamResult.pageSize)} ({streamResult.totalCount.toLocaleString('pt-BR')} registros no total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => runStreamSearch(page - 1)}
                  className="px-3 py-1.5 border border-[#926c3c]/35 qumran-glass-inset rounded hover:bg-[#ebd8b5]/80 disabled:opacity-40 cursor-pointer"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page * streamResult.pageSize >= streamResult.totalCount || loading}
                  onClick={() => runStreamSearch(page + 1)}
                  className="px-3 py-1.5 border border-[#926c3c]/35 qumran-glass-inset rounded hover:bg-[#ebd8b5]/80 disabled:opacity-40 cursor-pointer"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {subMode === 'els' && elsResult && (
        <div className="qumran-glass gem-border rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-4 border-b qumran-divider">
            <div>
              <div className="text-xs text-[#5c4d3c]">Ocorrências ELS observadas</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-[#0b3948]">{elsResult.totalHits}</div>
            </div>
            <div>
              <div className="text-xs text-[#5c4d3c]">Expectativa aleatória (controle)</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-[#4a3d2d]">{elsResult.expectedRandomHits}</div>
            </div>
            <div>
              <div className="text-xs text-[#5c4d3c]">Razão Observado / Esperado</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-[#9a5410]">
                {elsResult.observedOverExpected !== null ? `${elsResult.observedOverExpected}×` : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#5c4d3c]">Algoritmo e limites</div>
              <div className="text-xs text-[#4a3d2d] mt-1">{elsResult.computationalLimits}</div>
            </div>
          </div>

          <div className="divide-y qumran-divider">
            {elsResult.hits.map((h, idx) => {
              const showWindows = Boolean(expandedElsWindows[idx]);
              return (
                <div key={idx} className="py-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#4a3d2d]">
                      <span className="font-semibold text-[#1f1912]">{h.referenceStart} → {h.referenceEnd}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums font-bold text-[#0e4d64]">salto d = {h.skip}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">offsets [{h.letterOffsets.join(', ')}]</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedElsWindows((prev) => ({ ...prev, [idx]: !showWindows }))
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#4a3d2d] hover:text-[#1f1912] qumran-glass-inset rounded transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {showWindows ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        Alinhamento no stream
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onSaveToNotebook({
                            title: `ELS ${elsResult.query} (d=${h.skip}) — ${h.referenceStart}`,
                            reference: `${h.referenceStart} → ${h.referenceEnd}`,
                            hebrew_snippet: h.verseStartVocalized,
                            evidence_tier: 'correspondencia_estrutural',
                            parameters_json: JSON.stringify({
                              query: elsResult.query,
                              skip: h.skip,
                              offsets: h.letterOffsets,
                            }),
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0e4d64] hover:bg-[#0e4d64]/10 border border-[#0e4d64]/30 rounded transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        Salvar
                      </button>
                    </div>
                  </div>

                  {/* Sequência de letras buscadas em ordem RTL com posição e referência */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 qumran-glass-inset rounded px-3 py-2 text-xs" dir="rtl">
                    <span className="text-[#5c4d3c]" dir="ltr">
                      Letras buscadas:
                    </span>
                    {h.matchedLetters.map((ml) => (
                      <span
                        key={`${ml.queryIndex}-${ml.offset}`}
                        className="inline-flex items-center gap-1.5"
                      >
                        <span className="font-mono text-[11px] text-[#5c4d3c]" dir="ltr">
                          #{ml.queryIndex + 1}
                        </span>
                        <mark
                          className="font-hebrew text-lg font-bold bg-[#fbbf24] text-[#1f1912] px-1 rounded-[2px] shadow-[0_0_0_1.5px_#0e4d64]"
                          lang="he"
                        >
                          {ml.letter}
                        </mark>
                        <span className="text-[11px] text-[#4a3d2d]" dir="ltr">
                          {ml.reference} <span className="font-mono text-[#6d5b45]">[{ml.offset}]</span>
                        </span>
                      </span>
                    ))}
                  </div>

                  {/* Todos os versículos abrangidos pelo salto ELS com destaque nas letras buscadas */}
                  <div className="space-y-2">
                    {h.verseSpans.map((vs) => (
                      <div
                        key={`${vs.slug}-${vs.chapter}-${vs.verse}`}
                        className="qumran-glass-inset p-3 rounded space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => onInspectChapter(vs.slug, vs.chapter)}
                            className="font-semibold text-[#0e4d64] hover:text-[#9a5410] hover:underline cursor-pointer"
                          >
                            {vs.reference}
                          </button>
                          <span className="text-[#5c4d3c] font-mono tabular-nums">
                            {vs.highlights.length === 1
                              ? `Letra #${vs.highlights[0].queryIndex + 1} (${vs.highlights[0].letter})`
                              : `Letras ${vs.highlights.map((hl) => `#${hl.queryIndex + 1} (${hl.letter})`).join(', ')}`}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-3">
                          <HighlightedHebrewText
                            vocalized={vs.vocalized}
                            consonantal={vs.consonantal}
                            expectedStreamLength={vs.streamLength}
                            highlights={vs.highlights}
                            className="flex-1 font-hebrew text-xl leading-relaxed text-[#1f1912]"
                          />
                          <div className="pt-1 shrink-0">
                            <AudioPlayButton
                              audioId={`els-he-${idx}-${vs.chapter}-${vs.verse}`}
                              text={vs.vocalized}
                              lang="he-IL"
                              label="Ouvir"
                            />
                          </div>
                        </div>

                        {vs.translationPt && (
                          <div className="flex items-start justify-between gap-3">
                            <p className="flex-1 text-xs text-[#4a3d2d] leading-relaxed">{vs.translationPt}</p>
                            <AudioPlayButton
                              audioId={`els-pt-${idx}-${vs.chapter}-${vs.verse}`}
                              text={vs.translationPt}
                              lang="pt-BR"
                              label="Ouvir"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Alinhamento vertical opcional no stream consonantal */}
                  {showWindows && (
                    <div className="qumran-glass gem-border rounded p-3 space-y-1.5">
                      <div className="text-[11px] text-[#5c4d3c] flex items-center justify-between">
                        <span>Janela consonantal centrada em cada letra do salto (d = {h.skip})</span>
                        <span>±10 letras adjacentes no stream</span>
                      </div>
                      <div className="divide-y qumran-divider">
                        {h.letterWindows.map((lw) => (
                          <div
                            key={`${lw.queryIndex}-${lw.offset}`}
                            className="py-1.5 flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="font-mono text-[11px] text-[#5c4d3c] shrink-0 w-36">
                              #{lw.queryIndex + 1} · {lw.reference} [{lw.offset}]
                            </span>
                            <div
                              className="flex-1 font-hebrew text-lg tracking-wider flex items-center justify-center gap-0.5 overflow-x-auto"
                              dir="rtl"
                              lang="he"
                            >
                              <span className="text-[#6d5b45]">{lw.before}</span>
                              <mark className="bg-[#fbbf24] text-[#1f1912] font-bold px-1 rounded-[2px] shadow-[0_0_0_1.5px_#0e4d64]">
                                {lw.letter}
                              </mark>
                              <span className="text-[#6d5b45]">{lw.after}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {elsResult.hits.length === 0 && (
              <p className="text-sm text-[#5c4d3c] py-4">Nenhuma sequência ELS encontrada para os parâmetros informados.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
