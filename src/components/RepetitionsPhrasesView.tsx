import React, { useState } from 'react';
import { AlertCircle, BookmarkPlus, Layers, Repeat } from 'lucide-react';
import type { ManifestBook } from '../types';
import { fetchJson } from '../utils/api';
import { AudioPlayButton } from './AudioPlayButton';

interface RepetitionItem {
  unit: string;
  unitVocalized: string;
  repeatCount: number;
  unitWordLength: number;
  unitLetterLength: number;
  book: string;
  slug: string;
  ptBook: string;
  chapter: number;
  verse: number;
  reference: string;
  startOffset: number;
  endOffset: number;
  boundaryType: 'palavra_exata' | 'subcadeia_stream';
  verseVocalized: string;
  translationPt: string;
}

interface RepetitionsResponse {
  totalCount: number;
  page: number;
  pageSize: number;
  topUnits: Array<{ unit: string; unitVocalized: string; occurrences: number; maxRepeats: number }>;
  items: RepetitionItem[];
  algorithmVersion: string;
  computationalLimits: string;
}

interface SuffixPhraseItem {
  phrase: string;
  length: number;
  frequency: number;
  sampleReference: string;
  sampleWords: string;
  sampleBoundaryType: string;
  sampleVerseVocalized: string;
  sampleTranslationPt: string;
}

interface PhrasesResponse {
  totalDiscovered: number;
  returnedCount: number;
  analyzedLetters: number;
  totalScopeLetters?: number;
  coveragePercent?: number;
  isExhaustive?: boolean;
  analyzedBooks: string[];
  truncatedCorpus: boolean;
  phrases: SuffixPhraseItem[];
  algorithmVersion: string;
  computationalLimits: string;
}

interface RepetitionsPhrasesViewProps {
  books: ManifestBook[];
  preferredTranslationId?: string;
  onSaveToNotebook: (item: {
    title: string;
    reference: string;
    hebrew_snippet: string;
    evidence_tier: string;
    parameters_json: string;
  }) => void;
  onInspectChapter: (slug: string, chapter: number) => void;
}

export const RepetitionsPhrasesView: React.FC<RepetitionsPhrasesViewProps> = ({
  books,
  preferredTranslationId,
  onSaveToNotebook,
  onInspectChapter,
}) => {
  const [tab, setTab] = useState<'consecutive' | 'suffix_array'>('consecutive');
  const [bookSlug, setBookSlug] = useState('all');
  const [division, setDivision] = useState('all');

  // Consecutive params
  const [mode, setMode] = useState<'words' | 'stream' | 'both'>('words');
  const [minRepeats, setMinRepeats] = useState(2);
  const [maxUnitWords, setMaxUnitWords] = useState(3);
  const [repData, setRepData] = useState<RepetitionsResponse | null>(null);

  // Suffix Array params
  const [saScope, setSaScope] = useState('book:genesis');
  const [minLength, setMinLength] = useState(11);
  const [maxLength, setMaxLength] = useState(32);
  const [minFrequency, setMinFrequency] = useState(5);
  const [saData, setSaData] = useState<PhrasesResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runRepetitions = async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson<RepetitionsResponse>('/api/search/repetitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          division,
          bookSlug,
          minRepeats,
          maxUnitWords,
          page: targetPage,
          pageSize: 50,
          translationId: preferredTranslationId,
        }),
      });
      setRepData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao detectar repetições.');
    } finally {
      setLoading(false);
    }
  };

  const runSuffixArray = async () => {
    setLoading(true);
    setError(null);
    try {
      const isDiv = saScope.startsWith('div:');
      const targetDivision = isDiv ? saScope.slice(4) : 'all';
      const targetBook = isDiv ? 'all' : saScope.slice(5);

      const json = await fetchJson<PhrasesResponse>('/api/search/phrases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookSlug: targetBook,
          division: targetDivision,
          minLength,
          maxLength,
          minFrequency,
          limit: 60,
          translationId: preferredTranslationId,
        }),
      });
      setSaData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao executar Suffix Array.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="qumran-glass gem-border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 qumran-glass-inset rounded-lg">
            <button
              type="button"
              onClick={() => setTab('consecutive')}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                tab === 'consecutive'
                  ? 'bg-[#0e4d64] text-[#fefaf0] shadow-xs'
                  : 'text-[#4a3d2d] hover:text-[#1f1912]'
              }`}
            >
              Repetições Consecutivas (2x, 3x+)
            </button>
            <button
              type="button"
              onClick={() => setTab('suffix_array')}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                tab === 'suffix_array'
                  ? 'bg-[#0e4d64] text-[#fefaf0] shadow-xs'
                  : 'text-[#4a3d2d] hover:text-[#1f1912]'
              }`}
            >
              Descoberta por Índice de Sufixos (LCP)
            </button>
          </div>
          <span className="text-xs text-[#5c4d3c]">
            {tab === 'consecutive'
              ? 'Detecta repetições adjacentes sem lista prévia (ex.: קדוש קדוש קדוש, ארץ ארץ ארץ, יהוה יהוה)'
              : 'Descobre frases recorrentes automaticamente por Suffix Array Radix O(N log N) + Kasai LCP'}
          </span>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 px-3 py-2 text-xs text-rose-900 bg-rose-100/85 border border-rose-300 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {tab === 'consecutive' ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3">
              <label className="block text-xs text-[#5c4d3c] mb-1">Escopo</label>
              <select
                value={bookSlug !== 'all' ? `book:${bookSlug}` : `div:${division}`}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith('book:')) {
                    setBookSlug(v.slice(5));
                    setDivision('all');
                  } else {
                    setDivision(v.slice(4));
                    setBookSlug('all');
                  }
                }}
                className="w-full px-3 py-2 text-sm border rounded"
              >
                <option value="div:all">Todo o Tanakh (39 livros)</option>
                <option value="div:Torah">Torá</option>
                <option value="div:Prophets">Nevi’im</option>
                <option value="div:Writings">Ketuvim</option>
                {books.map((b) => (
                  <option key={b.slug} value={`book:${b.slug}`}>
                    {b.ptTitle}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-[#5c4d3c] mb-1">Camada de detecção</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'words' | 'stream' | 'both')}
                className="w-full px-3 py-2 text-sm border rounded"
              >
                <option value="words">Fronteiras reais de palavras</option>
                <option value="both">Palavras + tandem repeats no stream</option>
                <option value="stream">Somente tandem repeats no stream</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[#5c4d3c] mb-1">Repetições mín.</label>
              <select
                value={minRepeats}
                onChange={(e) => setMinRepeats(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border rounded"
              >
                <option value={2}>2x ou mais</option>
                <option value={3}>3x ou mais</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[#5c4d3c] mb-1">Máx. palavras/bloco</label>
              <select
                value={maxUnitWords}
                onChange={(e) => setMaxUnitWords(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border rounded"
              >
                <option value={1}>1 palavra</option>
                <option value={2}>Até 2 palavras</option>
                <option value={3}>Até 3 palavras</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => runRepetitions(1)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-[#fefaf0] bg-[#0e4d64] hover:bg-[#0b3948] border border-[#d99f45]/45 rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                <Repeat className="w-4 h-4 text-[#fbbf24]" />
                {loading ? 'Analisando…' : 'Detectar'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="block text-xs text-[#5c4d3c] mb-1">Divisão ou Livro para Suffix Array</label>
              <select
                value={saScope}
                onChange={(e) => setSaScope(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded"
              >
                <option value="div:all">Todo o Tanakh (39 livros · exaustivo 1.196.840 letras)</option>
                <option value="div:Torah">Torá completa (5 livros)</option>
                <option value="div:Prophets">Nevi’im / Profetas completos (21 livros)</option>
                <option value="div:Writings">Ketuvim / Escritos completos (13 livros)</option>
                <optgroup label="Livros individuais">
                  {books.map((b) => (
                    <option key={b.slug} value={`book:${b.slug}`}>
                      {b.ptTitle} ({b.letters.toLocaleString('pt-BR')} letras)
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[#5c4d3c] mb-1">Comprimento mín.</label>
              <input
                type="number"
                min={4}
                max={40}
                value={minLength}
                onChange={(e) => setMinLength(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border rounded"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[#5c4d3c] mb-1">Comprimento máx.</label>
              <input
                type="number"
                min={6}
                max={80}
                value={maxLength}
                onChange={(e) => setMaxLength(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border rounded"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[#5c4d3c] mb-1">Frequência mín.</label>
              <input
                type="number"
                min={2}
                max={100}
                value={minFrequency}
                onChange={(e) => setMinFrequency(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border rounded"
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="button"
                disabled={loading}
                onClick={runSuffixArray}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-[#fefaf0] bg-[#0e4d64] hover:bg-[#0b3948] border border-[#d99f45]/45 rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                <Layers className="w-4 h-4 text-[#fbbf24]" />
                {loading ? 'Indexando…' : 'Descobrir'}
              </button>
            </div>
          </div>
        )}
      </div>

      {tab === 'consecutive' && repData && (
        <div className="space-y-4">
          <div className="qumran-glass gem-border rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-mono font-bold tabular-nums text-[#0b3948]">
                  {repData.totalCount.toLocaleString('pt-BR')}
                </span>
                <span className="text-sm text-[#4a3d2d]">repetições consecutivas detectadas</span>
                <span className="text-xs font-mono text-[#5c4d3c]">{repData.algorithmVersion}</span>
              </div>
              <span className="text-xs text-[#5c4d3c]">{repData.computationalLimits}</span>
            </div>

            {repData.topUnits.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t qumran-divider text-xs">
                <span className="text-[#5c4d3c]">Unidades mais frequentes:</span>
                {repData.topUnits.slice(0, 12).map((u, idx) => (
                  <span key={idx} className="text-[#1f1912]">
                    <span className="font-hebrew text-base font-bold text-[#0b3948]" dir="rtl" lang="he">{u.unitVocalized}</span>{' '}
                    <span className="font-mono tabular-nums text-[#5c4d3c]">({u.occurrences}×, máx {u.maxRepeats}×)</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="divide-y qumran-divider qumran-glass gem-border rounded-xl">
            {repData.items.map((item, idx) => (
              <div key={`${item.slug}-${item.startOffset}-${idx}`} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#4a3d2d]">
                    <button
                      type="button"
                      onClick={() => onInspectChapter(item.slug, item.chapter)}
                      className="text-sm font-bold text-[#0b3948] hover:text-[#9a5410] cursor-pointer"
                    >
                      {item.reference}
                    </button>
                    <span>·</span>
                    <span className="font-mono tabular-nums font-bold text-[#9a5410]">
                      {item.repeatCount}× adjacente
                    </span>
                    <span>·</span>
                    <span>{item.boundaryType === 'palavra_exata' ? 'Palavra exata' : 'Subcadeia no stream'}</span>
                    <span>·</span>
                    <span className="font-mono tabular-nums text-[#6d5b45]">
                      [{item.startOffset}..{item.endOffset})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onSaveToNotebook({
                        title: `Repetição ${item.repeatCount}x (${item.unit}) — ${item.reference}`,
                        reference: item.reference,
                        hebrew_snippet: item.verseVocalized,
                        evidence_tier: 'evidencia_textual',
                        parameters_json: JSON.stringify({ unit: item.unit, repeatCount: item.repeatCount }),
                      })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0e4d64] border border-[#0e4d64]/30 rounded hover:bg-[#0e4d64]/10 cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    Salvar
                  </button>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 qumran-glass-inset p-3.5 rounded-lg">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="flex-1 font-hebrew text-xl text-[#1f1912]" dir="rtl" lang="he">{item.verseVocalized}</p>
                      <AudioPlayButton
                        audioId={`rep-he-${item.slug}-${item.startOffset}-${idx}`}
                        text={item.verseVocalized}
                        lang="he-IL"
                        label="Ouvir"
                      />
                    </div>
                    {item.translationPt && (
                      <div className="flex items-start justify-between gap-3">
                        <p className="flex-1 text-sm text-[#4a3d2d]">{item.translationPt}</p>
                        <AudioPlayButton
                          audioId={`rep-pt-${item.slug}-${item.startOffset}-${idx}`}
                          text={item.translationPt}
                          lang="pt-BR"
                          label="Ouvir"
                        />
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right md:border-l qumran-divider md:pl-4 space-y-1">
                    <div className="flex items-center justify-end gap-2">
                      <AudioPlayButton
                        audioId={`rep-unit-${item.slug}-${item.startOffset}-${idx}`}
                        text={item.unitVocalized}
                        lang="he-IL"
                      />
                      <span className="text-xs text-[#5c4d3c]">Unidade repetida</span>
                    </div>
                    <div className="font-hebrew text-xl font-bold gem-hebrew" dir="rtl" lang="he">
                      {item.unitVocalized}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'suffix_array' && saData && (
        <div className="space-y-4">
          <div className="qumran-glass gem-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#4a3d2d]">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="font-mono tabular-nums text-base text-[#0b3948]">{saData.totalDiscovered}</strong>
              <span>padrões recorrentes descobertos em</span>
              <strong className="font-mono tabular-nums text-[#1f1912]">
                {saData.analyzedLetters.toLocaleString('pt-BR')}
              </strong>
              <span>
                de {(saData.totalScopeLetters ?? saData.analyzedLetters).toLocaleString('pt-BR')} letras (
                <strong className={saData.isExhaustive !== false ? 'text-[#047857]' : 'text-[#9a5410]'}>
                  {saData.coveragePercent ?? 100}% · {saData.isExhaustive !== false ? 'Varredura exaustiva' : 'Parcial'}
                </strong>
                )
              </span>
              <span className="font-mono text-[#6d5b45]">({saData.algorithmVersion})</span>
            </div>
            <div>{saData.computationalLimits}</div>
          </div>

          <div className="overflow-x-auto qumran-glass gem-border rounded-xl">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b qumran-divider bg-[#e8d6b3]/50 text-xs text-[#4a3d2d]">
                  <th className="py-2.5 px-4 font-semibold">Padrão no Stream</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Freq.</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Letras</th>
                  <th className="py-2.5 px-4 font-semibold">Amostra / Referência</th>
                  <th className="py-2.5 px-4 font-semibold">Versículo de Amostra</th>
                </tr>
              </thead>
              <tbody className="divide-y qumran-divider">
                {saData.phrases.map((p, idx) => (
                  <tr key={idx} className="hover:bg-[#fefaf0]/35">
                    <td className="py-2.5 px-4 font-hebrew text-lg font-bold text-[#0b3948]" dir="rtl" lang="he">
                      {p.phrase}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right text-[#1f1912]">{p.frequency}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right text-[#5c4d3c]">{p.length}</td>
                    <td className="py-2.5 px-4 text-xs text-[#4a3d2d]">
                      <div className="font-semibold text-[#1f1912]">{p.sampleReference}</div>
                      <div className="font-hebrew text-sm text-[#5c4d3c]" dir="rtl" lang="he">{p.sampleWords}</div>
                    </td>
                    <td className="py-2.5 px-4 text-[#1f1912] max-w-md space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex-1 font-hebrew text-base text-[#1f1912]" dir="rtl" lang="he">
                          {p.sampleVerseVocalized}
                        </span>
                        <AudioPlayButton
                          audioId={`sa-he-${idx}`}
                          text={p.sampleVerseVocalized}
                          lang="he-IL"
                        />
                      </div>
                      {p.sampleTranslationPt && (
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex-1 text-xs text-[#4a3d2d]">{p.sampleTranslationPt}</span>
                          <AudioPlayButton
                            audioId={`sa-pt-${idx}`}
                            text={p.sampleTranslationPt}
                            lang="pt-BR"
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
