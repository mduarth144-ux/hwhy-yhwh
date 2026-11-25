import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  CheckCircle2,
  GitCompare,
  Lock,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { CanonGroup, CatalogBookItem, TranslationSummary } from '../types';

const CANON_GROUP_LABELS: Record<CanonGroup | 'all', string> = {
  all: 'Todos os livros',
  torah: 'Torá (Pentateuco)',
  prophets: 'Nevi’im (Profetas)',
  writings: 'Ketuvim (Escritos)',
  deuterocanonical: 'Deuterocanônicos',
  apocrypha_addition: 'Adições Gregas (LXX / Vulgata)',
  new_testament: 'Novo Testamento',
};

const COPYRIGHT_LABEL: Record<string, string> = {
  public_domain: 'Domínio público',
  restricted_local_only: 'Uso local restrito (não versionada no Git)',
  custom_license: 'Licença específica',
};

interface TranslationLibraryViewProps {
  translations: TranslationSummary[];
  catalogBooks: CatalogBookItem[];
  preferredTranslationId: string;
  comparisonTranslationIds: string[];
  refreshing: boolean;
  refreshMessage: string | null;
  onSetPreferredTranslation: (id: string) => void;
  onToggleComparisonTranslation: (id: string) => void;
  onRefreshCatalog: () => void;
  onInspectChapter: (slug: string, chapter: number) => void;
  onCompareBookTranslations: (bookId: string, chapter: number) => void;
}

export const TranslationLibraryView: React.FC<TranslationLibraryViewProps> = ({
  translations,
  catalogBooks,
  preferredTranslationId,
  comparisonTranslationIds,
  refreshing,
  refreshMessage,
  onSetPreferredTranslation,
  onToggleComparisonTranslation,
  onRefreshCatalog,
  onInspectChapter,
  onCompareBookTranslations,
}) => {
  const [groupFilter, setGroupFilter] = useState<CanonGroup | 'all'>('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [searchBook, setSearchBook] = useState('');

  const filteredBooks = useMemo(() => {
    const q = searchBook.trim().toLowerCase();
    return catalogBooks.filter((b) => {
      if (groupFilter !== 'all' && b.canonGroup !== groupFilter) return false;
      if (onlyAvailable && b.availableTranslations.length === 0) return false;
      if (q && !b.ptTitle.toLowerCase().includes(q) && !b.bookId.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [catalogBooks, groupFilter, onlyAvailable, searchBook]);

  const installedBooksCount = useMemo(
    () => catalogBooks.filter((b) => b.availableTranslations.length > 0).length,
    [catalogBooks],
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho e ação de atualização de catálogo */}
      <section className="qumran-glass gem-border rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-[#0e4d64]">
              <BookMarked className="w-4 h-4 text-[#b45309]" />
              <span>Registro Desacoplado de Traduções (`data/translations/`)</span>
            </div>
            <h2 className="text-lg font-bold text-[#1f1912]">
              Biblioteca de Traduções Instaladas ({translations.length})
            </h2>
            <p className="text-xs text-[#4a3d2d] leading-relaxed">
              O corpus consonantal hebraico/aramaico (`data/maps/`) permanece imutável e independente das traduções. Novos pacotes gerados pelo importador externo <span className="font-mono">yawe-bible-importer</span> aparecem aqui automaticamente ao atualizar o catálogo.
            </p>
          </div>

          <button
            type="button"
            disabled={refreshing}
            onClick={onRefreshCatalog}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#fefaf0] bg-[#0e4d64] hover:bg-[#0b3948] border border-[#d99f45]/45 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#fbbf24] ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando catálogo…' : 'Atualizar catálogo local'}
          </button>
        </div>

        {refreshMessage && (
          <div className="qumran-glass-inset rounded-lg px-3.5 py-2 text-xs text-[#0b3948] font-medium">
            {refreshMessage}
          </div>
        )}

        {/* Cards das traduções instaladas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {translations.map((tr) => {
            const isPreferred = tr.id === preferredTranslationId;
            const isInCompare = comparisonTranslationIds.includes(tr.id);

            return (
              <article
                key={tr.id}
                className={`qumran-glass-inset rounded-xl p-4 space-y-3 border transition-colors ${
                  isPreferred ? 'border-[#0e4d64]/65 shadow-sm' : 'border-[#926c3c]/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-[#0b3948]">
                        {tr.sigla}
                      </span>
                      <span aria-hidden="true" className="text-[#926c3c]">·</span>
                      <h3 className="text-sm font-bold text-[#1f1912] truncate">{tr.name}</h3>
                    </div>
                    <div className="text-xs text-[#5c4d3c]">
                      Idioma: <strong className="text-[#1f1912]">{tr.language}</strong> · Edição:{' '}
                      <span className="text-[#1f1912]">{tr.edition}</span> ({tr.revision})
                    </div>
                    <div className="text-[11px] text-[#6d5b45]">
                      Origem: {tr.origin}
                    </div>
                  </div>

                  <div className="text-right shrink-0 font-mono tabular-nums text-xs text-[#4a3d2d]">
                    <div className="text-base font-bold text-[#0b3948]">{tr.booksCount} livros</div>
                    <div>{tr.versesCount.toLocaleString('pt-BR')} versículos</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#4a3d2d] pt-2 border-t qumran-divider">
                  <span className="inline-flex items-center gap-1">
                    {tr.copyright.restrictedLocalOnly ? (
                      <Lock className="w-3.5 h-3.5 text-[#9a5410]" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5 text-[#047857]" />
                    )}
                    {COPYRIGHT_LABEL[tr.copyright.status] ?? tr.copyright.license}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Versificação: <strong>{tr.versification.system}</strong>{' '}
                    ({tr.versification.validated ? 'validada' : 'não validada automaticamente'})
                  </span>
                </div>

                {tr.warnings.length > 0 && (
                  <div className="bg-[#f59e0b]/15 border border-[#b45309]/35 rounded px-3 py-2 text-[11px] text-[#78350f] space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Avisos de integridade / versificação ({tr.warnings.length})
                    </div>
                    {tr.warnings.slice(0, 3).map((w, wi) => (
                      <div key={wi}>{w}</div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t qumran-divider">
                  <button
                    type="button"
                    onClick={() => onSetPreferredTranslation(tr.id)}
                    disabled={isPreferred}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                      isPreferred
                        ? 'bg-[#047857]/15 text-[#047857] border border-[#047857]/40 cursor-default'
                        : 'bg-[#0e4d64] text-[#fefaf0] hover:bg-[#0b3948]'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isPreferred ? 'Tradução preferencial ativa' : 'Definir como preferencial'}
                  </button>

                  <label className="inline-flex items-center gap-2 text-xs text-[#4a3d2d] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInCompare}
                      onChange={() => onToggleComparisonTranslation(tr.id)}
                      className="rounded border-[#926c3c]/50 accent-[#0e4d64]"
                    />
                    Incluir na comparação paralela
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Catálogo Multicânon Unificado */}
      <section className="qumran-glass gem-border rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#1f1912]">
              Catálogo Multicânon de Livros ({installedBooksCount} de {catalogBooks.length} com tradução local)
            </h3>
            <p className="text-xs text-[#5c4d3c]">
              Livros fora do Tanakh (Deuterocanônicos e Novo Testamento) funcionam para leitura e comparação de traduções sem fabricar texto hebraico inexistente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              value={searchBook}
              onChange={(e) => setSearchBook(e.target.value)}
              placeholder="Filtrar livro..."
              className="px-3 py-1.5 text-xs border rounded w-44"
            />
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value as CanonGroup | 'all')}
              className="px-3 py-1.5 text-xs border rounded"
            >
              {Object.entries(CANON_GROUP_LABELS).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 text-[#4a3d2d] cursor-pointer">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
                className="accent-[#0e4d64]"
              />
              Somente disponíveis localmente
            </label>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[500px] overflow-y-auto qumran-glass-inset rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-[#e8d6b3]/95 backdrop-blur-sm border-b qumran-divider text-[#4a3d2d]">
              <tr>
                <th className="py-2 px-3 font-semibold">#</th>
                <th className="py-2 px-3 font-semibold">Livro</th>
                <th className="py-2 px-3 font-semibold">Cânon</th>
                <th className="py-2 px-3 font-semibold">Original Hebraico</th>
                <th className="py-2 px-3 font-semibold">Traduções Instaladas</th>
                <th className="py-2 px-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y qumran-divider">
              {filteredBooks.map((bk) => {
                const hasTr = bk.availableTranslations.length > 0;
                return (
                  <tr key={bk.bookId} className="hover:bg-[#fefaf0]/35">
                    <td className="py-2 px-3 font-mono tabular-nums text-[#5c4d3c]">
                      {bk.canonOrder}
                    </td>
                    <td className="py-2 px-3 font-semibold text-[#1f1912]">
                      {bk.ptTitle}
                      {bk.heTitle && (
                        <span className="font-hebrew text-sm text-[#0b3948] ml-2" dir="rtl" lang="he">
                          {bk.heTitle}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-[#4a3d2d]">
                      {CANON_GROUP_LABELS[bk.canonGroup]}
                    </td>
                    <td className="py-2 px-3">
                      {bk.hasMasoreticOriginal ? (
                        <span className="text-[#047857] font-medium">Massorético indexado</span>
                      ) : (
                        <span className="text-[#6d5b45]">Somente traduções (sem corpus massorético)</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {hasTr ? (
                        <span className="font-mono text-[#0b3948]">
                          {bk.availableTranslations.map((t) => t.sigla).join(' · ')}
                        </span>
                      ) : (
                        <span className="text-[#6d5b45]">Nenhuma instalada</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap space-x-2">
                      {(bk.hasMasoreticOriginal || hasTr) && (
                        <button
                          type="button"
                          onClick={() => onInspectChapter(bk.bookId, 1)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#0e4d64] hover:text-[#9a5410] hover:underline cursor-pointer"
                        >
                          <BookOpen className="w-3 h-3" />
                          Ler
                        </button>
                      )}
                      {hasTr && (
                        <button
                          type="button"
                          onClick={() => onCompareBookTranslations(bk.bookId, 1)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#9a5410] hover:text-[#78350f] hover:underline cursor-pointer"
                        >
                          <GitCompare className="w-3 h-3" />
                          Comparar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
