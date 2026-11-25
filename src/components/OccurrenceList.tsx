import React, { useState } from 'react';
import { BookmarkPlus, ChevronDown, ChevronUp } from 'lucide-react';
import type { OccurrenceItem } from '../types';
import { AudioPlayButton } from './AudioPlayButton';

const BOUNDARY_LABELS: Record<OccurrenceItem['boundaryType'], string> = {
  exact_word: 'Palavra exata',
  multi_word: 'Múltiplas palavras',
  resegmented: 'Ressegmentação entre palavras',
  cross_verse: 'Cruzamento de versículos',
  substring: 'Subcadeia interna',
};

const TIER_LABELS: Record<string, string> = {
  evidencia_textual: 'Evidência textual',
  confirmacao_lexical: 'Confirmação lexical',
  correspondencia_estrutural: 'Correspondência estrutural',
  hipotese_fonetica: 'Hipótese fonética',
  hipotese_interpretativa: 'Hipótese interpretativa',
};

interface OccurrenceListProps {
  items: OccurrenceItem[];
  onSaveToNotebook: (item: {
    title: string;
    reference: string;
    hebrew_snippet: string;
    evidence_tier: string;
    parameters_json: string;
  }) => void;
  onInspectChapter?: (slug: string, chapter: number) => void;
}

export const OccurrenceList: React.FC<OccurrenceListProps> = ({
  items,
  onSaveToNotebook,
  onInspectChapter,
}) => {
  const [expandedContext, setExpandedContext] = useState<Record<string, boolean>>({});

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="divide-y qumran-divider qumran-glass gem-border rounded-xl">
      {items.map((occ) => {
        const isExpanded = Boolean(expandedContext[occ.id]);
        const hasMultipleInvolved = Boolean(occ.involvedVerses && occ.involvedVerses.length > 1);
        const trLang = occ.translationLanguage || 'pt-BR';

        return (
          <article key={occ.id} className="p-4 space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-2 text-xs text-[#4a3d2d]">
                <button
                  type="button"
                  onClick={() => onInspectChapter?.(occ.slug, occ.chapter)}
                  className="text-sm font-bold text-[#0b3948] hover:text-[#9a5410] transition-colors cursor-pointer"
                >
                  {occ.reference}
                </button>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    occ.boundaryType === 'resegmented' || occ.boundaryType === 'cross_verse'
                      ? 'text-[#9a5410] font-semibold'
                      : 'text-[#4a3d2d]'
                  }
                >
                  {BOUNDARY_LABELS[occ.boundaryType]}
                </span>
                <span aria-hidden="true">·</span>
                <span>{TIER_LABELS[occ.evidenceTier] ?? occ.evidenceTier}</span>
                {occ.matchType && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        occ.matchType === 'exact_consonantal'
                          ? 'text-[#047857] font-semibold'
                          : 'text-[#9a5410] font-semibold'
                      }
                    >
                      {occ.matchType === 'exact_consonantal'
                        ? 'Correspondência consonantal exata'
                        : `Aproximação fonética (custo ${occ.cost ?? 0})`}
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-[#6d5b45]" dir="ltr">
                  [{occ.startOffset}..{occ.endOffset})
                </span>
                <span aria-hidden="true">·</span>
                <span>{occ.language}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setExpandedContext((prev) => ({ ...prev, [occ.id]: !isExpanded }))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#4a3d2d] hover:text-[#1f1912] qumran-glass-inset rounded transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Contexto e camadas
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onSaveToNotebook({
                      title: `${occ.reference} — ${occ.matchedStream}`,
                      reference: occ.reference,
                      hebrew_snippet: occ.verseVocalized,
                      evidence_tier: occ.evidenceTier,
                      parameters_json: JSON.stringify({
                        parameters: occ.parametersSummary,
                        offsets: [occ.startOffset, occ.endOffset],
                        translationId: occ.translationId ?? 'acf',
                        matchType: occ.matchType,
                        transformationLog: occ.transformationLog,
                      }),
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0e4d64] hover:bg-[#0e4d64]/10 border border-[#0e4d64]/30 rounded transition-colors whitespace-nowrap cursor-pointer"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  Salvar no caderno
                </button>
              </div>
            </div>

            {occ.transformationLog && occ.transformationLog.length > 0 && (
              <div className="text-xs font-mono text-[#78350f] bg-[#f59e0b]/12 border border-[#b45309]/30 rounded px-3 py-1.5">
                Transformações: {occ.transformationLog.join(' | ')}
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 qumran-glass-inset p-3.5 rounded-lg">
              {hasMultipleInvolved ? (
                <div className="flex-1 space-y-3">
                  <div className="text-[11px] font-semibold text-[#9a5410]">
                    Ocorrência atravessando {occ.involvedVerses!.length} versículos envolvidos:
                  </div>
                  {occ.involvedVerses!.map((iv, ivIdx) => (
                    <div
                      key={`${iv.chapter}-${iv.verse}-${ivIdx}`}
                      className="space-y-1.5 pt-2 first:pt-0 border-t first:border-t-0 qumran-divider"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#5c4d3c]">
                        <button
                          type="button"
                          onClick={() => onInspectChapter?.(occ.slug, iv.chapter)}
                          className="font-semibold text-[#0e4d64] hover:underline cursor-pointer"
                        >
                          {iv.reference}
                        </button>
                        <span className="font-mono tabular-nums">
                          [{iv.startOffset}..{iv.endOffset})
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <p className="flex-1 font-hebrew text-xl leading-relaxed text-[#1f1912]" dir="rtl" lang="he">
                          {iv.verseVocalized}
                        </p>
                        <AudioPlayButton
                          audioId={`occ-iv-he-${occ.id}-${ivIdx}`}
                          text={iv.verseVocalized}
                          lang="he-IL"
                          label="Ouvir"
                        />
                      </div>
                      {iv.translationPt && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="flex-1 text-sm text-[#4a3d2d] leading-relaxed">
                            {iv.translationPt}
                            <span className="text-xs text-[#6d5b45] ml-2">
                              ({iv.translationPtSource ?? 'Almeida Corrigida Fiel (ACF)'})
                            </span>
                          </p>
                          <AudioPlayButton
                            audioId={`occ-iv-pt-${occ.id}-${ivIdx}`}
                            text={iv.translationPt}
                            lang={iv.translationLanguage || trLang}
                            label="Ouvir"
                          />
                        </div>
                      )}
                      {iv.translationNote && (
                        <div className="text-[11px] text-[#9a5410]">
                          Nota de tradução/versificação: {iv.translationNote}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex-1 font-hebrew text-xl leading-relaxed text-[#1f1912]" dir="rtl" lang="he">
                      {occ.verseVocalized}
                    </p>
                    <div className="pt-1 shrink-0">
                      <AudioPlayButton
                        audioId={`occ-he-${occ.id}`}
                        text={occ.verseVocalized}
                        lang="he-IL"
                        label="Ouvir"
                      />
                    </div>
                  </div>
                  {occ.translationPt ? (
                    <div className="flex items-start justify-between gap-3">
                      <p className="flex-1 text-sm text-[#4a3d2d] leading-relaxed">
                        {occ.translationPt}
                        <span className="text-xs text-[#6d5b45] ml-2">
                          ({occ.translationPtSource ?? 'Almeida Corrigida Fiel (ACF)'})
                        </span>
                      </p>
                      <div className="pt-0.5 shrink-0">
                        <AudioPlayButton
                          audioId={`occ-pt-${occ.id}`}
                          text={occ.translationPt}
                          lang={trLang}
                          label="Ouvir"
                        />
                      </div>
                    </div>
                  ) : occ.translationNote ? (
                    <p className="text-xs text-[#9a5410]">
                      {occ.translationNote}
                    </p>
                  ) : null}
                  {occ.translationPt && occ.translationNote && (
                    <p className="text-[11px] text-[#9a5410]">{occ.translationNote}</p>
                  )}
                </div>
              )}

              <div className="md:w-64 shrink-0 text-right border-t md:border-t-0 md:border-l qumran-divider pt-2 md:pt-0 md:pl-4 space-y-1">
                <div className="flex items-center justify-end gap-2">
                  <AudioPlayButton
                    audioId={`occ-match-${occ.id}`}
                    text={occ.matchedWordsOriginal || occ.matchedStream}
                    lang="he-IL"
                  />
                  <span className="text-xs text-[#5c4d3c]">Trecho no stream contínuo</span>
                </div>
                <div className="font-hebrew text-lg font-bold gem-hebrew tracking-wide" dir="rtl" lang="he">
                  {occ.matchedStream}
                </div>
                {occ.matchedWordsOriginal && (
                  <div className="font-hebrew text-sm text-[#4a3d2d]" dir="rtl" lang="he">
                    {occ.matchedWordsOriginal}
                  </div>
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="pt-2 space-y-3 text-xs text-[#4a3d2d]">
                {occ.contextBefore && (
                  <div className="qumran-glass-inset rounded-lg p-3 space-y-1.5">
                    <span className="text-[#5c4d3c] font-semibold">
                      Versículo anterior {occ.contextBeforeRef ? `(${occ.contextBeforeRef})` : ''}
                    </span>
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex-1 font-hebrew text-base text-[#1f1912]" dir="rtl" lang="he">
                        {occ.contextBefore}
                      </span>
                      <AudioPlayButton
                        audioId={`occ-before-he-${occ.id}`}
                        text={occ.contextBefore}
                        lang="he-IL"
                      />
                    </div>
                    {occ.contextBeforePt && (
                      <div className="flex items-start justify-between gap-3 pt-1 border-t qumran-divider">
                        <span className="flex-1 text-xs text-[#4a3d2d]">{occ.contextBeforePt}</span>
                        <AudioPlayButton
                          audioId={`occ-before-pt-${occ.id}`}
                          text={occ.contextBeforePt}
                          lang={trLang}
                        />
                      </div>
                    )}
                  </div>
                )}
                {occ.contextAfter && (
                  <div className="qumran-glass-inset rounded-lg p-3 space-y-1.5">
                    <span className="text-[#5c4d3c] font-semibold">
                      Versículo posterior {occ.contextAfterRef ? `(${occ.contextAfterRef})` : ''}
                    </span>
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex-1 font-hebrew text-base text-[#1f1912]" dir="rtl" lang="he">
                        {occ.contextAfter}
                      </span>
                      <AudioPlayButton
                        audioId={`occ-after-he-${occ.id}`}
                        text={occ.contextAfter}
                        lang="he-IL"
                      />
                    </div>
                    {occ.contextAfterPt && (
                      <div className="flex items-start justify-between gap-3 pt-1 border-t qumran-divider">
                        <span className="flex-1 text-xs text-[#4a3d2d]">{occ.contextAfterPt}</span>
                        <AudioPlayButton
                          audioId={`occ-after-pt-${occ.id}`}
                          text={occ.contextAfterPt}
                          lang={trLang}
                        />
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[#5c4d3c] block">Camada consonantal (apresentação)</span>
                    <span className="font-hebrew text-base text-[#1f1912]" dir="rtl" lang="he">
                      {occ.verseConsonantal}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#5c4d3c] block">Stream do versículo (fonte de busca)</span>
                    <span className="font-hebrew text-sm text-[#1f1912] break-all" dir="rtl" lang="he">
                      {occ.verseStream}
                    </span>
                  </div>
                </div>
                {occ.ketivQereInVerse.length > 0 && (
                  <div className="text-[#78350f] bg-[#f59e0b]/15 border border-[#b45309]/35 rounded px-3 py-1.5">
                    Diferença massorética Ketiv/Qere no versículo:{' '}
                    {occ.ketivQereInVerse.map((kq, i) => (
                      <span key={i} className="font-hebrew text-sm mr-3" dir="rtl" lang="he">
                        Ketiv: {kq.ketiv || '—'} / Qere: {kq.qere || '—'}
                      </span>
                    ))}
                  </div>
                )}
                <div className="font-mono text-[11px] text-[#6d5b45]">
                  Edição: {occ.edition} · Fonte tradução: {occ.translationPtSource ?? 'ACF'} · Parâmetros: {occ.parametersSummary}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};
