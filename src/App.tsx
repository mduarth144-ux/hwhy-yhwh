import React, { useEffect, useState } from 'react';
import {
  AudioWaveform,
  BookOpen,
  CheckSquare,
  Compass,
  FlaskConical,
  GitCompare,
  Menu,
  NotebookPen,
  Repeat,
  Search,
  Shuffle,
  X,
} from 'lucide-react';
import { CompareParallelsView } from './components/CompareParallelsView';
import { ContinuousSearchView } from './components/ContinuousSearchView';
import { DashboardView } from './components/DashboardView';
import { ExplorerView } from './components/ExplorerView';
import { InversionsPhoneticView } from './components/InversionsPhoneticView';
import { LabsIdentityGraphView } from './components/LabsIdentityGraphView';
import { NotebookValidationView } from './components/NotebookValidationView';
import { RepetitionsPhrasesView } from './components/RepetitionsPhrasesView';
import type {
  ChapterComparePreset,
  DashboardPayload,
  ManifestPayload,
  ModuleId,
  NotebookEntryItem,
  SearchPresetPayload,
} from './types';

const MODULE_ITEMS: Array<{
  id: ModuleId;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard & Descobertas', subtitle: 'Estatísticas e achados do Tanakh', icon: Compass },
  { id: 'explorador', label: 'Explorador', subtitle: '4 camadas e contexto integral', icon: BookOpen },
  { id: 'busca_continua', label: 'Busca Contínua & ELS', subtitle: 'Stream, ressegmentação, Aho-Corasick', icon: Search },
  { id: 'repeticoes', label: 'Repetições & Frases', subtitle: 'Adjacentes e Suffix Array (LCP)', icon: Repeat },
  { id: 'comparacao', label: 'Comparação & Paralelos', subtitle: 'SHA-256 e diff letra a letra', icon: GitCompare },
  { id: 'inversoes', label: 'Inversões & Permutações', subtitle: 'Ordem lógica e léxico Tanakh', icon: Shuffle },
  { id: 'fonetica', label: 'Fonética Experimental', subtitle: 'Regras e custo explícito', icon: AudioWaveform },
  { id: 'laboratorios', label: 'Identidade & Laboratórios', subtitle: '5 eixos, cruzamentos e grafo', icon: FlaskConical },
  { id: 'caderno', label: 'Caderno & Relatórios', subtitle: 'SQLite e exportação NotebookLM', icon: NotebookPen },
  { id: 'validacao', label: 'Validação & Manifesto', subtitle: 'Seções 13–14 e SHA-256', icon: CheckSquare },
];

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [manifestData, setManifestData] = useState<ManifestPayload | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [explorerTarget, setExplorerTarget] = useState<{ slug: string; chapter: number }>({
    slug: 'genesis',
    chapter: 1,
  });
  const [searchPreset, setSearchPreset] = useState<SearchPresetPayload | null>(null);
  const [comparePreset, setComparePreset] = useState<ChapterComparePreset | null>(null);

  const [notebookEntries, setNotebookEntries] = useState<NotebookEntryItem[]>([]);
  const [searchHistory, setSearchHistory] = useState<Array<{
    id: number;
    module: string;
    query_summary: string;
    parameters_json: string;
    total_hits: number;
    algorithm_version: string;
    created_at: string;
  }>>([]);
  const [draftNote, setDraftNote] = useState<{
    title: string;
    reference: string;
    hebrew_snippet: string;
    evidence_tier: string;
    parameters_json: string;
  } | null>(null);

  const loadNotebook = () => {
    fetch('/api/notebook')
      .then((r) => r.json())
      .then((json) => {
        setNotebookEntries(json.entries ?? []);
        setSearchHistory(json.history ?? []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch('/api/corpus/manifest')
      .then((r) => r.json())
      .then((json: ManifestPayload) => setManifestData(json))
      .catch(() => {});

    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((json: DashboardPayload) => setDashboardData(json))
      .catch(() => {})
      .finally(() => setDashboardLoading(false));

    loadNotebook();
  }, []);

  // Fecha o drawer automaticamente ao girar para landscape ou ampliar para desktop, ou ao pressionar Escape
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px), (orientation: landscape) and (min-width: 540px)');
    const handleViewportChange = () => {
      if (mq.matches) {
        setMobileMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    mq.addEventListener('change', handleViewportChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      mq.removeEventListener('change', handleViewportChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSelectModule = (id: ModuleId) => {
    setActiveModule(id);
    setMobileMenuOpen(false);
  };

  const handleInspectChapter = (slug: string, chapter: number) => {
    setExplorerTarget({ slug, chapter });
    setActiveModule('explorador');
    setMobileMenuOpen(false);
  };

  const handleNavigateSearch = (preset: Omit<SearchPresetPayload, 'nonce'>) => {
    setSearchPreset({ ...preset, nonce: Date.now() });
    setActiveModule('busca_continua');
    setMobileMenuOpen(false);
  };

  const handleCompareChapters = (preset: Omit<ChapterComparePreset, 'nonce'>) => {
    setComparePreset({ ...preset, nonce: Date.now() });
    setActiveModule('comparacao');
    setMobileMenuOpen(false);
  };

  const handleSaveToNotebook = (item: {
    title: string;
    reference: string;
    hebrew_snippet: string;
    evidence_tier: string;
    parameters_json: string;
  }) => {
    setDraftNote(item);
    setActiveModule('caderno');
    setMobileMenuOpen(false);
  };

  const books = manifestData?.manifest.books ?? [];
  const totals = manifestData?.manifest.totals;
  const activeMeta = MODULE_ITEMS.find((m) => m.id === activeModule)!;

  const renderSidebarContent = (compactLandscape: boolean) => (
    <div className="flex flex-col h-full justify-between p-3 lg:p-4 gap-5 text-[#f7efe1]">
      <div className="space-y-4">
        <div className="px-2 pt-1 pb-3 border-b border-[#d99f45]/25 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => handleSelectModule('dashboard')}
            className="text-left cursor-pointer group min-w-0"
          >
            <div className="text-sm lg:text-base font-bold tracking-tight gem-hebrew-amber whitespace-nowrap truncate">
              YA-WE | Pattern Engine
            </div>
            <div className={`text-[10px] tracking-wide text-[#cbbba0] ${compactLandscape ? 'hidden lg:block' : 'block'}`}>
              Manuscritos & Padrões · Tanakh
            </div>
          </button>
        </div>

        <nav aria-label="Ferramentas principais" className="space-y-1">
          {MODULE_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectModule(item.id)}
                className={`w-full text-left px-2.5 lg:px-3 py-2 min-h-[40px] lg:min-h-[44px] rounded-md transition-all flex items-center lg:items-start gap-2.5 cursor-pointer border ${
                  isActive
                    ? 'bg-gradient-to-r from-[#b45309]/90 via-[#d97706]/80 to-[#0e4d64]/80 text-[#fefaf0] border-[#fbbf24]/55 shadow-[0_6px_18px_-8px_rgba(245,158,11,0.55),inset_0_1px_0_rgba(254,243,199,0.4)]'
                    : 'border-transparent text-[#e6dac4] hover:bg-[#fef3c7]/10 hover:border-[#d99f45]/30 hover:text-[#fefaf0]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 lg:mt-0.5 ${
                    isActive ? 'text-[#fef3c7]' : 'text-[#d99f45]'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">{item.label}</div>
                  <div
                    className={`text-[11px] truncate ${
                      compactLandscape ? 'hidden lg:block' : 'block'
                    } ${isActive ? 'text-[#fef3c7]/85' : 'text-[#b7c8cd]'}`}
                  >
                    {item.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {manifestData && totals && (
        <div
          className={`pt-4 border-t border-[#d99f45]/25 space-y-2 text-xs text-[#cbbba0] ${
            compactLandscape ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="font-semibold text-[#fbbf24]">Corpus Canônico Local</div>
          <div className="space-y-1 font-mono tabular-nums text-[11px]">
            <div className="flex justify-between">
              <span className="text-[#b7c8cd]">Livros</span>
              <span className="text-[#fefaf0]">{manifestData.manifest.canonical_books_count} (24 trad.)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#b7c8cd]">Capítulos</span>
              <span className="text-[#fefaf0]">{totals.chapters.toLocaleString('pt-BR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#b7c8cd]">Versículos</span>
              <span className="text-[#fefaf0]">{totals.verses.toLocaleString('pt-BR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#b7c8cd]">Palavras</span>
              <span className="text-[#fefaf0]">{totals.words.toLocaleString('pt-BR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#b7c8cd]">Letras</span>
              <span className="text-[#fefaf0]">{totals.letters.toLocaleString('pt-BR')}</span>
            </div>
          </div>
          <div className="pt-2 text-[11px] text-[#b7c8cd] leading-relaxed">
            Edição: {manifestData.manifest.primary_edition} · Curadoria: {manifestData.manifest.curadoria}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex text-[#1f1912] overflow-x-clip">
      {/* Sidebar fixa em Desktop (~20%) e Mobile Landscape (~20%) */}
      <aside
        aria-label="Barra lateral de ferramentas"
        className="hidden min-[540px]:max-lg:landscape:flex lg:flex flex-col shrink-0 min-[540px]:max-lg:landscape:w-[21%] min-[540px]:max-lg:landscape:min-w-[176px] min-[540px]:max-lg:landscape:max-w-[235px] lg:w-[20%] lg:min-w-[244px] lg:max-w-[280px] sticky top-0 h-screen overflow-y-auto qumran-sidebar-glass z-20"
      >
        {renderSidebarContent(true)}
      </aside>

      {/* Drawer lateral para Mobile Portrait (menu hambúrguer) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex min-[540px]:max-lg:landscape:hidden lg:hidden no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Menu principal de ferramentas"
        >
          <div
            className="fixed inset-0 bg-[#0b2530]/60 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-[288px] max-w-[85vw] h-full qumran-sidebar-glass shadow-2xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[#d99f45]/25">
              <span className="text-xs font-semibold text-[#fbbf24]">Ferramentas</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Fechar menu"
                className="min-h-[44px] min-w-[44px] -mr-2 inline-flex items-center justify-center rounded-md text-[#e6dac4] hover:bg-[#fef3c7]/10 hover:text-[#fefaf0] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {renderSidebarContent(false)}
            </div>
          </aside>
        </div>
      )}

      {/* Coluna principal (~80% em desktop/landscape, 100% em portrait mobile) */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Cabeçalho compacto contextual */}
        <header className="qumran-header-glass px-4 lg:px-8 h-13 flex items-center justify-between gap-4 sticky top-0 min-[540px]:max-lg:landscape:static lg:sticky z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu de ferramentas"
              aria-expanded={mobileMenuOpen}
              className="flex min-[540px]:max-lg:landscape:hidden lg:hidden min-h-[44px] min-w-[44px] -ml-2 items-center justify-center rounded-md text-[#0b3948] hover:bg-[#d99f45]/15 cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 min-w-0 text-sm">
              <span className="font-bold tracking-tight gem-title whitespace-nowrap min-[540px]:max-lg:landscape:hidden lg:hidden">
                YA-WE
              </span>
              <span className="text-[#926c3c]/55 min-[540px]:max-lg:landscape:hidden lg:hidden" aria-hidden="true">
                /
              </span>
              <span className="hidden min-[540px]:max-lg:landscape:inline lg:inline text-[#5c4d3c] whitespace-nowrap">
                Ferramentas
              </span>
              <span className="hidden min-[540px]:max-lg:landscape:inline lg:inline text-[#926c3c]/55" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-[#0b3948] truncate">
                {activeMeta.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleSelectModule('caderno')}
              className="px-3.5 py-2 text-xs font-semibold text-[#fefaf0] bg-[#0e4d64] hover:bg-[#0b3948] border border-[#d99f45]/45 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              Exportar Relatório
            </button>
          </div>
        </header>

        {/* Área de conteúdo principal */}
        <main className="flex-1 min-w-0 p-4 sm:p-5 lg:p-8 space-y-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b qumran-divider pb-4">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold tracking-tight gem-title text-balance">
                {activeMeta.label}
              </h1>
              <p className="text-sm text-[#4a3d2d] mt-0.5">{activeMeta.subtitle}</p>
            </div>
            <div className="text-xs text-[#5c4d3c]">
              Motor determinístico local · Fluxo consonantal contínuo UTF-8
            </div>
          </div>

          {activeModule === 'dashboard' && (
            <DashboardView
              data={dashboardData}
              loading={dashboardLoading}
              onNavigateSearch={handleNavigateSearch}
              onCompareChapters={handleCompareChapters}
              onInspectChapter={handleInspectChapter}
              onNavigateModule={handleSelectModule}
            />
          )}

          {activeModule === 'explorador' && (
            <ExplorerView
              books={books}
              initialSlug={explorerTarget.slug}
              initialChapter={explorerTarget.chapter}
              onSaveToNotebook={handleSaveToNotebook}
            />
          )}

          {activeModule === 'busca_continua' && (
            <ContinuousSearchView
              books={books}
              initialPreset={searchPreset}
              onSaveToNotebook={handleSaveToNotebook}
              onInspectChapter={handleInspectChapter}
            />
          )}

          {activeModule === 'repeticoes' && (
            <RepetitionsPhrasesView
              books={books}
              onSaveToNotebook={handleSaveToNotebook}
              onInspectChapter={handleInspectChapter}
            />
          )}

          {activeModule === 'comparacao' && (
            <CompareParallelsView
              books={books}
              initialPreset={comparePreset}
              onInspectChapter={handleInspectChapter}
            />
          )}

          {activeModule === 'inversoes' && (
            <InversionsPhoneticView
              mode="inversions"
              onSaveToNotebook={handleSaveToNotebook}
              onInspectChapter={handleInspectChapter}
            />
          )}

          {activeModule === 'fonetica' && (
            <InversionsPhoneticView
              mode="phonetic"
              onSaveToNotebook={handleSaveToNotebook}
              onInspectChapter={handleInspectChapter}
            />
          )}

          {activeModule === 'laboratorios' && (
            <LabsIdentityGraphView
              books={books}
              onSaveToNotebook={handleSaveToNotebook}
              onInspectChapter={handleInspectChapter}
            />
          )}

          {(activeModule === 'caderno' || activeModule === 'validacao') && (
            <NotebookValidationView
              mode={activeModule}
              manifestData={manifestData}
              notebookEntries={notebookEntries}
              searchHistory={searchHistory}
              draftNote={draftNote}
              onClearDraft={() => setDraftNote(null)}
              onRefreshNotebook={loadNotebook}
            />
          )}
        </main>
      </div>
    </div>
  );
}
