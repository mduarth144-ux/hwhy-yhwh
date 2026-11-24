import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Compass,
  GitCompare,
  Layers,
  Repeat,
  Search,
  Sparkles,
} from 'lucide-react';
import type {
  ChapterComparePreset,
  DashboardPayload,
  ModuleId,
  SearchPresetPayload,
} from '../types';
import { AudioPlayButton } from './AudioPlayButton';

interface DashboardViewProps {
  data: DashboardPayload | null;
  loading: boolean;
  onNavigateSearch: (preset: Omit<SearchPresetPayload, 'nonce'>) => void;
  onCompareChapters: (preset: Omit<ChapterComparePreset, 'nonce'>) => void;
  onInspectChapter: (slug: string, chapter: number) => void;
  onNavigateModule: (id: ModuleId) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Todas as descobertas',
  identidade: 'Declarações de Identidade (אֲנִי / אָנֹכִי)',
  tetragrama: 'Tetragrama (יְהוָה)',
  repeticao_tripla: 'Clamores Tríplices (3×)',
  formula: 'Fórmulas Estruturais',
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  loading,
  onNavigateSearch,
  onCompareChapters,
  onInspectChapter,
  onNavigateModule,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredDiscoveries = useMemo(() => {
    if (!data) return [];
    if (selectedCategory === 'all') return data.keyDiscoveries;
    return data.keyDiscoveries.filter((d) => d.category === selectedCategory);
  }, [data, selectedCategory]);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="qumran-glass gem-border rounded-lg p-6 space-y-4 animate-pulse">
          <div className="h-7 w-72 rounded bg-[#8c6b3f]/20" />
          <div className="h-4 w-full max-w-2xl rounded bg-[#8c6b3f]/15" />
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 pt-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-20 rounded qumran-glass-inset" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="qumran-glass gem-border rounded-lg p-5 h-56 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const maxBookLetters = data.topBooksByLetters[0]?.letters ?? 1;

  return (
    <div className="space-y-7">
      {/* Hero panorâmico estilo papiro de Qumran com lapidação âmbar e azul petróleo */}
      <section className="qumran-glass gem-border rounded-xl p-6 lg:p-7 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 rounded-full opacity-35 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(14,77,100,0.42) 0%, transparent 70%)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-12 w-72 h-72 rounded-full opacity-35 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(217,119,6,0.38) 0%, transparent 70%)' }}
        />

        <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#0e4d64]">
              <Sparkles className="w-4 h-4 text-[#b45309]" />
              <span>Síntese Determinística do Corpus Massorético</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#5c4d3c]">
                {data.corpusTotals.books} livros ({data.corpusTotals.traditionalBooks} tradicionais) · {data.corpusTotals.chapters} capítulos
              </span>
            </div>

            <h2 className="text-2xl lg:text-3xl font-bold tracking-tight gem-title text-balance">
              Achados Estruturais & Repetições Singulares no Tanakh
            </h2>

            <p className="text-sm text-[#4a3d2d] leading-relaxed">
              Estatísticas e ocorrências reais extraídas diretamente do fluxo consonantal contínuo UTF-8 (
              <span className="font-mono tabular-nums font-semibold text-[#1f1912]">
                {data.corpusTotals.letters.toLocaleString('pt-BR')}
              </span>{' '}
              letras sem truncamento), com separação entre palavras exatas, ressegmentações no stream, cruzamentos de versículos e tradução integral em PT-BR (ACF).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                onNavigateSearch({
                  subMode: 'stream',
                  query: 'אניאניהוא',
                  division: 'all',
                  bookSlug: 'all',
                  boundaryFilter: 'all',
                })
              }
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#fefaf0] bg-[#0e4d64] hover:bg-[#0b3948] border border-[#d99f45]/45 rounded-md shadow-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-[#fbbf24]" />
              Investigar אֲנִי אֲנִי הוּא
            </button>

            <button
              type="button"
              onClick={() =>
                onNavigateSearch({
                  subMode: 'els',
                  query: 'תורה',
                  elsBook: 'genesis',
                  minSkip: 49,
                  maxSkip: 50,
                })
              }
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#1f1912] qumran-glass-inset hover:bg-[#ebd8b5]/80 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5 text-[#b45309]" />
              ELS תורה (Gênesis d=49..50)
            </button>

            <button
              type="button"
              onClick={() => onNavigateModule('explorador')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-[#0e4d64] hover:text-[#0b3948] border border-[#0e4d64]/30 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Abrir Explorador
            </button>
          </div>
        </div>

        {/* Grade KPI principal */}
        <div className="relative grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mt-6 pt-5 border-t qumran-divider">
          <div className="qumran-glass-inset rounded-lg p-3.5">
            <div className="text-[11px] text-[#5c4d3c]">Letras consonantais</div>
            <div className="text-lg lg:text-xl font-mono font-bold tabular-nums text-[#0b3948] mt-0.5">
              {data.corpusTotals.letters.toLocaleString('pt-BR')}
            </div>
            <div className="text-[11px] text-[#6d5b45]">Stream contínuo UTF-8</div>
          </div>

          <div className="qumran-glass-inset rounded-lg p-3.5">
            <div className="text-[11px] text-[#5c4d3c]">Palavras / Léxico</div>
            <div className="text-lg lg:text-xl font-mono font-bold tabular-nums text-[#1f1912] mt-0.5">
              {data.corpusTotals.words.toLocaleString('pt-BR')}
            </div>
            <div className="text-[11px] text-[#6d5b45] font-mono tabular-nums">
              {data.corpusTotals.uniqueLexiconWords.toLocaleString('pt-BR')} formas únicas
            </div>
          </div>

          <div className="qumran-glass-inset rounded-lg p-3.5">
            <div className="text-[11px] text-[#5c4d3c]">Versículos</div>
            <div className="text-lg lg:text-xl font-mono font-bold tabular-nums text-[#1f1912] mt-0.5">
              {data.corpusTotals.verses.toLocaleString('pt-BR')}
            </div>
            <div className="text-[11px] text-[#6d5b45]">Com alinhamento PT-BR</div>
          </div>

          <div className="qumran-glass-inset rounded-lg p-3.5">
            <div className="text-[11px] text-[#5c4d3c]">Repetições adjacentes</div>
            <div className="text-lg lg:text-xl font-mono font-bold tabular-nums text-[#9a5410] mt-0.5">
              {data.repetitionsSummary.total2xPlus.toLocaleString('pt-BR')}
            </div>
            <div className="text-[11px] text-[#6d5b45] font-mono tabular-nums">
              {data.repetitionsSummary.total3xPlus} triplas (3×+)
            </div>
          </div>

          <div className="qumran-glass-inset rounded-lg p-3.5">
            <div className="text-[11px] text-[#5c4d3c]">Clusters idênticos</div>
            <div className="text-lg lg:text-xl font-mono font-bold tabular-nums text-[#0e4d64] mt-0.5">
              {data.parallelsSummary.identicalClustersCount.toLocaleString('pt-BR')}
            </div>
            <div className="text-[11px] text-[#6d5b45]">SHA-256 (≥18 letras)</div>
          </div>

          <div className="qumran-glass-inset rounded-lg p-3.5">
            <div className="text-[11px] text-[#5c4d3c]">Ketiv / Qere</div>
            <div className="text-lg lg:text-xl font-mono font-bold tabular-nums text-[#78350f] mt-0.5">
              {data.corpusTotals.ketivQereTotal.toLocaleString('pt-BR')}
            </div>
            <div className="text-[11px] text-[#6d5b45]">Notas massoréticas</div>
          </div>
        </div>
      </section>

      {/* Seção 1: Principais Descobertas Textuais (ani ani, ani ani hu, yhwh yhwh, anokhi, qadosh...) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-[#1f1912]">
              Descobertas em Destaque no Fluxo Contínuo
            </h3>
            <p className="text-xs text-[#5c4d3c]">
              Contagem exata de ocorrências de <span className="font-hebrew text-sm text-[#1f1912]" dir="rtl">אֲנִי אֲנִי</span>,{' '}
              <span className="font-hebrew text-sm text-[#1f1912]" dir="rtl">אֲנִי אֲנִי הוּא</span>,{' '}
              <span className="font-hebrew text-sm text-[#1f1912]" dir="rtl">יְהוָה יְהוָה</span> e fórmulas correlatas
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 qumran-glass-inset p-1 rounded-lg">
            {Object.entries(CATEGORY_LABELS).map(([catKey, catLabel]) => (
              <button
                key={catKey}
                type="button"
                onClick={() => setSelectedCategory(catKey)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  selectedCategory === catKey
                    ? 'bg-[#0e4d64] text-[#fefaf0] shadow-xs'
                    : 'text-[#4a3d2d] hover:text-[#1f1912] hover:bg-[#f7edd8]/60'
                }`}
              >
                {catLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredDiscoveries.map((item) => {
            const exactWords =
              (item.boundaryBreakdown.exact_word ?? 0) + (item.boundaryBreakdown.multi_word ?? 0);
            const resegmented = item.boundaryBreakdown.resegmented ?? 0;
            const crossVerse = item.boundaryBreakdown.cross_verse ?? 0;
            const substring = item.boundaryBreakdown.substring ?? 0;

            return (
              <article
                key={item.id}
                className="qumran-glass gem-border gem-border-interactive rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {/* Cabeçalho do card com hebraico lapidado + contador */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-[#1f1912]">{item.title}</h4>
                        <span aria-hidden="true" className="text-[#926c3c]">·</span>
                        <span className="text-xs font-medium text-[#9a5410]">{item.transliteration}</span>
                      </div>
                      <p className="text-xs text-[#4a3d2d] leading-relaxed">{item.insight}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-2xl lg:text-3xl font-mono font-bold tabular-nums text-[#0b3948]">
                        {item.totalCount.toLocaleString('pt-BR')}
                      </div>
                      <div className="text-[11px] text-[#5c4d3c]">no stream</div>
                    </div>
                  </div>

                  {/* Espécime hebraico em destaque com áudio */}
                  <div className="qumran-glass-inset rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                      <AudioPlayButton
                        audioId={`dash-term-${item.id}`}
                        text={item.displayHebrew}
                        lang="he-IL"
                        label="Ouvir termo"
                      />
                    </div>
                    <div className="text-right min-w-0">
                      <div
                        className="font-hebrew text-2xl lg:text-3xl font-bold gem-hebrew leading-snug"
                        dir="rtl"
                        lang="he"
                      >
                        {item.displayHebrew}
                      </div>
                      <div className="text-[11px] font-mono text-[#6d5b45]">
                        Sequência de busca: <span className="font-hebrew text-xs" dir="rtl">{item.query}</span>
                      </div>
                    </div>
                  </div>

                  {/* Breakdown por tipo de fronteira + principais livros */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#4a3d2d]">
                    <span>
                      Palavras íntegras:{' '}
                      <strong className="font-mono tabular-nums text-[#0b3948]">
                        {exactWords.toLocaleString('pt-BR')}
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Ressegmentação:{' '}
                      <strong className="font-mono tabular-nums text-[#9a5410]">
                        {resegmented.toLocaleString('pt-BR')}
                      </strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Cruza versículo:{' '}
                      <strong className="font-mono tabular-nums text-[#9a5410]">
                        {crossVerse.toLocaleString('pt-BR')}
                      </strong>
                    </span>
                    {substring > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          Subcadeia:{' '}
                          <strong className="font-mono tabular-nums text-[#1f1912]">
                            {substring.toLocaleString('pt-BR')}
                          </strong>
                        </span>
                      </>
                    )}
                  </div>

                  {item.topBooks.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[#5c4d3c]">
                      <span>Principais livros:</span>
                      {item.topBooks.map((tb, idx) => (
                        <React.Fragment key={tb.slug}>
                          {idx > 0 && <span aria-hidden="true">·</span>}
                          <span>
                            {tb.ptBook}{' '}
                            <strong className="font-mono tabular-nums text-[#1f1912]">{tb.count}</strong>
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  )}

                  {/* Versículo de amostra */}
                  {item.sample && (
                    <div className="pt-3 border-t qumran-divider space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => onInspectChapter(item.sample!.slug, item.sample!.chapter)}
                          className="font-semibold text-[#0e4d64] hover:text-[#9a5410] hover:underline cursor-pointer"
                        >
                          Amostra: {item.sample.reference}
                        </button>
                        <span className="font-mono tabular-nums text-[11px] text-[#6d5b45]">
                          [{item.sample.startOffset.toLocaleString('pt-BR')}..{item.sample.endOffset.toLocaleString('pt-BR')})
                        </span>
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <p className="flex-1 font-hebrew text-lg leading-relaxed text-[#1f1912]" dir="rtl" lang="he">
                          {item.sample.verseVocalized}
                        </p>
                        <div className="pt-0.5 shrink-0">
                          <AudioPlayButton
                            audioId={`dash-sample-he-${item.id}`}
                            text={item.sample.verseVocalized}
                            lang="he-IL"
                            label="HE"
                          />
                        </div>
                      </div>

                      {item.sample.translationPt && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="flex-1 text-xs text-[#4a3d2d] leading-relaxed">
                            {item.sample.translationPt}
                          </p>
                          <AudioPlayButton
                            audioId={`dash-sample-pt-${item.id}`}
                            text={item.sample.translationPt}
                            lang="pt-BR"
                            label="PT"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t qumran-divider">
                  <button
                    type="button"
                    onClick={() =>
                      onNavigateSearch({
                        subMode: 'stream',
                        query: item.query,
                        division: 'all',
                        bookSlug: 'all',
                        boundaryFilter: 'all',
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#fefaf0] bg-[#0e4d64] hover:bg-[#0b3948] rounded transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5 text-[#fbbf24]" />
                    Investigar todas ({item.totalCount.toLocaleString('pt-BR')})
                  </button>

                  {item.sample && (
                    <button
                      type="button"
                      onClick={() => onInspectChapter(item.sample!.slug, item.sample!.chapter)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#0e4d64] hover:text-[#9a5410] transition-colors cursor-pointer"
                    >
                      Abrir {item.sample.reference}
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Seção 2: Anatomia Canônica & Maiores Livros + Paralelos / Repetições / ELS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Distribuição por divisão do Tanakh e top livros */}
        <div className="lg:col-span-6 qumran-glass gem-border rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#1f1912]">Anatomia Canônica do Tanakh</h3>
              <p className="text-xs text-[#5c4d3c]">Proporção de letras consonantais por divisão tradicional</p>
            </div>
            <Layers className="w-4 h-4 text-[#9a5410] shrink-0" />
          </div>

          <div className="space-y-3.5">
            {data.divisionBreakdown.map((div) => (
              <div key={div.division} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#1f1912]">{div.ptLabel}</span>
                  <span className="font-mono tabular-nums text-[#4a3d2d]">
                    {div.booksCount} livros · {div.letters.toLocaleString('pt-BR')} letras ({div.percentLetters}%)
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[#8c6b3f]/18 overflow-hidden border border-[#926c3c]/20">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${div.percentLetters}%`,
                      background:
                        div.division === 'Torah'
                          ? 'linear-gradient(90deg, #b45309 0%, #f59e0b 100%)'
                          : div.division === 'Prophets'
                            ? 'linear-gradient(90deg, #0b3948 0%, #0e7490 100%)'
                            : 'linear-gradient(90deg, #78350f 0%, #0e4d64 100%)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t qumran-divider space-y-2.5">
            <div className="text-xs font-semibold text-[#1f1912]">
              Maiores Livros por Volume Consonantal
            </div>
            <div className="space-y-2">
              {data.topBooksByLetters.map((bk) => (
                <div key={bk.slug} className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => onInspectChapter(bk.slug, 1)}
                    className="w-28 text-left font-medium text-[#0e4d64] hover:text-[#9a5410] hover:underline truncate cursor-pointer"
                  >
                    {bk.ptTitle}
                  </button>
                  <div className="flex-1 h-2 rounded-full bg-[#8c6b3f]/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#0e4d64] to-[#d97706]"
                      style={{ width: `${Math.round((bk.letters / maxBookLetters) * 100)}%` }}
                    />
                  </div>
                  <span className="w-24 text-right font-mono tabular-nums text-[#4a3d2d]">
                    {bk.letters.toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Repetições Triplas, Paralelos SHA-256 e Benchmark ELS */}
        <div className="lg:col-span-6 space-y-5">
          {/* Card Benchmark ELS */}
          <div className="qumran-glass gem-border rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#1f1912]">
                  Referência ELS: <span className="font-hebrew text-xl gem-hebrew mx-1" dir="rtl">תורה</span> em {data.elsSummary.ptBook}
                </h3>
                <p className="text-xs text-[#5c4d3c]">
                  Varredura equidistante com saltos d = {data.elsSummary.minSkip}..{data.elsSummary.maxSkip} e destaque letra a letra
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onNavigateSearch({
                    subMode: 'els',
                    query: data.elsSummary.query,
                    elsBook: data.elsSummary.bookSlug,
                    minSkip: data.elsSummary.minSkip,
                    maxSkip: data.elsSummary.maxSkip,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#fefaf0] bg-[#9a5410] hover:bg-[#78350f] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5" />
                Executar com destaque
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 qumran-glass-inset rounded-lg p-3 text-xs">
              <div>
                <div className="text-[#5c4d3c]">Ocorrências observadas</div>
                <div className="text-lg font-mono font-bold tabular-nums text-[#0b3948]">
                  {data.elsSummary.totalHits}
                </div>
              </div>
              <div>
                <div className="text-[#5c4d3c]">Controle aleatório</div>
                <div className="text-lg font-mono font-bold tabular-nums text-[#4a3d2d]">
                  {data.elsSummary.expectedRandomHits}
                </div>
              </div>
              <div>
                <div className="text-[#5c4d3c]">Razão Obs./Esp.</div>
                <div className="text-lg font-mono font-bold tabular-nums text-[#9a5410]">
                  {data.elsSummary.observedOverExpected !== null
                    ? `${data.elsSummary.observedOverExpected}×`
                    : '—'}
                </div>
              </div>
            </div>

            {data.elsSummary.sampleHit && (
              <div className="text-xs text-[#4a3d2d] font-mono tabular-nums">
                Amostra: {data.elsSummary.sampleHit.referenceStart} → {data.elsSummary.sampleHit.referenceEnd} · d ={' '}
                {data.elsSummary.sampleHit.skip} · offsets [{data.elsSummary.sampleHit.letterOffsets.join(', ')}]
              </div>
            )}
          </div>

          {/* Card Paralelos Clássicos */}
          <div className="qumran-glass gem-border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#1f1912]">Paralelos Sinópticos e Capítulos Gêmeos</h3>
                <p className="text-xs text-[#5c4d3c]">
                  Similaridade consonantal medida por distância de Levenshtein e hash SHA-256
                </p>
              </div>
              <GitCompare className="w-4 h-4 text-[#0e4d64] shrink-0" />
            </div>

            <div className="divide-y qumran-divider">
              {data.parallelsSummary.featuredComparisons.map((cmp) => (
                <div
                  key={cmp.label}
                  className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        onCompareChapters({
                          leftSlug: cmp.leftSlug,
                          leftChapter: cmp.leftChapter,
                          rightSlug: cmp.rightSlug,
                          rightChapter: cmp.rightChapter,
                        })
                      }
                      className="font-semibold text-[#0e4d64] hover:text-[#9a5410] hover:underline cursor-pointer"
                    >
                      {cmp.label}
                    </button>
                    <div className="text-[11px] text-[#5c4d3c] font-mono tabular-nums">
                      {cmp.identicalCount} de {cmp.totalVerses} versículos 100% idênticos
                    </div>
                  </div>
                  <div className="font-mono font-bold tabular-nums text-sm text-[#0b3948]">
                    {cmp.similarityPercent}% similar
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Seção 3: Repetições Consecutivas & Triplicações */}
      <section className="qumran-glass gem-border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#1f1912]">
              Repetições Consecutivas Triplas (3×) e Unidades Mais Frequentes
            </h3>
            <p className="text-xs text-[#5c4d3c]">
              Detectadas automaticamente sem dicionário prévio no corpus consonantal
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateModule('repeticoes')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0e4d64] qumran-glass-inset hover:bg-[#ebd8b5]/80 rounded transition-colors cursor-pointer"
          >
            <Repeat className="w-3.5 h-3.5" />
            Abrir Repetições & Frases
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3 border-b qumran-divider text-xs">
          <span className="text-[#5c4d3c] font-medium">Mais recorrentes (2×+):</span>
          {data.repetitionsSummary.topRepeatedUnits.map((u, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() =>
                onNavigateSearch({
                  subMode: 'stream',
                  query: `${u.unit}${u.unit}`,
                  division: 'all',
                  bookSlug: 'all',
                  boundaryFilter: 'all',
                })
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1 qumran-glass-inset rounded hover:border-[#0e4d64]/50 transition-colors cursor-pointer"
            >
              <span className="font-hebrew text-base font-bold text-[#0b3948]" dir="rtl" lang="he">
                {u.unitVocalized}
              </span>
              <span className="font-mono tabular-nums text-[11px] text-[#5c4d3c]">
                {u.occurrences}× (máx {u.maxRepeats}×)
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.repetitionsSummary.tripleOccurrences.map((tr, idx) => (
            <div key={idx} className="qumran-glass-inset rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => onInspectChapter(tr.slug, tr.chapter)}
                  className="font-semibold text-[#0e4d64] hover:text-[#9a5410] hover:underline cursor-pointer"
                >
                  {tr.reference}
                </button>
                <span className="font-mono font-bold tabular-nums text-[#9a5410]">
                  {tr.repeatCount}× consecutivas
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <p className="flex-1 font-hebrew text-lg text-[#1f1912] leading-relaxed" dir="rtl" lang="he">
                  {tr.verseVocalized}
                </p>
                <AudioPlayButton
                  audioId={`dash-triple-he-${idx}`}
                  text={tr.verseVocalized}
                  lang="he-IL"
                />
              </div>
              {tr.translationPt && (
                <div className="flex items-start justify-between gap-2">
                  <p className="flex-1 text-xs text-[#4a3d2d] line-clamp-3">{tr.translationPt}</p>
                  <AudioPlayButton
                    audioId={`dash-triple-pt-${idx}`}
                    text={tr.translationPt}
                    lang="pt-BR"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
