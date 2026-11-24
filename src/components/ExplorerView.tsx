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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200 rounded-md p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="explorer-book" className="block text-xs text-slate-500 mb-1">
              Livro canônico (39 / 24 tradicionais)
            </label>
            <select
              id="explorer-book"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setChapter(1);
              }}
              className="px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
            >
              {books.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.order.toString().padStart(2, '0')}. {b.ptTitle} ({b.heTitle})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="explorer-chapter" className="block text-xs text-slate-500 mb-1">
              Capítulo (1–{maxChapters})
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={chapter <= 1}
                onClick={() => setChapter((c) => Math.max(1, c - 1))}
                className="p-2 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                aria-label="Capítulo anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                id="explorer-chapter"
                value={chapter}
                onChange={(e) => setChapter(Number(e.target.value))}
                className="px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
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
                className="p-2 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                aria-label="Próximo capítulo"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
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
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  layer === id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showTranslation}
              onChange={(e) => setShowTranslation(e.target.checked)}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            Exibir tradução identificada
          </label>
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-800">{data.book.ptTitle} {data.chapter}</span>
            <span aria-hidden="true">·</span>
            <span className="font-hebrew text-sm text-slate-800" dir="rtl" lang="he">{data.book.heTitle}</span>
            <span aria-hidden="true">·</span>
            <span>Edição: {data.book.edition} ({data.book.license})</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Offsets [{data.chapterStreamStart.toLocaleString()}..{data.chapterStreamEnd.toLocaleString()})
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-500">
            SHA-256 stream: {data.book.streamSha256.slice(0, 16)}…
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3 bg-white border border-slate-200 rounded-md p-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : data && layer === 'stream' ? (
        <div className="bg-white border border-slate-200 rounded-md p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Fluxo consonantal contínuo do capítulo (fonte canônica de busca, ordem lógica Unicode, apresentação RTL)</span>
            <div className="flex items-center gap-3">
              <span className="font-mono tabular-nums">{data.chapterStream.length.toLocaleString()} letras</span>
              <AudioPlayButton
                audioId={`explorer-stream-${slug}-${chapter}`}
                text={data.verses.map((v) => v.vocalized).join(' ')}
                lang="he-IL"
                label="Ouvir capítulo"
              />
            </div>
          </div>
          <p
            className="font-hebrew text-2xl leading-[2.2] tracking-wider text-slate-900 break-all bg-slate-50 p-5 rounded border border-slate-100"
            dir="rtl"
            lang="he"
          >
            {data.chapterStream}
          </p>
        </div>
      ) : data ? (
        <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-md">
          {data.verses.map((v) => {
            const hebrewText =
              layer === 'original'
                ? v.originalPlain
                : layer === 'consonantal'
                  ? v.consonantalSpaced
                  : v.vocalized;

            return (
              <div key={v.verse} className="p-4 hover:bg-slate-50/60 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono tabular-nums font-semibold text-slate-800">
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
                        <span className="text-amber-700 font-medium">
                          Ketiv/Qere ({v.ketivQere.length})
                        </span>
                      </>
                    )}
                    {v.isAuthorizedLacuna && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-700 font-medium">
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
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-700 transition-colors cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    Anotar
                  </button>
                </div>

                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="flex-1 font-hebrew text-xl md:text-2xl leading-relaxed text-slate-900" dir="rtl" lang="he">
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
                    <p className="flex-1 text-sm text-slate-600 leading-relaxed">
                      {v.translationPt}
                      <span className="text-xs text-slate-400 ml-2">
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
                  <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 inline-block">
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
