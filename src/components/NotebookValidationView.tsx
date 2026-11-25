import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, Link2, Printer, Trash2, XCircle } from 'lucide-react';
import type {
  ManifestPayload,
  NotebookConnectionItem,
  NotebookEntryItem,
  SearchHistoryRecord,
  TranslationSummary,
} from '../types';
import { AudioPlayButton } from './AudioPlayButton';

interface ValidationSuiteResponse {
  allPassed: boolean;
  acceptanceTests: Array<{ name: string; passed: boolean; details: string }>;
  validationCases: Array<{
    id: string;
    label: string;
    passed: boolean;
    reference: string;
    snippet: string;
  }>;
  algorithmVersions: Array<{ algorithm: string; version: string; description: string }>;
}

interface NotebookValidationViewProps {
  mode: 'caderno' | 'validacao';
  manifestData: ManifestPayload | null;
  translations: TranslationSummary[];
  preferredTranslationId: string;
  notebookEntries: NotebookEntryItem[];
  notebookConnections: NotebookConnectionItem[];
  searchHistory: SearchHistoryRecord[];
  draftNote: {
    title: string;
    reference: string;
    hebrew_snippet: string;
    evidence_tier: string;
    parameters_json: string;
  } | null;
  onClearDraft: () => void;
  onRefreshNotebook: () => void;
}

export const NotebookValidationView: React.FC<NotebookValidationViewProps> = ({
  mode,
  manifestData,
  translations,
  preferredTranslationId,
  notebookEntries,
  notebookConnections,
  searchHistory,
  draftNote,
  onClearDraft,
  onRefreshNotebook,
}) => {
  const [title, setTitle] = useState('');
  const [reference, setReference] = useState('');
  const [hebrewSnippet, setHebrewSnippet] = useState('');
  const [evidenceTier, setEvidenceTier] = useState('evidencia_textual');
  const [hypothesis, setHypothesis] = useState('');
  const [parametersJson, setParametersJson] = useState('{}');
  const [saving, setSaving] = useState(false);

  // Conexões entre descobertas
  const [fromEntryId, setFromEntryId] = useState<number | ''>('');
  const [toEntryId, setToEntryId] = useState<number | ''>('');
  const [relationNote, setRelationNote] = useState('');
  const [savingConn, setSavingConn] = useState(false);

  const [reportHypotheses, setReportHypotheses] = useState('');
  const [exporting, setExporting] = useState(false);

  const [validation, setValidation] = useState<ValidationSuiteResponse | null>(null);
  const [loadingVal, setLoadingVal] = useState(false);

  useEffect(() => {
    if (draftNote) {
      setTitle(draftNote.title);
      setReference(draftNote.reference);
      setHebrewSnippet(draftNote.hebrew_snippet);
      setEvidenceTier(draftNote.evidence_tier);
      setParametersJson(draftNote.parameters_json);
    }
  }, [draftNote]);

  const loadValidation = async () => {
    setLoadingVal(true);
    try {
      const res = await fetch('/api/validation');
      if (res.ok) {
        setValidation((await res.json()) as ValidationSuiteResponse);
      }
    } catch {
      // evita rejeição não tratada
    } finally {
      setLoadingVal(false);
    }
  };

  useEffect(() => {
    if (mode === 'validacao' && !validation) {
      loadValidation();
    }
  }, [mode]);

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !hypothesis.trim()) return;
    setSaving(true);
    try {
      const activeTr = translations.find((t) => t.id === preferredTranslationId);
      const snapshot = {
        preferredTranslationId,
        sigla: activeTr?.sigla ?? 'ACF',
        name: activeTr?.name ?? 'Almeida Corrigida Fiel',
        edition: activeTr?.edition ?? '1753/1819',
        capturedAtUtc: new Date().toISOString(),
      };
      const res = await fetch('/api/notebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          reference,
          hebrew_snippet: hebrewSnippet,
          evidence_tier: evidenceTier,
          hypothesis,
          parameters_json: parametersJson,
          translations_snapshot: snapshot,
          algorithm_version: 'yawe-2.1.0',
        }),
      });
      if (res.ok) {
        setTitle('');
        setReference('');
        setHebrewSnippet('');
        setHypothesis('');
        setParametersJson('{}');
        onClearDraft();
        onRefreshNotebook();
      }
    } catch {
      // evita rejeição não tratada
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (id: number) => {
    await fetch(`/api/notebook/${id}`, { method: 'DELETE' }).catch(() => {});
    onRefreshNotebook();
  };

  const handleAddConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromEntryId || !toEntryId || fromEntryId === toEntryId || !relationNote.trim()) return;
    setSavingConn(true);
    try {
      const res = await fetch('/api/notebook/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_entry_id: Number(fromEntryId),
          to_entry_id: Number(toEntryId),
          relation_note: relationNote.trim(),
        }),
      });
      if (res.ok) {
        setRelationNote('');
        onRefreshNotebook();
      }
    } catch {
      // evita rejeição não tratada
    } finally {
      setSavingConn(false);
    }
  };

  const handleDeleteConnection = async (id: number) => {
    await fetch(`/api/notebook/connections/${id}`, { method: 'DELETE' }).catch(() => {});
    onRefreshNotebook();
  };

  const handleExport = async (format: 'md' | 'json' | 'csv' | 'txt') => {
    setExporting(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          title: 'Relatório YA-WE | Pattern Engine — Caderno de Investigação',
          parameters: {
            corpus: manifestData?.manifest.primary_edition,
            booksCount: manifestData?.manifest.canonical_books_count,
            preferredTranslationId,
          },
          hypotheses: reportHypotheses,
          includeNotebook: true,
          items: notebookEntries.map((n) => ({
            reference: n.reference,
            matchedStream: '',
            matchedWordsOriginal: '',
            startOffset: 0,
            endOffset: 0,
            boundaryType: 'caderno',
            evidenceTier: n.evidence_tier,
            verseVocalized: n.hebrew_snippet,
            translationPt: '',
            edition: manifestData?.manifest.primary_edition ?? 'Miqra according to the Masorah',
            language: 'Hebraico Bíblico',
            parametersSummary: n.parameters_json,
          })),
        }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yawe_relatorio.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (mode === 'validacao') {
    return (
      <div className="space-y-6">
        <div className="qumran-glass gem-border rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#1f1912]">
                Critérios de Aceitação (Seção 13) e Casos de Validação (Seção 14)
              </h2>
              <p className="text-xs text-[#5c4d3c]">
                Testes executados deterministicamente contra os 39 arquivos consonantais contínuos em tempo real.
              </p>
            </div>
            <button
              type="button"
              disabled={loadingVal}
              onClick={loadValidation}
              className="px-4 py-2 text-xs font-semibold text-[#fefaf0] bg-[#0e4d64] hover:bg-[#0b3948] border border-[#d99f45]/45 rounded-md cursor-pointer disabled:opacity-50"
            >
              {loadingVal ? 'Executando…' : 'Reexecutar suíte completa'}
            </button>
          </div>

          {validation && (
            <div className="space-y-5">
              <div className="divide-y qumran-divider qumran-glass-inset rounded-lg">
                {validation.acceptanceTests.map((t, i) => (
                  <div key={i} className="p-3 flex items-start justify-between gap-4 text-xs">
                    <div className="flex items-start gap-2.5">
                      {t.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-[#047857] shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-semibold text-[#1f1912]">{t.name}</div>
                        <div className="text-[#4a3d2d] mt-0.5">{t.details}</div>
                      </div>
                    </div>
                    <span className={`font-mono font-semibold ${t.passed ? 'text-[#047857]' : 'text-rose-700'}`}>
                      {t.passed ? 'APROVADO' : 'FALHA'}
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#1f1912] mb-2">
                  Casos de validação bíblica da Seção 14 ({validation.validationCases.filter((c) => c.passed).length}/
                  {validation.validationCases.length})
                </h3>
                <div className="divide-y qumran-divider qumran-glass-inset rounded-lg">
                  {validation.validationCases.map((c) => (
                    <div key={c.id} className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        {c.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-[#047857] shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-700 shrink-0" />
                        )}
                        <span className="font-semibold text-[#1f1912]">{c.label}</span>
                        <span className="text-[#926c3c]">·</span>
                        <span className="text-[#4a3d2d]">{c.reference}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-hebrew text-base text-[#1f1912] max-w-xl truncate" dir="rtl" lang="he">
                          {c.snippet}
                        </span>
                        <AudioPlayButton audioId={`val-case-${c.id}`} text={c.snippet} lang="he-IL" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {manifestData && (
          <div className="qumran-glass gem-border rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#1f1912]">
                  Manifesto do Corpus e Proveniência Sefaria-Export
                </h3>
                <p className="text-xs text-[#5c4d3c]">
                  Edição: {manifestData.manifest.primary_edition} · Commit índice:{' '}
                  <span className="font-mono">{manifestData.manifest.index_commit_sha.slice(0, 16)}</span> · Curadoria:{' '}
                  {manifestData.manifest.curadoria}
                </p>
              </div>
              <div className="text-xs font-mono tabular-nums text-[#4a3d2d]">
                {manifestData.manifest.canonical_books_count} livros · {manifestData.manifest.totals.chapters} cap ·{' '}
                {manifestData.manifest.totals.verses.toLocaleString('pt-BR')} vers ·{' '}
                {manifestData.manifest.totals.words.toLocaleString('pt-BR')} pal ·{' '}
                {manifestData.manifest.totals.letters.toLocaleString('pt-BR')} letras
              </div>
            </div>

            <div className="overflow-x-auto max-h-[420px] overflow-y-auto qumran-glass-inset rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-[#e8d6b3]/95 backdrop-blur-sm border-b qumran-divider text-[#4a3d2d]">
                  <tr>
                    <th className="py-2 px-3 font-semibold">#</th>
                    <th className="py-2 px-3 font-semibold">Livro</th>
                    <th className="py-2 px-3 font-semibold">Divisão</th>
                    <th className="py-2 px-3 font-semibold text-right">Cap.</th>
                    <th className="py-2 px-3 font-semibold text-right">Vers.</th>
                    <th className="py-2 px-3 font-semibold text-right">Palavras</th>
                    <th className="py-2 px-3 font-semibold text-right">Letras</th>
                    <th className="py-2 px-3 font-semibold">SHA-256 (stream)</th>
                  </tr>
                </thead>
                <tbody className="divide-y qumran-divider">
                  {manifestData.manifest.books.map((b) => (
                    <tr key={b.slug} className="hover:bg-[#fefaf0]/35">
                      <td className="py-1.5 px-3 font-mono tabular-nums text-[#5c4d3c]">{b.order}</td>
                      <td className="py-1.5 px-3 font-semibold text-[#1f1912]">
                        {b.ptTitle} <span className="font-hebrew text-sm text-[#0b3948] ml-1">{b.heTitle}</span>
                      </td>
                      <td className="py-1.5 px-3 text-[#4a3d2d]">
                        {b.division === 'Torah' ? 'Torá' : b.division === 'Prophets' ? 'Profetas (Nevi’im)' : 'Escritos (Ketuvim)'}
                      </td>
                      <td className="py-1.5 px-3 font-mono tabular-nums text-right">{b.chapters}</td>
                      <td className="py-1.5 px-3 font-mono tabular-nums text-right">{b.verses}</td>
                      <td className="py-1.5 px-3 font-mono tabular-nums text-right">{b.words.toLocaleString('pt-BR')}</td>
                      <td className="py-1.5 px-3 font-mono tabular-nums text-right">{b.letters.toLocaleString('pt-BR')}</td>
                      <td className="py-1.5 px-3 font-mono text-[11px] text-[#5c4d3c]">{b.stream_sha256.slice(0, 18)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {manifestData.algorithmVersions && (
              <div className="pt-2">
                <h4 className="text-xs font-bold text-[#4a3d2d] mb-2">Versões dos Algoritmos Registradas</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {manifestData.algorithmVersions.map((a) => (
                    <div key={a.algorithm} className="p-2.5 qumran-glass-inset rounded-lg">
                      <div className="font-mono font-bold text-[#0b3948]">
                        {a.algorithm}@{a.version}
                      </div>
                      <div className="text-[#4a3d2d] mt-0.5">{a.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <form onSubmit={handleSaveEntry} className="qumran-glass gem-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-[#1f1912]">Novo registro no Caderno de Investigação (SQLite)</h2>

            <div>
              <label className="block text-xs text-[#5c4d3c] mb-1">Título do achado / nota</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Declaração dupla em Dt 32:39"
                className="w-full px-3 py-2 text-sm border rounded"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#5c4d3c] mb-1">Referência canônica</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Ex.: Deuteronômio 32:39"
                  className="w-full px-3 py-2 text-sm border rounded"
                />
              </div>
              <div>
                <label className="block text-xs text-[#5c4d3c] mb-1">Camada epistemológica</label>
                <select
                  value={evidenceTier}
                  onChange={(e) => setEvidenceTier(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded"
                >
                  <option value="evidencia_textual">Evidência textual</option>
                  <option value="confirmacao_lexical">Confirmação lexical</option>
                  <option value="correspondencia_estrutural">Correspondência estrutural</option>
                  <option value="hipotese_fonetica">Hipótese fonética</option>
                  <option value="hipotese_interpretativa">Hipótese interpretativa</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#5c4d3c] mb-1">Trecho hebraico (opcional)</label>
              <input
                type="text"
                dir="rtl"
                lang="he"
                value={hebrewSnippet}
                onChange={(e) => setHebrewSnippet(e.target.value)}
                className="w-full px-3 py-2 text-base font-hebrew border rounded"
              />
            </div>

            <div>
              <label className="block text-xs text-[#5c4d3c] mb-1">Anotação / Hipótese do pesquisador</label>
              <textarea
                required
                rows={4}
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                placeholder="Descreva a observação separando claramente o dado textual da interpretação..."
                className="w-full px-3 py-2 text-sm border rounded"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2 text-sm font-semibold text-[#fefaf0] bg-[#0e4d64] hover:bg-[#0b3948] border border-[#d99f45]/45 rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Gravando…' : 'Salvar no Caderno'}
            </button>
          </form>

          {/* Conexões explícitas entre descobertas */}
          <form onSubmit={handleAddConnection} className="qumran-glass gem-border rounded-xl p-5 space-y-3 no-print">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#0e4d64]" />
              <h3 className="text-sm font-bold text-[#1f1912]">Conexões entre Descobertas</h3>
            </div>
            <p className="text-xs text-[#5c4d3c]">
              Associe anotações distintas preservando a justificativa metodológica da ligação.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <select
                value={fromEntryId}
                onChange={(e) => setFromEntryId(e.target.value ? Number(e.target.value) : '')}
                className="px-2.5 py-2 border rounded"
              >
                <option value="">Descoberta A…</option>
                {notebookEntries.map((n) => (
                  <option key={n.id} value={n.id}>
                    #{n.id} · {n.title}
                  </option>
                ))}
              </select>
              <select
                value={toEntryId}
                onChange={(e) => setToEntryId(e.target.value ? Number(e.target.value) : '')}
                className="px-2.5 py-2 border rounded"
              >
                <option value="">Descoberta B…</option>
                {notebookEntries.map((n) => (
                  <option key={n.id} value={n.id}>
                    #{n.id} · {n.title}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              value={relationNote}
              onChange={(e) => setRelationNote(e.target.value)}
              placeholder="Descreva a relação observada (ex.: paralelismo de expressão pronominal)..."
              className="w-full px-3 py-2 text-xs border rounded"
            />
            <button
              type="submit"
              disabled={savingConn || !fromEntryId || !toEntryId || fromEntryId === toEntryId || !relationNote.trim()}
              className="w-full px-3 py-2 text-xs font-semibold text-[#1f1912] qumran-glass-inset hover:bg-[#ebd8b5]/80 rounded disabled:opacity-45 cursor-pointer"
            >
              {savingConn ? 'Vinculando…' : 'Registrar conexão entre notas'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="qumran-glass gem-border rounded-xl p-5 space-y-4 no-print">
            <div>
              <h2 className="text-sm font-bold text-[#1f1912]">Exportação Reprodutível (Compatível com NotebookLM)</h2>
              <p className="text-xs text-[#5c4d3c]">
                Exporta fontes canônicas, hashes SHA-256, parâmetros, snapshots de tradução, conexões e hipóteses separadas.
              </p>
            </div>

            <div>
              <label className="block text-xs text-[#5c4d3c] mb-1">Síntese de hipóteses para o relatório (opcional)</label>
              <textarea
                rows={2}
                value={reportHypotheses}
                onChange={(e) => setReportHypotheses(e.target.value)}
                placeholder="Notas metodológicas ou hipóteses a incluir na seção separada do relatório..."
                className="w-full px-3 py-2 text-sm border rounded"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['md', 'Markdown (.md)'],
                  ['json', 'JSON (.json)'],
                  ['csv', 'CSV (.csv)'],
                  ['txt', 'Texto (.txt)'],
                ] as const
              ).map(([fmt, lbl]) => (
                <button
                  key={fmt}
                  type="button"
                  disabled={exporting}
                  onClick={() => handleExport(fmt)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#1f1912] qumran-glass-inset hover:bg-[#ebd8b5]/80 rounded cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#0e4d64]" />
                  {lbl}
                </button>
              ))}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#fefaf0] bg-[#9a5410] hover:bg-[#78350f] rounded cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir / PDF
              </button>
            </div>
          </div>

          <div className="qumran-glass gem-border rounded-xl divide-y qumran-divider">
            <div className="p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1f1912]">
                Anotações salvas ({notebookEntries.length})
              </h3>
            </div>
            {notebookEntries.length === 0 ? (
              <div className="p-6 text-sm text-[#5c4d3c]">
                Nenhuma anotação registrada ainda. Salve ocorrências diretamente de qualquer módulo ou preencha o formulário ao lado.
              </div>
            ) : (
              notebookEntries.map((n) => {
                let trSnapSigla: string | null = null;
                if (n.translations_snapshot_json && n.translations_snapshot_json !== '{}') {
                  try {
                    const parsed = JSON.parse(n.translations_snapshot_json) as { sigla?: string };
                    if (parsed.sigla) trSnapSigla = parsed.sigla;
                  } catch {
                    trSnapSigla = null;
                  }
                }
                return (
                  <div key={n.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-[#1f1912]">
                          #{n.id} · {n.title}
                        </div>
                        <div className="text-xs text-[#5c4d3c]">
                          {n.reference} · {n.evidence_tier}
                          {trSnapSigla ? ` · Tradução: ${trSnapSigla}` : ''} ·{' '}
                          <span className="font-mono">{n.created_at.slice(0, 19).replace('T', ' ')}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteEntry(n.id)}
                        className="text-[#6d5b45] hover:text-rose-700 p-1 cursor-pointer no-print"
                        aria-label="Excluir anotação"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {n.hebrew_snippet && (
                      <div className="flex items-start justify-between gap-3 qumran-glass-inset px-3 py-2 rounded-lg">
                        <p className="flex-1 font-hebrew text-lg text-[#1f1912]" dir="rtl" lang="he">
                          {n.hebrew_snippet}
                        </p>
                        <AudioPlayButton
                          audioId={`note-he-${n.id}`}
                          text={n.hebrew_snippet}
                          lang="he-IL"
                          label="Ouvir"
                        />
                      </div>
                    )}
                    <p className="text-sm text-[#4a3d2d] whitespace-pre-wrap">{n.hypothesis}</p>
                  </div>
                );
              })
            )}
          </div>

          {notebookConnections.length > 0 && (
            <div className="qumran-glass gem-border rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-bold text-[#1f1912]">
                Conexões registradas ({notebookConnections.length})
              </h3>
              <div className="divide-y qumran-divider text-xs">
                {notebookConnections.map((c) => {
                  const fromNote = notebookEntries.find((e) => e.id === c.from_entry_id);
                  const toNote = notebookEntries.find((e) => e.id === c.to_entry_id);
                  return (
                    <div key={c.id} className="py-2 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#0b3948]">
                          #{c.from_entry_id} ({fromNote?.title ?? 'Nota removida'}) ↔ #{c.to_entry_id} (
                          {toNote?.title ?? 'Nota removida'})
                        </div>
                        <div className="text-[#4a3d2d] mt-0.5">{c.relation_note}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteConnection(c.id)}
                        className="text-[#6d5b45] hover:text-rose-700 p-1 cursor-pointer no-print"
                        aria-label="Remover conexão"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {searchHistory.length > 0 && (
            <div className="qumran-glass gem-border rounded-xl p-4 space-y-2 no-print">
              <h3 className="text-xs font-bold text-[#1f1912]">Histórico reprodutível de consultas recentes</h3>
              <div className="divide-y qumran-divider text-xs">
                {searchHistory.slice(0, 10).map((h) => (
                  <div key={h.id} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="font-hebrew text-base font-bold text-[#0b3948]" dir="rtl" lang="he">{h.query_summary}</span>
                    <span className="font-mono tabular-nums text-[#5c4d3c]">
                      {h.total_hits} ocorrências · {h.algorithm_version}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
