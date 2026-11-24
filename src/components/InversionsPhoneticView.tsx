import React, { useState } from 'react';
import { AudioWaveform, Shuffle } from 'lucide-react';
import type { OccurrenceItem } from '../types';
import { AudioPlayButton } from './AudioPlayButton';
import { HebrewKeyboard } from './HebrewKeyboard';
import { OccurrenceList } from './OccurrenceList';

interface InversionResponse {
  original: {
    form: string;
    attestedVariants: string[];
    lexiconCount: number;
    booksCount: number;
    classification: string;
  };
  inverted: {
    form: string;
    attestedVariants: string[];
    lexiconCount: number;
    booksCount: number;
    classification: string;
  };
  invertedSampleOccurrences: OccurrenceItem[];
  invertedTotalStreamHits: number;
  permutations: {
    truncated: boolean;
    totalTheoretical: number;
    attested: Array<{
      form: string;
      attestedVariants: string[];
      lexiconCount: number;
      booksCount: number;
      classification: string;
    }>;
    unattestedCount: number;
    sampleUnattested: string[];
  } | null;
  algorithmVersion: string;
  computationalLimits: string;
}

interface PhoneticRule {
  id: string;
  pair: [string, string];
  label: string;
  category: string;
  cost: number;
}

interface PhoneticResponse {
  query: string;
  availableRules: PhoneticRule[];
  totalLexiconCandidates: number;
  matches: Array<{
    word: string;
    cost: number;
    editDistance: number;
    transformations: string[];
    lexiconCount: number;
    booksCount: number;
    language: string;
    evidenceTier: string;
    sampleOccurrences: OccurrenceItem[];
  }>;
  disclaimer: string;
  algorithmVersion: string;
}

const DEFAULT_RULES: PhoneticRule[] = [
  { id: 'ayin_alef', pair: ['ע', 'א'], label: 'ע ↔ א (guturais)', category: 'Guturais', cost: 0.4 },
  { id: 'het_he', pair: ['ח', 'ה'], label: 'ח ↔ ה (guturais)', category: 'Guturais', cost: 0.45 },
  { id: 'kaf_het', pair: ['כ', 'ח'], label: 'כ ↔ ח (fricativa/gutural)', category: 'Velares/Guturais', cost: 0.5 },
  { id: 'qof_kaf', pair: ['ק', 'כ'], label: 'ק ↔ כ (enfática/velar)', category: 'Velares', cost: 0.35 },
  { id: 'tav_tet', pair: ['ת', 'ט'], label: 'ת ↔ ט (dental/enfática)', category: 'Dentais', cost: 0.35 },
  { id: 'shin_samekh', pair: ['ש', 'ס'], label: 'ש ↔ ס (sibilantes)', category: 'Sibilantes', cost: 0.35 },
  { id: 'resh_dalet', pair: ['ר', 'ד'], label: 'ר ↔ ד (proximidade)', category: 'Coronais', cost: 0.6 },
  { id: 'vav_yod', pair: ['ו', 'י'], label: 'ו ↔ י (semivogais)', category: 'Semivogais', cost: 0.4 },
  { id: 'alef_yod', pair: ['א', 'י'], label: 'א ↔ י (glotal/palatal)', category: 'Semivogais', cost: 0.5 },
];

const CLASS_LABEL: Record<string, string> = {
  hebraico_bíblico: 'Hebraico bíblico atestado',
  aramaico_bíblico: 'Aramaico bíblico atestado',
  hebraico_e_aramaico: 'Hebraico e Aramaico bíblicos',
  não_atestada_como_palavra: 'Não atestada como palavra isolada',
};

interface InversionsPhoneticViewProps {
  mode: 'inversions' | 'phonetic';
  onSaveToNotebook: (item: {
    title: string;
    reference: string;
    hebrew_snippet: string;
    evidence_tier: string;
    parameters_json: string;
  }) => void;
  onInspectChapter: (slug: string, chapter: number) => void;
}

export const InversionsPhoneticView: React.FC<InversionsPhoneticViewProps> = ({
  mode,
  onSaveToNotebook,
  onInspectChapter,
}) => {
  const [term, setTerm] = useState(mode === 'inversions' ? 'פשר' : 'רז');
  const [normalizeFinals, setNormalizeFinals] = useState(false);
  const [includePermutations, setIncludePermutations] = useState(true);
  const [includeStreamSubstrings, setIncludeStreamSubstrings] = useState(false);
  const [invData, setInvData] = useState<InversionResponse | null>(null);

  const [activeRules, setActiveRules] = useState<string[]>(['ayin_alef', 'shin_samekh', 'qof_kaf', 'resh_dalet']);
  const [maxCost, setMaxCost] = useState(0.8);
  const [phonData, setPhonData] = useState<PhoneticResponse | null>(null);

  const [loading, setLoading] = useState(false);

  const runInversions = async (targetTerm = term) => {
    setLoading(true);
    try {
      const res = await fetch('/api/search/inversions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: targetTerm,
          normalizeFinals,
          includePermutations,
          includeStreamSubstrings,
        }),
      });
      setInvData((await res.json()) as InversionResponse);
    } finally {
      setLoading(false);
    }
  };

  const runPhonetic = async (targetTerm = term) => {
    setLoading(true);
    try {
      const res = await fetch('/api/search/phonetic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: targetTerm,
          activeRuleIds: activeRules,
          maxCost,
          limit: 40,
        }),
      });
      setPhonData((await res.json()) as PhoneticResponse);
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = (id: string) => {
    setActiveRules((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'inversions') runInversions();
    else runPhonetic();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label className="block text-xs text-slate-500 mb-1">
              {mode === 'inversions'
                ? 'Palavra / raiz hebraica para inversão e permutação'
                : 'Termo de referência para comparação fonética experimental'}
            </label>
            <input
              type="text"
              dir="rtl"
              lang="he"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-full px-3.5 py-2 text-lg font-hebrew bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
            />
          </div>

          {mode === 'inversions' ? (
            <div className="md:col-span-5 flex flex-wrap items-center gap-4 text-xs text-slate-700 pb-2">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={normalizeFinals}
                  onChange={(e) => setNormalizeFinals(e.target.checked)}
                />
                Normalizar finais
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePermutations}
                  onChange={(e) => setIncludePermutations(e.target.checked)}
                />
                Gerar permutações (≤7 letras)
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStreamSubstrings}
                  onChange={(e) => setIncludeStreamSubstrings(e.target.checked)}
                />
                Incluir subcadeias no stream
              </label>
            </div>
          ) : (
            <div className="md:col-span-5">
              <label className="block text-xs text-slate-500 mb-1">
                Custo máximo de transformação fonética ({maxCost.toFixed(2)})
              </label>
              <input
                type="range"
                min={0.3}
                max={1.8}
                step={0.05}
                value={maxCost}
                onChange={(e) => setMaxCost(Number(e.target.value))}
                className="w-full"
              />
            </div>
          )}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded transition-colors cursor-pointer disabled:opacity-50"
            >
              {mode === 'inversions' ? <Shuffle className="w-4 h-4" /> : <AudioWaveform className="w-4 h-4" />}
              {loading ? 'Analisando…' : 'Executar'}
            </button>
          </div>
        </div>

        {mode === 'phonetic' && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="text-xs text-slate-500">Regras fonéticas experimentais independentes:</div>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_RULES.map((r) => {
                const active = activeRules.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRule(r.id)}
                    className={`px-2.5 py-1.5 text-xs rounded border transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-50 border-blue-600 text-blue-900 font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {r.label} · custo {r.cost}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <HebrewKeyboard
          onInsert={(ch) => setTerm((t) => t + ch)}
          presets={[
            { label: 'פשר / רשף', value: 'פשר' },
            { label: 'רז / זר', value: 'רז' },
            { label: 'פלא / אלף', value: 'פלא' },
            { label: 'לבב / בבל', value: 'לבב' },
            { label: 'בינה / הניב', value: 'בינה' },
            { label: 'דעת / תעד', value: 'דעת' },
          ]}
          onSelectPreset={(val) => {
            setTerm(val);
            if (mode === 'inversions') runInversions(val);
            else runPhonetic(val);
          }}
        />
      </form>

      {mode === 'inversions' && invData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-md p-4 space-y-2">
              <div className="text-xs text-slate-500">Forma original (ordem lógica)</div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-hebrew text-3xl font-bold text-slate-900" dir="rtl" lang="he">
                    {invData.original.form}
                  </span>
                  <AudioPlayButton
                    audioId={`inv-orig-${invData.original.form}`}
                    text={invData.original.attestedVariants[0] || invData.original.form}
                    lang="he-IL"
                  />
                </div>
                <span className="font-mono tabular-nums text-sm text-slate-700">
                  {invData.original.lexiconCount.toLocaleString()} ocorrências ({invData.original.booksCount} livros)
                </span>
              </div>
              <div className="text-xs text-slate-600">{CLASS_LABEL[invData.original.classification]}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md p-4 space-y-2">
              <div className="text-xs text-slate-500">Inversão lógica</div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-hebrew text-3xl font-bold text-blue-700" dir="rtl" lang="he">
                    {invData.inverted.form}
                  </span>
                  <AudioPlayButton
                    audioId={`inv-rev-${invData.inverted.form}`}
                    text={invData.inverted.attestedVariants[0] || invData.inverted.form}
                    lang="he-IL"
                  />
                </div>
                <span className="font-mono tabular-nums text-sm text-slate-700">
                  {invData.inverted.lexiconCount.toLocaleString()} no léxico · {invData.invertedTotalStreamHits} no filtro
                </span>
              </div>
              <div className="text-xs text-slate-600">{CLASS_LABEL[invData.inverted.classification]}</div>
            </div>
          </div>

          {invData.permutations && (
            <div className="bg-white border border-slate-200 rounded-md p-5 space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Permutações validadas no corpus ({invData.permutations.attested.length} atestadas de{' '}
                    {invData.permutations.totalTheoretical} combinações únicas)
                  </h3>
                  <p className="text-xs text-slate-500">{invData.computationalLimits}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                      <th className="py-2 px-3 font-medium">Permutação</th>
                      <th className="py-2 px-3 font-medium">Classificação no Tanakh</th>
                      <th className="py-2 px-3 font-medium text-right">Frequência</th>
                      <th className="py-2 px-3 font-medium text-right">Livros</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invData.permutations.attested.map((p) => (
                      <tr key={p.form} className="hover:bg-slate-50">
                        <td className="py-2 px-3">
                          <div className="inline-flex items-center gap-2">
                            <span className="font-hebrew text-xl font-semibold text-slate-900" dir="rtl" lang="he">
                              {p.form}
                            </span>
                            <AudioPlayButton
                              audioId={`inv-perm-${p.form}`}
                              text={p.attestedVariants[0] || p.form}
                              lang="he-IL"
                            />
                          </div>
                        </td>
                        <td className="py-2 px-3 text-xs text-slate-700">{CLASS_LABEL[p.classification]}</td>
                        <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-900">
                          {p.lexiconCount.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-600">{p.booksCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {invData.permutations.sampleUnattested.length > 0 && (
                <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                  Não atestadas no corpus ({invData.permutations.unattestedCount}):{' '}
                  <span className="font-hebrew text-sm text-slate-600" dir="rtl" lang="he">
                    {invData.permutations.sampleUnattested.join(' · ')}
                  </span>
                </div>
              )}
            </div>
          )}

          {invData.invertedSampleOccurrences.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">
                Amostra de ocorrências para a forma invertida ({invData.inverted.form})
              </h3>
              <OccurrenceList
                items={invData.invertedSampleOccurrences}
                onSaveToNotebook={onSaveToNotebook}
                onInspectChapter={onInspectChapter}
              />
            </div>
          )}
        </div>
      )}

      {mode === 'phonetic' && phonData && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
            <span>{phonData.disclaimer}</span>
            <span className="font-mono tabular-nums">
              {phonData.totalLexiconCandidates} candidatos no léxico ({phonData.algorithmVersion})
            </span>
          </div>

          <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-md">
            {phonData.matches.map((m) => (
              <div key={m.word} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-hebrew text-2xl font-bold text-slate-900" dir="rtl" lang="he">
                      {m.word}
                    </span>
                    <AudioPlayButton
                      audioId={`phon-word-${m.word}`}
                      text={m.word}
                      lang="he-IL"
                    />
                    <span className="text-xs text-amber-800 font-medium">
                      {m.cost === 0 ? 'Forma exata (custo 0)' : 'Hipótese fonética experimental'}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-600">
                      Custo: {m.cost} · Distância Levenshtein: {m.editDistance} · {m.lexiconCount}× em {m.booksCount} livros · {m.language}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onSaveToNotebook({
                        title: `Hipótese fonética: ${phonData.query} → ${m.word}`,
                        reference: m.sampleOccurrences[0]?.reference ?? 'Léxico Tanakh',
                        hebrew_snippet: m.sampleOccurrences[0]?.verseVocalized ?? m.word,
                        evidence_tier: 'hipotese_fonetica',
                        parameters_json: JSON.stringify({ cost: m.cost, transformations: m.transformations }),
                      })
                    }
                    className="px-2.5 py-1 text-xs text-blue-700 border border-blue-200 rounded hover:bg-blue-50 cursor-pointer"
                  >
                    Registrar hipótese
                  </button>
                </div>

                {m.transformations.length > 0 && (
                  <div className="text-xs font-mono text-slate-600">
                    Transformações aplicadas: {m.transformations.join(' | ')}
                  </div>
                )}

                {m.sampleOccurrences[0] && (
                  <div className="bg-slate-50 p-3 rounded border border-slate-100 text-xs space-y-2">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onInspectChapter(m.sampleOccurrences[0].slug, m.sampleOccurrences[0].chapter)}
                        className="text-blue-700 font-medium hover:underline text-left shrink-0 cursor-pointer"
                      >
                        {m.sampleOccurrences[0].reference}
                      </button>
                      <div className="flex items-start justify-end gap-2">
                        <span className="font-hebrew text-base text-slate-800" dir="rtl" lang="he">
                          {m.sampleOccurrences[0].verseVocalized}
                        </span>
                        <AudioPlayButton
                          audioId={`phon-he-${m.word}`}
                          text={m.sampleOccurrences[0].verseVocalized}
                          lang="he-IL"
                          label="Ouvir"
                        />
                      </div>
                    </div>
                    {m.sampleOccurrences[0].translationPt && (
                      <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-200/70">
                        <span className="flex-1 text-slate-600">{m.sampleOccurrences[0].translationPt}</span>
                        <AudioPlayButton
                          audioId={`phon-pt-${m.word}`}
                          text={m.sampleOccurrences[0].translationPt}
                          lang="pt-BR"
                          label="Ouvir"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
