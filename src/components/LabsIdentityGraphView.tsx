import React, { useEffect, useState } from 'react';
import { FlaskConical, Network } from 'lucide-react';
import type { ManifestBook, OccurrenceItem } from '../types';
import { AudioPlayButton } from './AudioPlayButton';
import { OccurrenceList } from './OccurrenceList';

interface IdentityResponse {
  vocabulary: Array<{
    term: string;
    streamPattern: string;
    label: string;
    exactCount: number;
    sampleOccurrences: OccurrenceItem[];
  }>;
  autoDiscoveredFormulas: Array<{
    phrase: string;
    voc: string;
    count: number;
    sampleRef: string;
  }>;
  masoreticDiffs: Array<{
    reference: string;
    ketiv: string;
    qere: string;
    type: string;
    verseVocalized: string;
  }>;
  totalMasoreticDiffsMatched: number;
  note: string;
}

interface LabsResponse {
  laboratories: Array<{
    id: string;
    title: string;
    description: string;
    terms: Array<{ he: string; pt: string; count: number; sampleRefs: string[] }>;
  }>;
  crossings: Array<{
    reference: string;
    slug: string;
    chapter: number;
    verse: number;
    matchedSegments: Array<{ labId: string; labTitle: string; term: string; pt: string; wordVocalized: string }>;
    verseVocalized: string;
    translationPt: string;
  }>;
  graph: {
    nodes: Array<{ id: string; label: string; labId: string; count: number }>;
    edges: Array<{ source: string; target: string; weight: number }>;
  };
  note: string;
}

const LAB_LIST = [
  { id: 'misterio', title: '01. Mistério e Revelação' },
  { id: 'identidade', title: '02. Identidade' },
  { id: 'pai_filho_pedra', title: '03. Pai, Filho e Pedra' },
  { id: 'direita_acusacao', title: '04. Direita e Acusação' },
  { id: 'pastor_salvacao_shaddai_ventre', title: '05. Pastor, Salvação, Shaddai e Ventre' },
];

const LAB_COLORS: Record<string, string> = {
  misterio: '#0e4d64',
  identidade: '#0f766e',
  pai_filho_pedra: '#b45309',
  direita_acusacao: '#9f1239',
  pastor_salvacao_shaddai_ventre: '#155e75',
};

interface LabsIdentityGraphViewProps {
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

export const LabsIdentityGraphView: React.FC<LabsIdentityGraphViewProps> = ({
  books,
  onSaveToNotebook,
  onInspectChapter,
}) => {
  const [subTab, setSubTab] = useState<'labs' | 'identity' | 'graph'>('labs');
  const [selectedLabs, setSelectedLabs] = useState<string[]>(['misterio', 'pastor_salvacao_shaddai_ventre']);
  const [enableCrossings, setEnableCrossings] = useState(true);
  const [scopeBook, setScopeBook] = useState('all');
  const [labsData, setLabsData] = useState<LabsResponse | null>(null);
  const [identityData, setIdentityData] = useState<IdentityResponse | null>(null);
  const [selectedTermOccs, setSelectedTermOccs] = useState<OccurrenceItem[] | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const executeLabs = async (labs = selectedLabs, cross = enableCrossings, bk = scopeBook) => {
    setLoading(true);
    try {
      const res = await fetch('/api/labs/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedLabIds: labs,
          enableCrossings: cross,
          bookSlug: bk,
        }),
      });
      setLabsData((await res.json()) as LabsResponse);
    } finally {
      setLoading(false);
    }
  };

  const loadIdentity = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/labs/identity');
      setIdentityData((await res.json()) as IdentityResponse);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    executeLabs();
  }, []);

  const toggleLab = (id: string) => {
    setSelectedLabs((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      }
      return [...prev, id];
    });
  };

  // Layout radial deterministico para grafo SVG de co-ocorrencia
  const nodes = labsData?.graph.nodes.slice(0, 18) ?? [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = (labsData?.graph.edges ?? []).filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  const cx = 360;
  const cy = 220;
  const radius = 155;
  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, idx) => {
    const angle = (idx / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
    positions.set(n.id, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  });

  return (
    <div className="space-y-6">
      <div className="qumran-glass gem-border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 qumran-glass-inset rounded-lg">
            <button
              type="button"
              onClick={() => setSubTab('labs')}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                subTab === 'labs'
                  ? 'bg-[#0e4d64] text-[#fefaf0] shadow-xs'
                  : 'text-[#4a3d2d] hover:text-[#1f1912]'
              }`}
            >
              Laboratórios Independentes (5 eixos)
            </button>
            <button
              type="button"
              onClick={() => {
                setSubTab('identity');
                if (!identityData) loadIdentity();
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                subTab === 'identity'
                  ? 'bg-[#0e4d64] text-[#fefaf0] shadow-xs'
                  : 'text-[#4a3d2d] hover:text-[#1f1912]'
              }`}
            >
              Declarações de Identidade & Massorá
            </button>
            <button
              type="button"
              onClick={() => setSubTab('graph')}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                subTab === 'graph'
                  ? 'bg-[#0e4d64] text-[#fefaf0] shadow-xs'
                  : 'text-[#4a3d2d] hover:text-[#1f1912]'
              }`}
            >
              Grafo de Co-ocorrência
            </button>
          </div>
          <span className="text-xs text-[#5c4d3c]">
            Segmentos independentes sem fusão automática de significados
          </span>
        </div>

        {subTab !== 'identity' && (
          <div className="space-y-3 pt-2 border-t qumran-divider">
            <div className="flex flex-wrap items-center gap-2">
              {LAB_LIST.map((lab) => {
                const active = selectedLabs.includes(lab.id);
                return (
                  <button
                    key={lab.id}
                    type="button"
                    onClick={() => toggleLab(lab.id)}
                    className={`px-3 py-1.5 text-xs rounded border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#0e4d64] text-[#fefaf0] border-[#fbbf24]/55 font-semibold'
                        : 'qumran-glass-inset text-[#4a3d2d] hover:border-[#0e4d64]/45'
                    }`}
                  >
                    {lab.title}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#4a3d2d]">
                <select
                  value={scopeBook}
                  onChange={(e) => setScopeBook(e.target.value)}
                  className="px-3 py-1.5 text-xs border rounded"
                >
                  <option value="all">Todo o Tanakh (39 livros)</option>
                  {books.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.ptTitle}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableCrossings}
                    onChange={(e) => setEnableCrossings(e.target.checked)}
                    className="accent-[#0e4d64]"
                  />
                  Cruzamentos opcionais entre segmentos (sem fundir termos)
                </label>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => executeLabs()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#fefaf0] bg-[#0e4d64] hover:bg-[#0b3948] border border-[#d99f45]/45 rounded-md cursor-pointer disabled:opacity-50"
              >
                <FlaskConical className="w-3.5 h-3.5 text-[#fbbf24]" />
                {loading ? 'Processando…' : 'Atualizar laboratórios'}
              </button>
            </div>
          </div>
        )}
      </div>

      {subTab === 'labs' && labsData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {labsData.laboratories.map((lab) => (
              <div key={lab.id} className="qumran-glass gem-border rounded-xl p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-[#1f1912]">{lab.title}</h3>
                  <p className="text-xs text-[#5c4d3c]">{lab.description}</p>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b qumran-divider text-[#5c4d3c]">
                      <th className="py-1.5 font-semibold">Forma consonantal</th>
                      <th className="py-1.5 font-semibold">Glosa de referência</th>
                      <th className="py-1.5 font-semibold text-right">Frequência</th>
                      <th className="py-1.5 font-semibold pl-3">Amostras</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y qumran-divider">
                    {lab.terms.map((t) => (
                      <tr key={t.he}>
                        <td className="py-1.5">
                          <div className="inline-flex items-center gap-2">
                            <span className="font-hebrew text-lg font-bold text-[#0b3948]" dir="rtl" lang="he">
                              {t.he}
                            </span>
                            <AudioPlayButton
                              audioId={`lab-${lab.id}-${t.he}`}
                              text={t.he}
                              lang="he-IL"
                            />
                          </div>
                        </td>
                        <td className="py-1.5 text-[#4a3d2d]">{t.pt}</td>
                        <td className="py-1.5 font-mono tabular-nums text-right font-bold text-[#1f1912]">
                          {t.count.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-1.5 pl-3 text-[#5c4d3c] truncate max-w-[180px]">
                          {t.sampleRefs.slice(0, 2).join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {enableCrossings && (
            <div className="qumran-glass gem-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1f1912]">
                  Versículos com cruzamento entre segmentos ({labsData.crossings.length})
                </h3>
                <span className="text-xs text-[#5c4d3c]">{labsData.note}</span>
              </div>
              <div className="divide-y qumran-divider">
                {labsData.crossings.slice(0, 40).map((cr, idx) => (
                  <div key={idx} className="py-3 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => onInspectChapter(cr.slug, cr.chapter)}
                        className="font-semibold text-[#0e4d64] hover:text-[#9a5410] hover:underline cursor-pointer"
                      >
                        {cr.reference}
                      </button>
                      <div className="flex flex-wrap gap-3 text-[#4a3d2d]">
                        {cr.matchedSegments.map((seg, si) => (
                          <span key={si}>
                            <span className="font-hebrew text-sm text-[#0b3948] font-bold" dir="rtl" lang="he">{seg.term}</span>
                            {' '}({seg.pt} · {seg.labTitle})
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <p className="flex-1 font-hebrew text-lg text-[#1f1912]" dir="rtl" lang="he">
                        {cr.verseVocalized}
                      </p>
                      <AudioPlayButton
                        audioId={`lab-cr-he-${cr.slug}-${cr.chapter}-${cr.verse}-${idx}`}
                        text={cr.verseVocalized}
                        lang="he-IL"
                        label="Ouvir"
                      />
                    </div>
                    {cr.translationPt && (
                      <div className="flex items-start justify-between gap-3">
                        <p className="flex-1 text-xs text-[#4a3d2d]">{cr.translationPt}</p>
                        <AudioPlayButton
                          audioId={`lab-cr-pt-${cr.slug}-${cr.chapter}-${cr.verse}-${idx}`}
                          text={cr.translationPt}
                          lang="pt-BR"
                          label="Ouvir"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'identity' && identityData && (
        <div className="space-y-6">
          <div className="qumran-glass gem-border rounded-xl p-4 text-xs text-[#4a3d2d]">
            {identityData.note}
          </div>

          <div className="qumran-glass gem-border rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b qumran-divider bg-[#e8d6b3]/50 text-xs text-[#4a3d2d]">
                  <th className="py-2.5 px-4 font-semibold">Declaração / Vocabulário inicial</th>
                  <th className="py-2.5 px-4 font-semibold">Forma / Leitura</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Ocorrências exatas</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Inspeção</th>
                </tr>
              </thead>
              <tbody className="divide-y qumran-divider">
                {identityData.vocabulary.map((v) => (
                  <tr key={v.term} className="hover:bg-[#fefaf0]/35">
                    <td className="py-2.5 px-4">
                      <div className="inline-flex items-center gap-2">
                        <span className="font-hebrew text-xl font-bold text-[#0b3948]" dir="rtl" lang="he">{v.term}</span>
                        <AudioPlayButton audioId={`id-term-${v.term}`} text={v.term} lang="he-IL" />
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-[#4a3d2d]">{v.label}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-right font-bold text-[#1f1912]">
                      {v.exactCount.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedTermOccs(v.sampleOccurrences)}
                        className="text-xs font-medium text-[#0e4d64] hover:text-[#9a5410] hover:underline cursor-pointer"
                      >
                        Ver amostra ({v.sampleOccurrences.length})
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedTermOccs && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1f1912]">Amostra de declarações selecionadas</h3>
                <button
                  type="button"
                  onClick={() => setSelectedTermOccs(null)}
                  className="text-xs text-[#5c4d3c] hover:text-[#1f1912] cursor-pointer"
                >
                  Fechar amostra
                </button>
              </div>
              <OccurrenceList
                items={selectedTermOccs}
                onSaveToNotebook={onSaveToNotebook}
                onInspectChapter={onInspectChapter}
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="qumran-glass gem-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-[#1f1912]">
                Fórmulas co-ocorrentes descobertas automaticamente
              </h3>
              <div className="divide-y qumran-divider text-xs">
                {identityData.autoDiscoveredFormulas.slice(0, 15).map((f) => (
                  <div key={f.phrase} className="py-2 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2">
                      <span className="font-hebrew text-lg font-bold text-[#0b3948]" dir="rtl" lang="he">{f.voc}</span>
                      <AudioPlayButton audioId={`id-formula-${f.phrase}`} text={f.voc} lang="he-IL" />
                    </div>
                    <div className="text-right text-[#4a3d2d]">
                      <span className="font-mono tabular-nums font-bold text-[#1f1912]">{f.count}×</span>
                      <span className="ml-2 text-[#6d5b45]">ex.: {f.sampleRef}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="qumran-glass gem-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-[#1f1912]">
                Diferenças massoréticas (Ketiv/Qere) em nomes/declarações ({identityData.totalMasoreticDiffsMatched})
              </h3>
              <div className="divide-y qumran-divider text-xs max-h-96 overflow-y-auto">
                {identityData.masoreticDiffs.map((d, idx) => (
                  <div key={idx} className="py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#1f1912]">{d.reference}</span>
                      <span className="text-[#9a5410] font-medium">
                        Ketiv: <span className="font-hebrew text-sm" dir="rtl" lang="he">{d.ketiv || '—'}</span>
                        {' / '}
                        Qere: <span className="font-hebrew text-sm" dir="rtl" lang="he">{d.qere || '—'}</span>
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 font-hebrew text-base text-[#1f1912]" dir="rtl" lang="he">{d.verseVocalized}</p>
                      <AudioPlayButton audioId={`id-kq-${idx}`} text={d.verseVocalized} lang="he-IL" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'graph' && labsData && (
        <div className="qumran-glass gem-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-[#0e4d64]" />
              <h3 className="text-sm font-bold text-[#1f1912]">
                Grafo de Co-ocorrência no mesmo versículo ({nodes.length} nós, {edges.length} arestas)
              </h3>
            </div>
            <span className="text-xs text-[#5c4d3c]">
              Passe o cursor sobre um nó para destacar conexões diretas
            </span>
          </div>

          <div className="qumran-glass-inset rounded-lg overflow-hidden">
            <svg viewBox="0 0 720 440" className="w-full h-[420px]">
              {edges.map((e, i) => {
                const p1 = positions.get(e.source);
                const p2 = positions.get(e.target);
                if (!p1 || !p2) return null;
                const highlighted = hoveredNode === e.source || hoveredNode === e.target;
                return (
                  <line
                    key={i}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={highlighted ? '#0e4d64' : '#b49464'}
                    strokeWidth={Math.min(5, Math.max(1, Math.log2(e.weight + 1)))}
                    strokeOpacity={hoveredNode && !highlighted ? 0.2 : 0.72}
                  />
                );
              })}
              {nodes.map((n) => {
                const pos = positions.get(n.id);
                if (!pos) return null;
                const color = LAB_COLORS[n.labId] ?? '#0b3948';
                const r = Math.min(24, Math.max(9, 7 + Math.sqrt(n.count) * 0.3));
                const isActive = hoveredNode === n.id;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onMouseEnter={() => setHoveredNode(n.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    className="cursor-pointer"
                  >
                    <circle
                      r={r}
                      fill={color}
                      fillOpacity={isActive ? 1 : 0.88}
                      stroke="#fbbf24"
                      strokeWidth={isActive ? 2.5 : 1.5}
                    />
                    <text
                      y={r + 13}
                      textAnchor="middle"
                      className="text-[11px] fill-[#1f1912] font-semibold"
                    >
                      {n.label} ({n.count})
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};
