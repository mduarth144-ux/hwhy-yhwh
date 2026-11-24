import React, { useEffect, useState } from 'react';
import { GitCompare } from 'lucide-react';
import type { ChapterComparePreset, ManifestBook } from '../types';
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

interface CompareParallelsViewProps {
  books: ManifestBook[];
  initialPreset?: ChapterComparePreset | null;
  onInspectChapter: (slug: string, chapter: number) => void;
}

export const CompareParallelsView: React.FC<CompareParallelsViewProps> = ({
  books,
  initialPreset,
  onInspectChapter,
}) => {
  const [tab, setTab] = useState<'chapters' | 'identical'>('chapters');
  const [leftSlug, setLeftSlug] = useState(initialPreset?.leftSlug ?? 'psalms');
  const [leftChapter, setLeftChapter] = useState(initialPreset?.leftChapter ?? 14);
  const [rightSlug, setRightSlug] = useState(initialPreset?.rightSlug ?? 'psalms');
  const [rightChapter, setRightChapter] = useState(initialPreset?.rightChapter ?? 53);
  const [cmpData, setCmpData] = useState<ChapterComparisonResponse | null>(null);
  const [identicalClusters, setIdenticalClusters] = useState<IdenticalCluster[]>([]);
  const [loading, setLoading] = useState(false);

  const runChapterCompare = async (
    ls = leftSlug,
    lc = leftChapter,
    rs = rightSlug,
    rc = rightChapter,
  ) => {
    setLoading(true);
    try {
      const res = await fetch('/api/compare/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leftSlug: ls, leftChapter: lc, rightSlug: rs, rightChapter: rc }),
      });
      setCmpData((await res.json()) as ChapterComparisonResponse);
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
    } else {
      runChapterCompare('psalms', 14, 'psalms', 53);
    }
  }, [initialPreset?.nonce]);

  const loadIdentical = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/compare/identical?minLetters=18&limit=80');
      const json = (await res.json()) as { clusters: IdenticalCluster[] };
      setIdenticalClusters(json.clusters);
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
    </div>
  );
};
