import React, { useState } from 'react';
import { BookmarkPlus, ChevronDown, ChevronUp, Search } from 'lucide-react';
import type { ManifestBook, OccurrenceItem } from '../types';
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
  const [streamResult, setStreamResult] = useState<ContinuousSearchResult | null>(null);
  const [elsResult, setElsResult] = useState<ElsResult | null>(null);
  const [expandedElsWindows, setExpandedElsWindows] = useState<Record<number, boolean>>({});

  const runStreamSearch = async (targetPage = 1) => {
    setLoading(true);
    setPage(targetPage);
    try {
      const res = await fetch('/api/search/continuous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          division,
          bookSlug,
          boundaryFilter,
          normalizeFinals,
          crossBooks,
          page: targetPage,
          pageSize: 40,
        }),
      });
      const json = (await res.json()) as ContinuousSearchResult;
      setStreamResult(json);
    } finally {
      setLoading(false);
    }
  };

  const runElsSearch = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/search/els', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          bookSlug: elsBook,
          minSkip,
          maxSkip,
          includeNegative,
          normalizeFinals,
        }),
      });
      const json = (await res.json()) as ElsResult;
      setElsResult(json);
    } finally {
      setLoading(false);
    }
  };

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
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setSubMode('stream')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                subMode === 'stream' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stream Contínuo & Ressegmentação
            </button>
            <button
              type="button"
              onClick={() => setSubMode('els')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                subMode === 'els' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ELS Opcional (Equidistante)
            </button>
          </div>

          <span className="text-xs text-slate-500">
            Consultas múltiplas: separe termos por vírgula (autômato Aho-Corasick)
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-6">
            <label htmlFor="continuous-query" className="block text-xs text-slate-500 mb-1">
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
              className="w-full px-3.5 py-2 text-lg font-hebrew bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
            />
          </div>

          {subMode === 'stream' ? (
            <>
              <div className="lg:col-span-3">
                <label htmlFor="search-division" className="block text-xs text-slate-500 mb-1">
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
                  className="w-full px-3 py-2.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
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
                <label htmlFor="search-boundary" className="block text-xs text-slate-500 mb-1">
                  Classificação de fronteira
                </label>
                <select
                  id="search-boundary"
                  value={boundaryFilter}
                  onChange={(e) => setBoundaryFilter(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
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
                <label htmlFor="els-book" className="block text-xs text-slate-500 mb-1">
                  Livro alvo
                </label>
                <select
                  id="els-book"
                  value={elsBook}
                  onChange={(e) => setElsBook(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-slate-300 rounded"
                >
                  {books.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.ptTitle}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label htmlFor="els-min" className="block text-xs text-slate-500 mb-1">
                  Salto mín. |d|
                </label>
                <input
                  id="els-min"
                  type="number"
                  min={1}
                  max={500}
                  value={minSkip}
                  onChange={(e) => setMinSkip(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded"
                />
              </div>
              <div className="lg:col-span-2">
                <label htmlFor="els-max" className="block text-xs text-slate-500 mb-1">
                  Salto máx. |d|
                </label>
                <input
                  id="els-max"
                  type="number"
                  min={1}
                  max={500}
                  value={maxSkip}
                  onChange={(e) => setMaxSkip(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={normalizeFinals}
                onChange={(e) => setNormalizeFinals(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              Camada experimental: normalizar letras finais (ךםןףץ → כמנפצ)
            </label>
            {subMode === 'stream' ? (
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={crossBooks}
                  onChange={(e) => setCrossBooks(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
                Permitir travessia entre fronteiras de livros
              </label>
            ) : (
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeNegative}
                  onChange={(e) => setIncludeNegative(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
                Incluir saltos negativos (-d)
              </label>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Pesquisando…' : subMode === 'stream' ? 'Executar busca no stream' : 'Executar varredura ELS'}
          </button>
        </div>

        <HebrewKeyboard
          onInsert={(ch) => setQuery((q) => q + ch)}
          presets={[
            { label: 'Tetragrama', value: 'יהוה' },
            { label: 'Dt 32:39', value: 'אניאניהוא' },
            { label: 'Is 43:11', value: 'אנכיאנכייהוה' },
            { label: 'Gn 3:13', value: 'מהזאתעשית' },
            { label: 'Torah (ELS)', value: 'תורה' },
          ]}
          onSelectPreset={(val) => setQuery(val)}
        />
      </form>

      {subMode === 'stream' && streamResult && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-2xl font-mono font-semibold tabular-nums text-slate-900">
                  {streamResult.totalCount.toLocaleString()}
                </span>
                <span className="text-sm text-slate-600">ocorrências totais encontradas</span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs font-mono text-slate-500">{streamResult.algorithmVersion}</span>
              </div>
              <div className="text-xs text-slate-500">{streamResult.computationalLimits}</div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <span>Palavra exata: <strong className="font-mono tabular-nums text-slate-900">{streamResult.boundaryBreakdown.exact_word}</strong></span>
              <span>·</span>
              <span>Múltiplas palavras: <strong className="font-mono tabular-nums text-slate-900">{streamResult.boundaryBreakdown.multi_word}</strong></span>
              <span>·</span>
              <span className="text-amber-800">Ressegmentação: <strong className="font-mono tabular-nums">{streamResult.boundaryBreakdown.resegmented}</strong></span>
              <span>·</span>
              <span className="text-amber-800">Cruza versículo: <strong className="font-mono tabular-nums">{streamResult.boundaryBreakdown.cross_verse}</strong></span>
              <span>·</span>
              <span>Subcadeia interna: <strong className="font-mono tabular-nums text-slate-900">{streamResult.boundaryBreakdown.substring}</strong></span>
            </div>

            {streamResult.bookBreakdown.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span>Distribuição principal:</span>
                {streamResult.bookBreakdown.slice(0, 10).map((b) => (
                  <span key={b.slug}>
                    {b.ptBook} (<strong className="font-mono tabular-nums text-slate-800">{b.count}</strong>)
                  </span>
                ))}
              </div>
            )}

            {streamResult.crossBookMatches.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 space-y-1">
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
            <div className="flex items-center justify-between bg-white border border-slate-200 rounded-md px-4 py-3 text-xs">
              <span className="font-mono tabular-nums text-slate-600">
                Página {page} de {Math.ceil(streamResult.totalCount / streamResult.pageSize)} ({streamResult.totalCount.toLocaleString()} registros no total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => runStreamSearch(page - 1)}
                  className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page * streamResult.pageSize >= streamResult.totalCount || loading}
                  onClick={() => runStreamSearch(page + 1)}
                  className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {subMode === 'els' && elsResult && (
        <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="text-xs text-slate-500">Ocorrências ELS observadas</div>
              <div className="text-2xl font-mono font-semibold tabular-nums text-slate-900">{elsResult.totalHits}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Expectativa aleatória (controle)</div>
              <div className="text-2xl font-mono font-semibold tabular-nums text-slate-700">{elsResult.expectedRandomHits}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Razão Observado / Esperado</div>
              <div className="text-2xl font-mono font-semibold tabular-nums text-blue-700">
                {elsResult.observedOverExpected !== null ? `${elsResult.observedOverExpected}×` : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Algoritmo e limites</div>
              <div className="text-xs text-slate-600 mt-1">{elsResult.computationalLimits}</div>
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            {elsResult.hits.map((h, idx) => {
              const showWindows = Boolean(expandedElsWindows[idx]);
              return (
                <div key={idx} className="py-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">{h.referenceStart} → {h.referenceEnd}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums font-semibold text-blue-700">salto d = {h.skip}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">offsets [{h.letterOffsets.join(', ')}]</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedElsWindows((prev) => ({ ...prev, [idx]: !showWindows }))
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded transition-colors whitespace-nowrap cursor-pointer"
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
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 border border-blue-200 rounded transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        Salvar
                      </button>
                    </div>
                  </div>

                  {/* Sequência de letras buscadas em ordem RTL com posição e referência */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-slate-50 border border-slate-100 rounded px-3 py-2 text-xs" dir="rtl">
                    <span className="text-slate-500" dir="ltr">
                      Letras buscadas:
                    </span>
                    {h.matchedLetters.map((ml) => (
                      <span
                        key={`${ml.queryIndex}-${ml.offset}`}
                        className="inline-flex items-center gap-1.5"
                      >
                        <span className="font-mono text-[11px] text-slate-500" dir="ltr">
                          #{ml.queryIndex + 1}
                        </span>
                        <mark
                          className="font-hebrew text-lg font-bold bg-amber-300 text-slate-950 px-1 rounded-[2px] shadow-[0_0_0_1.5px_#1d4ed8]"
                          lang="he"
                        >
                          {ml.letter}
                        </mark>
                        <span className="text-[11px] text-slate-600" dir="ltr">
                          {ml.reference} <span className="font-mono text-slate-400">[{ml.offset}]</span>
                        </span>
                      </span>
                    ))}
                  </div>

                  {/* Todos os versículos abrangidos pelo salto ELS com destaque nas letras buscadas */}
                  <div className="space-y-2">
                    {h.verseSpans.map((vs) => (
                      <div
                        key={`${vs.slug}-${vs.chapter}-${vs.verse}`}
                        className="bg-slate-50 p-3 rounded border border-slate-100 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => onInspectChapter(vs.slug, vs.chapter)}
                            className="font-semibold text-blue-700 hover:underline cursor-pointer"
                          >
                            {vs.reference}
                          </button>
                          <span className="text-slate-500 font-mono tabular-nums">
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
                            className="flex-1 font-hebrew text-xl leading-relaxed text-slate-900"
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
                            <p className="flex-1 text-xs text-slate-600 leading-relaxed">{vs.translationPt}</p>
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
                    <div className="bg-white border border-slate-200 rounded p-3 space-y-1.5">
                      <div className="text-[11px] text-slate-500 flex items-center justify-between">
                        <span>Janela consonantal centrada em cada letra do salto (d = {h.skip})</span>
                        <span>±10 letras adjacentes no stream</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {h.letterWindows.map((lw) => (
                          <div
                            key={`${lw.queryIndex}-${lw.offset}`}
                            className="py-1.5 flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="font-mono text-[11px] text-slate-500 shrink-0 w-36">
                              #{lw.queryIndex + 1} · {lw.reference} [{lw.offset}]
                            </span>
                            <div
                              className="flex-1 font-hebrew text-lg tracking-wider flex items-center justify-center gap-0.5 overflow-x-auto"
                              dir="rtl"
                              lang="he"
                            >
                              <span className="text-slate-400">{lw.before}</span>
                              <mark className="bg-amber-300 text-slate-950 font-bold px-1 rounded-[2px] shadow-[0_0_0_1.5px_#1d4ed8]">
                                {lw.letter}
                              </mark>
                              <span className="text-slate-400">{lw.after}</span>
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
              <p className="text-sm text-slate-500 py-4">Nenhuma sequência ELS encontrada para os parâmetros informados.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
