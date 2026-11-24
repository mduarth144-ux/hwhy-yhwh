import React, { useEffect, useState } from 'react';
import { BookOpen, BookmarkPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ManifestBook } from '../types';
import { AudioPlayButton } from './AudioPlayButton';

interface ExplorerVerse {
  chapter: number;
  verse: number;
  startOffset: number;
  endOffset: number;
  originalPlain: string;
  vocalized: string;
  consonantalSpaced: string;
  streamSlice: string;
  translationPt: string;
  ketivQere: Array<{ type: string; ketiv: string; qere: string }>;
  isAuthorizedLacuna: boolean;
}

interface ChapterPayload {
  book: {
    title: string;
    slug: string;
    ptTitle: string;
    heTitle: string;
    division: string;
    chapters: number;
    edition: string;
    license: string;
    ptVersionTitle: string | null;
    streamSha256: string;
  };
  chapter: number;
  chapterStream: string;
  chapterStreamStart: number;
  chapterStreamEnd: number;
  verses: ExplorerVerse[];
}

interface ExplorerViewProps {
  books: ManifestBook[];
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

export const ExplorerView: React.FC<ExplorerViewProps> = ({
  books,
  initialSlug,
  initialChapter,
  onSaveToNotebook,
}) => {
  const [slug, setSlug] = useState(initialSlug);
  const [chapter, setChapter] = useState(initialChapter);
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
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/corpus/book/${encodeURIComponent(slug)}/chapter/${chapter}`)
      .then((r) => {
        if (!r.ok) throw new Error('Falha ao carregar capítulo');
        return r.json();
      })
      .then((json: ChapterPayload) => {
        if (active) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Erro desconhecido');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [slug, chapter]);

  const currentBook = books.find((b) => b.slug === slug);
  const maxChapters = currentBook?.chapters ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 qumran-glass gem-border rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="explorer-book" className="block text-xs text-[#5c4d3c] mb-1">
              Livro canônico (39 / 24 tradicionais)
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
              {books.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.order.toString().padStart(2, '0')}. {b.ptTitle} ({b.heTitle})
                </option>
              ))}
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
        </div>

        <div className="flex flex-wrap items-center gap-3">
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

          <label className="inline-flex items-center gap-2 text-xs text-[#4a3d2d] cursor-pointer">
            <input
              type="checkbox"
              checked={showTranslation}
              onChange={(e) => setShowTranslation(e.target.checked)}
              className="rounded border-[#926c3c]/50 accent-[#0e4d64]"
            />
            Exibir tradução identificada
          </label>
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#4a3d2d]">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-[#9a5410]" />
            <span className="font-bold text-[#0b3948]">{data.book.ptTitle} {data.chapter}</span>
            <span aria-hidden="true">·</span>
            <span className="font-hebrew text-base font-bold gem-hebrew" dir="rtl" lang="he">{data.book.heTitle}</span>
            <span aria-hidden="true">·</span>
            <span>Edição: {data.book.edition} ({data.book.license})</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Offsets [{data.chapterStreamStart.toLocaleString('pt-BR')}..{data.chapterStreamEnd.toLocaleString('pt-BR')})
            </span>
          </div>
          <div className="font-mono text-[11px] text-[#5c4d3c]">
            SHA-256 stream: {data.book.streamSha256.slice(0, 16)}…
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
      ) : data && layer === 'stream' ? (
        <div className="qumran-glass gem-border rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5c4d3c]">
            <span>Fluxo consonantal contínuo do capítulo (fonte canônica de busca, ordem lógica Unicode, apresentação RTL)</span>
            <div className="flex items-center gap-3">
              <span className="font-mono tabular-nums">{data.chapterStream.length.toLocaleString('pt-BR')} letras</span>
              <AudioPlayButton
                audioId={`explorer-stream-${slug}-${chapter}`}
                text={data.verses.map((v) => v.vocalized).join(' ')}
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
            const hebrewText =
              layer === 'original'
                ? v.originalPlain
                : layer === 'consonantal'
                  ? v.consonantalSpaced
                  : v.vocalized;

            return (
              <div key={v.verse} className="p-4 hover:bg-[#fefaf0]/35 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-xs text-[#5c4d3c]">
                    <span className="font-mono tabular-nums font-bold text-[#0b3948]">
                      {v.chapter}:{v.verse}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      [{v.startOffset}..{v.endOffset})
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {v.endOffset - v.startOffset} letras
                    </span>
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
                          Lacuna massorética autorizada
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
                        hebrew_snippet: v.vocalized,
                        evidence_tier: 'evidencia_textual',
                        parameters_json: JSON.stringify({ layer, offsets: [v.startOffset, v.endOffset] }),
                      })
                    }
                    className="inline-flex items-center gap-1 text-xs text-[#0e4d64] hover:text-[#9a5410] font-medium transition-colors cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    Anotar
                  </button>
                </div>

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

                {showTranslation && v.translationPt && (
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex-1 text-sm text-[#4a3d2d] leading-relaxed">
                      {v.translationPt}
                      <span className="text-xs text-[#6d5b45] ml-2">
                        ({data.book.ptVersionTitle ?? 'Almeida Corrigida Fiel (ACF)'})
                      </span>
                    </p>
                    <div className="pt-0.5 shrink-0">
                      <AudioPlayButton
                        audioId={`exp-pt-${slug}-${v.chapter}-${v.verse}`}
                        text={v.translationPt}
                        lang="pt-BR"
                        label="Ouvir"
                      />
                    </div>
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
