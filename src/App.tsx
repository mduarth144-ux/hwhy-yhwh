import React, { useEffect, useState } from 'react';
import {
  AudioWaveform,
  BookOpen,
  CheckSquare,
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
import { ExplorerView } from './components/ExplorerView';
import { InversionsPhoneticView } from './components/InversionsPhoneticView';
import { LabsIdentityGraphView } from './components/LabsIdentityGraphView';
import { NotebookValidationView } from './components/NotebookValidationView';
import { RepetitionsPhrasesView } from './components/RepetitionsPhrasesView';
import type { ManifestPayload, ModuleId, NotebookEntryItem } from './types';

const MODULE_ITEMS: Array<{
  id: ModuleId;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
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
  const [activeModule, setActiveModule] = useState<ModuleId>('busca_continua');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [manifestData, setManifestData] = useState<ManifestPayload | null>(null);
  const [explorerTarget, setExplorerTarget] = useState<{ slug: string; chapter: number }>({
    slug: 'genesis',
    chapter: 1,
  });

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
    <div className="flex flex-col h-full justify-between p-3 lg:p-4 gap-5">
      <div className="space-y-4">
        <div className="px-2 pt-1 pb-3 border-b border-slate-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => handleSelectModule('busca_continua')}
            className="text-sm lg:text-base font-bold tracking-tight text-slate-900 whitespace-nowrap truncate cursor-pointer text-left"
          >
            YA-WE | Pattern Engine
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
                className={`w-full text-left px-2.5 lg:px-3 py-2 min-h-[40px] lg:min-h-[44px] rounded-md transition-colors flex items-center lg:items-start gap-2.5 cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 lg:mt-0.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">{item.label}</div>
                  <div
                    className={`text-[11px] truncate ${
                      compactLandscape ? 'hidden lg:block' : 'block'
                    } ${isActive ? 'text-slate-300' : 'text-slate-500'}`}
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
          className={`pt-4 border-t border-slate-200 space-y-2 text-xs text-slate-600 ${
            compactLandscape ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="font-semibold text-slate-800">Corpus Canônico Local</div>
          <div className="space-y-1 font-mono tabular-nums text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Livros</span>
              <span className="text-slate-900">{manifestData.manifest.canonical_books_count} (24 trad.)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Capítulos</span>
              <span className="text-slate-900">{totals.chapters.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Versículos</span>
              <span className="text-slate-900">{totals.verses.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Palavras</span>
              <span className="text-slate-900">{totals.words.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Letras</span>
              <span className="text-slate-900">{totals.letters.toLocaleString()}</span>
            </div>
          </div>
          <div className="pt-2 text-[11px] text-slate-500 leading-relaxed">
            Edição: {manifestData.manifest.primary_edition} · Curadoria: {manifestData.manifest.curadoria}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 overflow-x-clip">
      {/* Sidebar fixa em Desktop (~20%) e Mobile Landscape (~20%) */}
      <aside
        aria-label="Barra lateral de ferramentas"
        className="hidden min-[540px]:max-lg:landscape:flex lg:flex flex-col shrink-0 min-[540px]:max-lg:landscape:w-[21%] min-[540px]:max-lg:landscape:min-w-[176px] min-[540px]:max-lg:landscape:max-w-[235px] lg:w-[20%] lg:min-w-[244px] lg:max-w-[280px] sticky top-0 h-screen overflow-y-auto border-r border-slate-200 bg-white z-20"
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
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-[288px] max-w-[85vw] h-full bg-white border-r border-slate-200 shadow-xl overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-500">Ferramentas</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Fechar menu"
                className="min-h-[44px] min-w-[44px] -mr-2 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
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
        {/* Cabeçalho compacto contextual (hambúrguer em portrait; breadcrumb em landscape/desktop) */}
        <header className="bg-white border-b border-slate-200 px-4 lg:px-8 h-13 flex items-center justify-between gap-4 sticky top-0 min-[540px]:max-lg:landscape:static lg:sticky z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu de ferramentas"
              aria-expanded={mobileMenuOpen}
              className="flex min-[540px]:max-lg:landscape:hidden lg:hidden min-h-[44px] min-w-[44px] -ml-2 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 min-w-0 text-sm">
              <span className="font-bold tracking-tight text-slate-900 whitespace-nowrap min-[540px]:max-lg:landscape:hidden lg:hidden">
                YA-WE
              </span>
              <span className="text-slate-300 min-[540px]:max-lg:landscape:hidden lg:hidden" aria-hidden="true">
                /
              </span>
              <span className="hidden min-[540px]:max-lg:landscape:inline lg:inline text-slate-500 whitespace-nowrap">
                Ferramentas
              </span>
              <span className="hidden min-[540px]:max-lg:landscape:inline lg:inline text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">
                {activeMeta.label}
              </span>
            </div>
          </div>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => handleSelectModule('caderno')}
              className="px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Exportar Relatório
            </button>
          </div>
        </header>

        {/* Área de conteúdo principal */}
        <main className="flex-1 min-w-0 p-4 sm:p-5 lg:p-8 space-y-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900 tracking-tight text-balance">
                {activeMeta.label}
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">{activeMeta.subtitle}</p>
            </div>
            <div className="text-xs text-slate-500">
              Motor determinístico local · Fonte primária: fluxo consonantal contínuo UTF-8
            </div>
          </div>

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
            <CompareParallelsView books={books} onInspectChapter={handleInspectChapter} />
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
