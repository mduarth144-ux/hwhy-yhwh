import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, BookmarkPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CanonGroup, CatalogBookItem, ManifestBook, TranslationSummary } from '../types';
import { AudioPlayButton } from './AudioPlayButton';

interface ExplorerVerse {
  chapter: number;
  verse: number;
  startOffset: number | null;
  endOffset: number | null;
  originalPlain: string | null;
  vocalized: string | null;
  consonantalSpaced: string | null;
  streamSlice: string | null;
  translationPt: string;
  translationSource: string | null;
  translationState?: string | null;
  translationNote?: string | null;
  ketivQere: Array<{ type: string; ketiv: string; qere: string }>;
  isAuthorizedLacuna: boolean;
}

interface ChapterPayload {
  hasHebrewOriginal: boolean;
  notice?: string;
  book: {
    title: string;
    slug: string;
    ptTitle: string;
    heTitle: string | null;
    division: string | null;
    canonGroup?: CanonGroup;
    chapters: number;
    edition: string;
    license: string;
    ptVersionTitle: string | null;
    translationId: string;
    translationSigla: string;
    translationLanguage: string;
    versification?: { system?: string; validated?: boolean } | null;
    streamSha256: string | null;
  };
  chapter: number;
  chapterStream: string | null;
  chapterStreamStart: number | null;
  chapterStreamEnd: number | null;
  verses: ExplorerVerse[];
}

interface ExplorerViewProps {
  books: ManifestBook[];
  catalogBooks: CatalogBookItem[];
  translations: TranslationSummary[];
  preferredTranslationId: string;
  initialSlug: string;
  initialChapter: number;
  onSaveToNotebook: (item: {
    title: string;
    reference: string;
    hebrew_snippet: string;
    evidence_tier: string;
    parameters_json: string;
  }) => void;
}

const CANON_ORDER_GROUPS: Array<{ group: CanonGroup; label: string }> = [
  { group: 'torah', label: 'Torá (Pentateuco)' },
  { group: 'prophets', label: 'Nevi’im (Profetas)' },
  { group: 'writings', label: 'Ketuvim (Escritos)' },
  { group: 'deuterocanonical', label: 'Deuterocanônicos' },
  { group: 'apocrypha_addition', label: 'Adições Gregas (LXX / Vulgata)' },
  { group: 'new_testament', label: 'Novo Testamento' },
];

export const ExplorerView: React.FC<ExplorerViewProps> = ({
  books,
  catalogBooks,
  translations,
  preferredTranslationId,
  initialSlug,
  initialChapter,
  onSaveToNotebook,
}) => {
  const [slug, setSlug] = useState(initialSlug);
  const [chapter, setChapter] = useState(initialChapter);
  const [localTranslationId, setLocalTranslationId] = useState(preferredTranslationId || 'acf');
  const [layer, setLayer] = useState<'vocalized' | 'original' | 'consonantal' | 'stream'>('vocalized');
  const [showTranslation, setShowTranslation] = useState(true);
  const [data, setData] = useState<ChapterPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSlug(initialSlug);
    setChapter(initialChapter);
  }, [initialSlug, initialChapter]);

  useEffect(() => {
    if (preferredTranslationId) {
      setLocalTranslationId(preferredTranslationId);
    }
  }, [preferredTranslationId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(
      `/api/library/book/${encodeURIComponent(slug)}/chapter/${chapter}?translationId=${encodeURIComponent(
        localTranslationId,
      )}`,
    )
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error || 'Falha ao carregar capítulo');
        return json as ChapterPayload;
      })
      .then((json: ChapterPayload) => {
        if (active) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Erro desconhecido');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [slug, chapter, localTranslationId]);

  const selectableCatalogBooks = useMemo(() => {
    if (catalogBooks.length > 0) {
      return catalogBooks.filter(
        (b) => b.hasMasoreticOriginal || b.availableTranslations.length > 0,
      );
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

  const currentMeta = selectableCatalogBooks.find((b) => b.bookId === slug);
  const maxChapters = data?.book.chapters ?? currentMeta?.expectedChapters ?? 1;
  const activeTrLang = data?.book.translationLanguage || 'pt-BR';

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 qumran-glass gem-border rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="explorer-book" className="block text-xs text-[#5c4d3c] mb-1">
              Livro no catálogo multicânon
            </label>
            <select
              id="explorer-book"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setChapter(1);
              }}
              className="px-3 py-2 text-sm border rounded"
            >
              {CANON_ORDER_GROUPS.map(({ group, label }) => {
                const items = selectableCatalogBooks.filter((b) => b.canonGroup === group);
                if (items.length === 0) return null;
                return (
                  <optgroup key={group} label={label}>
                    {items.map((b) => (
                      <option key={b.bookId} value={b.bookId}>
                        {b.canonOrder.toString().padStart(2, '0')}. {b.ptTitle}
                        {b.heTitle ? ` (${b.heTitle})` : ' [Tradução]'}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div>
            <label htmlFor="explorer-chapter" className="block text-xs text-[#5c4d3c] mb-1">
              Capítulo (1–{maxChapters})
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={chapter <= 1}
                onClick={() => setChapter((c) => Math.max(1, c - 1))}
                className="p-2 border border-[#926c3c]/35 qumran-glass-inset rounded hover:bg-[#ebd8b5]/80 disabled:opacity-40 cursor-pointer"
                aria-label="Capítulo anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                id="explorer-chapter"
                value={chapter}
                onChange={(e) => setChapter(Number(e.target.value))}
                className="px-3 py-2 text-sm font-mono tabular-nums border rounded"
              >
                {Array.from({ length: maxChapters }, (_, i) => i + 1).map((c) => (
                  <option key={c} value={c}>
                    Cap. {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={chapter >= maxChapters}
                onClick={() => setChapter((c) => Math.min(maxChapters, c + 1))}
                className="p-2 border border-[#926c3c]/35 qumran-glass-inset rounded hover:bg-[#ebd8b5]/80 disabled:opacity-40 cursor-pointer"
                aria-label="Próximo capítulo"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {translations.length > 0 && (
            <div>
              <label htmlFor="explorer-translation" className="block text-xs text-[#5c4d3c] mb-1">
                Tradução exibida
              </label>
              <select
                id="explorer-translation"
                value={localTranslationId}
                onChange={(e) => setLocalTranslationId(e.target.value)}
                className="px-3 py-2 text-sm border rounded"
              >
                {translations.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.sigla} · {t.name} ({t.language})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(!data || data.hasHebrewOriginal) && (
            <div className="flex flex-wrap items-center gap-1 p-1 qumran-glass-inset rounded-lg">
              {(
                [
                  ['vocalized', 'Vocalizado (sem cantilação)'],
                  ['original', 'Original (com te’amim)'],
                  ['consonantal', 'Consonantal espaçado'],
                  ['stream', 'Stream contínuo'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLayer(id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    layer === id
                      ? 'bg-[#0e4d64] text-[#fefaf0] shadow-xs'
                      : 'text-[#4a3d2d] hover:text-[#1f1912]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {(!data || data.hasHebrewOriginal) && (
            <label className="inline-flex items-center gap-2 text-xs text-[#4a3d2d] cursor-pointer">
              <input
                type="checkbox"
                checked={showTranslation}
                onChange={(e) => setShowTranslation(e.target.checked)}
                className="rounded border-[#926c3c]/50 accent-[#0e4d64]"
              />
              Exibir tradução identificada
            </label>
          )}
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#4a3d2d]">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-[#9a5410]" />
            <span className="font-bold text-[#0b3948]">
              {data.book.ptTitle} {data.chapter}
            </span>
            {data.book.heTitle && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-hebrew text-base font-bold gem-hebrew" dir="rtl" lang="he">
                  {data.book.heTitle}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>
              Tradução: {data.book.ptVersionTitle ?? data.book.translationSigla} ({data.book.translationLanguage})
            </span>
            {data.hasHebrewOriginal && data.chapterStreamStart !== null && data.chapterStreamEnd !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Offsets [{data.chapterStreamStart.toLocaleString('pt-BR')}..{data.chapterStreamEnd.toLocaleString('pt-BR')})
                </span>
              </>
            )}
          </div>
          {data.book.streamSha256 && (
            <div className="font-mono text-[11px] text-[#5c4d3c]">
              SHA-256 stream: {data.book.streamSha256.slice(0, 16)}…
            </div>
          )}
        </div>
      )}

      {data && !data.hasHebrewOriginal && (
        <div className="bg-[#f59e0b]/15 border border-[#b45309]/40 rounded-xl p-4 flex items-start gap-2.5 text-xs text-[#78350f]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong>Modo leitura de tradução (sem corpus massorético):</strong>{' '}
            {data.notice ??
              'Este livro pertence aos Deuterocanônicos ou Novo Testamento e está disponível via tradução instalada, sem original hebraico massorético inventado.'}
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-100/80 border border-rose-300 rounded text-sm text-rose-900">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3 qumran-glass gem-border rounded-xl p-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 qumran-glass-inset rounded animate-pulse" />
          ))}
        </div>
      ) : data && data.hasHebrewOriginal && layer === 'stream' && data.chapterStream !== null ? (
        <div className="qumran-glass gem-border rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5c4d3c]">
            <span>
              Fluxo consonantal contínuo do capítulo (fonte canônica de busca, ordem lógica Unicode, apresentação RTL)
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono tabular-nums">{data.chapterStream.length.toLocaleString('pt-BR')} letras</span>
              <AudioPlayButton
                audioId={`explorer-stream-${slug}-${chapter}`}
                text={data.verses.map((v) => v.vocalized || '').join(' ')}
                lang="he-IL"
                label="Ouvir capítulo"
              />
            </div>
          </div>
          <p
            className="font-hebrew text-2xl leading-[2.2] tracking-wider text-[#1f1912] break-all qumran-glass-inset p-5 rounded-lg"
            dir="rtl"
            lang="he"
          >
            {data.chapterStream}
          </p>
        </div>
      ) : data ? (
        <div className="divide-y qumran-divider qumran-glass gem-border rounded-xl">
          {data.verses.map((v) => {
            const hebrewText = !data.hasHebrewOriginal
              ? null
              : layer === 'original'
                ? v.originalPlain
                : layer === 'consonantal'
                  ? v.consonantalSpaced
                  : v.vocalized;

            return (
              <div key={v.verse} className="p-4 hover:bg-[#fefaf0]/35 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#5c4d3c]">
                    <span className="font-mono tabular-nums font-bold text-[#0b3948]">
                      {v.chapter}:{v.verse}
                    </span>
                    {v.startOffset !== null && v.endOffset !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          [{v.startOffset}..{v.endOffset})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {v.endOffset - v.startOffset} letras
                        </span>
                      </>
                    )}
                    {v.ketivQere.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#9a5410] font-semibold">
                          Ketiv/Qere ({v.ketivQere.length})
                        </span>
                      </>
                    )}
                    {v.isAuthorizedLacuna && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#9a5410] font-semibold">
                          Lacuna textual / omissão autorizada
                        </span>
                      </>
                    )}
                    {v.translationState && v.translationState !== 'present' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#9a5410] font-semibold">
                          Estado: {v.translationState}
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onSaveToNotebook({
                        title: `Leitura ${data.book.ptTitle} ${v.chapter}:${v.verse}`,
                        reference: `${data.book.ptTitle} ${v.chapter}:${v.verse}`,
                        hebrew_snippet: v.vocalized || v.translationPt,
                        evidence_tier: 'evidencia_textual',
                        parameters_json: JSON.stringify({
                          layer: data.hasHebrewOriginal ? layer : 'translation_only',
                          translationId: data.book.translationId,
                          offsets:
                            v.startOffset !== null && v.endOffset !== null
                              ? [v.startOffset, v.endOffset]
                              : null,
                        }),
                      })
                    }
                    className="inline-flex items-center gap-1 text-xs text-[#0e4d64] hover:text-[#9a5410] font-medium transition-colors cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    Anotar
                  </button>
                </div>

                {data.hasHebrewOriginal && hebrewText && (
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="flex-1 font-hebrew text-xl md:text-2xl leading-relaxed text-[#1f1912]" dir="rtl" lang="he">
                      {hebrewText}
                    </p>
                    {!v.isAuthorizedLacuna && (
                      <div className="pt-1 shrink-0">
                        <AudioPlayButton
                          audioId={`exp-he-${slug}-${v.chapter}-${v.verse}`}
                          text={v.vocalized || hebrewText}
                          lang="he-IL"
                          label="Ouvir"
                        />
                      </div>
                    )}
                  </div>
                )}

                {(showTranslation || !data.hasHebrewOriginal) && v.translationPt && (
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex-1 text-sm text-[#4a3d2d] leading-relaxed">
                      {v.translationPt}
                      <span className="text-xs text-[#6d5b45] ml-2">
                        ({v.translationSource ?? data.book.ptVersionTitle ?? 'ACF'})
                      </span>
                    </p>
                    <div className="pt-0.5 shrink-0">
                      <AudioPlayButton
                        audioId={`exp-tr-${slug}-${data.book.translationId}-${v.chapter}-${v.verse}`}
                        text={v.translationPt}
                        lang={activeTrLang}
                        label="Ouvir"
                      />
                    </div>
                  </div>
                )}

                {v.translationNote && (
                  <div className="mt-1.5 text-xs text-[#9a5410]">
                    {v.translationNote}
                  </div>
                )}

                {v.ketivQere.length > 0 && (
                  <div className="mt-2 text-xs text-[#78350f] bg-[#f59e0b]/15 border border-[#b45309]/35 rounded px-2.5 py-1.5 inline-block">
                    {v.ketivQere.map((kq, idx) => (
                      <span key={idx} className="mr-3">
                        Ketiv <span className="font-hebrew text-sm" dir="rtl" lang="he">{kq.ketiv || '—'}</span>
                        {' / '}
                        Qere <span className="font-hebrew text-sm" dir="rtl" lang="he">{kq.qere || '—'}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
