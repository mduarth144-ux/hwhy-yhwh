import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENGINE_VERSIONS,
  analyzeIdentityDeclarations,
  analyzeInversionsAndPermutations,
  buildDashboardSummary,
  compareChapters,
  discoverRecurringPhrasesSuffixArray,
  experimentalPhoneticSearch,
  findConsecutiveRepetitions,
  findIdenticalVerses,
  runLaboratories,
  runValidationSuite,
  searchContinuousStream,
  searchELS,
} from './engine/algorithms.ts';
import { TanakhCorpus } from './engine/corpus.ts';
import { MetadataStore } from './engine/db.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, 'data');
const DIST_DIR = path.resolve(__dirname, 'dist');
const PORT = Number(process.env.PORT || 3000);

function stripHtmlTags(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&thinsp;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function csvEscape(val: unknown): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const corpus = new TanakhCorpus(DATA_DIR);
  const store = new MetadataStore(DATA_DIR);
  let cachedDashboard: ReturnType<typeof buildDashboardSummary> | null = null;

  // Health & Manifest
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      books: corpus.books.length,
      letters: corpus.manifest.totals.letters,
    });
  });

  app.get('/api/corpus/manifest', (_req, res) => {
    res.json({
      manifest: corpus.manifest,
      algorithmVersions: ENGINE_VERSIONS,
    });
  });

  app.get('/api/dashboard', (_req, res) => {
    if (!cachedDashboard) {
      cachedDashboard = buildDashboardSummary(corpus);
    }
    res.json(cachedDashboard);
  });

  // Explorer: Book chapter with all textual layers
  app.get('/api/corpus/book/:slug/chapter/:chapter', (req, res) => {
    const slug = String(req.params.slug || '');
    const chapterNum = Number(req.params.chapter);
    const book = corpus.bookBySlug.get(slug);
    if (!book || !Number.isInteger(chapterNum) || chapterNum < 1 || chapterNum > book.chapters) {
      res.status(404).json({ error: 'Livro ou capítulo não encontrado no corpus canônico.' });
      return;
    }

    const chapterVerses = book.verses.filter((v) => v.c === chapterNum);
    const kqMap = new Map(
      book.masoreticDiffs
        .filter((d) => d.chapter === chapterNum)
        .map((d) => [d.verse, d.items]),
    );
    const lacunaSet = new Set(
      book.authorizedLacunae.filter((l) => l.chapter === chapterNum).map((l) => l.verse),
    );

    const verses = chapterVerses.map((v) => ({
      chapter: v.c,
      verse: v.v,
      startOffset: v.s,
      endOffset: v.e,
      originalPlain: stripHtmlTags(v.orig),
      vocalized: v.voc,
      consonantalSpaced: v.cons,
      streamSlice: book.stream.slice(v.s, v.e),
      translationPt: v.pt,
      ketivQere: kqMap.get(v.v) ?? [],
      isAuthorizedLacuna: lacunaSet.has(v.v),
    }));

    const chapterStreamStart = chapterVerses[0]?.s ?? 0;
    const chapterStreamEnd = chapterVerses[chapterVerses.length - 1]?.e ?? chapterStreamStart;

    res.json({
      book: {
        title: book.title,
        slug: book.slug,
        ptTitle: book.ptTitle,
        heTitle: book.heTitle,
        division: book.division,
        chapters: book.chapters,
        edition: book.edition,
        license: book.license,
        ptVersionTitle: book.ptVersionTitle,
        streamSha256: book.streamSha256,
      },
      chapter: chapterNum,
      chapterStream: book.stream.slice(chapterStreamStart, chapterStreamEnd),
      chapterStreamStart,
      chapterStreamEnd,
      verses,
    });
  });

  // Continuous Stream Search
  app.post('/api/search/continuous', (req, res) => {
    const body = req.body ?? {};
    const query = typeof body.query === 'string' ? body.query : '';
    const result = searchContinuousStream(corpus, {
      query,
      division: typeof body.division === 'string' ? body.division : 'all',
      bookSlug: typeof body.bookSlug === 'string' ? body.bookSlug : 'all',
      chapter: Number.isInteger(body.chapter) ? body.chapter : undefined,
      normalizeFinals: Boolean(body.normalizeFinals),
      boundaryFilter: body.boundaryFilter ?? 'all',
      crossBooks: Boolean(body.crossBooks),
      page: Number(body.page) || 1,
      pageSize: Number(body.pageSize) || 50,
    });

    if (result.queries.length > 0 && (Number(body.page) || 1) === 1) {
      store.logSearch({
        module: 'busca_continua',
        query_summary: result.queries.join(', '),
        parameters_json: JSON.stringify({
          division: body.division ?? 'all',
          bookSlug: body.bookSlug ?? 'all',
          normalizeFinals: Boolean(body.normalizeFinals),
          boundaryFilter: body.boundaryFilter ?? 'all',
          crossBooks: Boolean(body.crossBooks),
        }),
        total_hits: result.totalCount,
        algorithm_version: result.algorithmVersion,
      });
    }

    res.json(result);
  });

  // Optional ELS Search
  app.post('/api/search/els', (req, res) => {
    const body = req.body ?? {};
    const result = searchELS(corpus, {
      query: typeof body.query === 'string' ? body.query : '',
      bookSlug: typeof body.bookSlug === 'string' ? body.bookSlug : 'genesis',
      minSkip: Number(body.minSkip) || 2,
      maxSkip: Number(body.maxSkip) || 60,
      includeNegative: Boolean(body.includeNegative),
      normalizeFinals: Boolean(body.normalizeFinals),
      limit: Number(body.limit) || 100,
    });
    res.json(result);
  });

  // Consecutive Repetitions
  app.post('/api/search/repetitions', (req, res) => {
    const body = req.body ?? {};
    const result = findConsecutiveRepetitions(corpus, {
      mode: body.mode ?? 'words',
      division: typeof body.division === 'string' ? body.division : 'all',
      bookSlug: typeof body.bookSlug === 'string' ? body.bookSlug : 'all',
      minRepeats: Number(body.minRepeats) || 2,
      maxUnitWords: Number(body.maxUnitWords) || 3,
      minStreamUnitLen: Number(body.minStreamUnitLen) || 3,
      maxStreamUnitLen: Number(body.maxStreamUnitLen) || 10,
      page: Number(body.page) || 1,
      pageSize: Number(body.pageSize) || 60,
    });
    res.json(result);
  });

  // Suffix Array Automatic Recurring Phrase Discovery
  app.post('/api/search/phrases', (req, res) => {
    const body = req.body ?? {};
    const result = discoverRecurringPhrasesSuffixArray(corpus, {
      bookSlug: typeof body.bookSlug === 'string' ? body.bookSlug : 'genesis',
      division: typeof body.division === 'string' ? body.division : 'all',
      minLength: Number(body.minLength) || 9,
      maxLength: Number(body.maxLength) || 32,
      minFrequency: Number(body.minFrequency) || 5,
      limit: Number(body.limit) || 60,
    });
    res.json(result);
  });

  // Identical Verses (SHA-256)
  app.get('/api/compare/identical', (req, res) => {
    const minLetters = Math.max(4, Math.min(100, Number(req.query.minLetters) || 12));
    const limit = Math.max(10, Math.min(200, Number(req.query.limit) || 100));
    res.json(findIdenticalVerses(corpus, minLetters, limit));
  });

  // Chapter-to-Chapter Letter-by-Letter Comparison
  app.post('/api/compare/chapters', (req, res) => {
    const body = req.body ?? {};
    try {
      const result = compareChapters(
        corpus,
        {
          slug: String(body.leftSlug || 'psalms'),
          chapter: Math.max(1, Number(body.leftChapter) || 18),
        },
        {
          slug: String(body.rightSlug || 'ii_samuel'),
          chapter: Math.max(1, Number(body.rightChapter) || 22),
        },
      );
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Parâmetros inválidos' });
    }
  });

  // Inversions & Permutations
  app.post('/api/search/inversions', (req, res) => {
    const body = req.body ?? {};
    const result = analyzeInversionsAndPermutations(corpus, {
      term: typeof body.term === 'string' ? body.term : '',
      normalizeFinals: Boolean(body.normalizeFinals),
      includePermutations: body.includePermutations !== false,
      includeStreamSubstrings: Boolean(body.includeStreamSubstrings),
    });
    res.json(result);
  });

  // Experimental Phonetic Search
  app.post('/api/search/phonetic', (req, res) => {
    const body = req.body ?? {};
    const rules = Array.isArray(body.activeRuleIds) ? body.activeRuleIds.map(String) : [];
    const result = experimentalPhoneticSearch(corpus, {
      term: typeof body.term === 'string' ? body.term : '',
      activeRuleIds: rules,
      maxCost: Number(body.maxCost) || 1.2,
      limit: Number(body.limit) || 50,
    });
    res.json(result);
  });

  // Identity Declarations
  app.get('/api/labs/identity', (_req, res) => {
    res.json(analyzeIdentityDeclarations(corpus));
  });

  // Independent Laboratories & Graph
  app.post('/api/labs/run', (req, res) => {
    const body = req.body ?? {};
    const selectedLabIds = Array.isArray(body.selectedLabIds) ? body.selectedLabIds.map(String) : ['misterio'];
    const result = runLaboratories(corpus, {
      selectedLabIds,
      enableCrossings: Boolean(body.enableCrossings),
      division: typeof body.division === 'string' ? body.division : 'all',
      bookSlug: typeof body.bookSlug === 'string' ? body.bookSlug : 'all',
    });
    res.json(result);
  });

  // Validation & Acceptance Suite
  app.get('/api/validation', (_req, res) => {
    res.json(runValidationSuite(corpus));
  });

  // Notebook & Search History (SQLite)
  app.get('/api/notebook', (_req, res) => {
    res.json({
      entries: store.listNotebookEntries(),
      history: store.listSearchHistory(30),
    });
  });

  app.post('/api/notebook', (req, res) => {
    const body = req.body ?? {};
    const title = String(body.title || '').trim();
    const reference = String(body.reference || '').trim();
    const hypothesis = String(body.hypothesis || '').trim();
    if (!title || !hypothesis) {
      res.status(400).json({ error: 'Título e anotação/hipótese são obrigatórios.' });
      return;
    }
    const entry = store.addNotebookEntry({
      title,
      reference: reference || 'Corpus Tanakh',
      hebrew_snippet: typeof body.hebrew_snippet === 'string' ? body.hebrew_snippet : '',
      evidence_tier: typeof body.evidence_tier === 'string' ? body.evidence_tier : 'evidencia_textual',
      hypothesis,
      parameters_json: typeof body.parameters_json === 'string' ? body.parameters_json : JSON.stringify(body.parameters ?? {}),
      algorithm_version: typeof body.algorithm_version === 'string' ? body.algorithm_version : 'yawe-2.0.0',
    });
    res.status(201).json({ entry });
  });

  app.delete('/api/notebook/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }
    const deleted = store.deleteNotebookEntry(id);
    res.json({ deleted });
  });

  // Reproducible Export (Markdown, JSON, CSV, TXT — NotebookLM compatible)
  app.post('/api/export', (req, res) => {
    const body = req.body ?? {};
    const format = String(body.format || 'md').toLowerCase();
    const reportTitle = String(body.title || 'Relatório YA-WE | Pattern Engine').trim();
    const parameters = body.parameters ?? {};
    const hypotheses = String(body.hypotheses || '').trim();
    const items = Array.isArray(body.items) ? body.items : [];
    const notebookEntries = body.includeNotebook ? store.listNotebookEntries() : [];

    const metaBlock = {
      engine: corpus.manifest.engine_name,
      blueprintVersion: corpus.manifest.blueprint_version,
      curadoria: corpus.manifest.curadoria,
      exportedAtUtc: new Date().toISOString(),
      sourceRepository: corpus.manifest.source_repository,
      indexCommitSha: corpus.manifest.index_commit_sha,
      primaryEdition: corpus.manifest.primary_edition,
      booksJsonSha256: corpus.manifest.books_json_sha256,
      algorithmVersions: ENGINE_VERSIONS,
      parameters,
    };

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="yawe_relatorio.json"');
      res.send(JSON.stringify({ meta: metaBlock, hypotheses, items, notebookEntries }, null, 2));
      return;
    }

    if (format === 'csv') {
      const headers = [
        'referencia',
        'livro',
        'capitulo',
        'versiculo',
        'offset_inicio',
        'offset_fim',
        'fronteira',
        'camada_evidencia',
        'stream_correspondente',
        'palavras_originais',
        'versiculo_vocalizado',
        'traducao_pt_br',
        'edicao',
        'idioma',
        'parametros',
      ];
      const rows = [headers.join(',')];
      for (const it of items) {
        rows.push(
          [
            csvEscape(it.reference),
            csvEscape(it.ptBook ?? it.book),
            csvEscape(it.chapter),
            csvEscape(it.verse),
            csvEscape(it.startOffset),
            csvEscape(it.endOffset),
            csvEscape(it.boundaryType),
            csvEscape(it.evidenceTier),
            csvEscape(it.matchedStream),
            csvEscape(it.matchedWordsOriginal),
            csvEscape(it.verseVocalized),
            csvEscape(it.translationPt),
            csvEscape(it.edition),
            csvEscape(it.language),
            csvEscape(it.parametersSummary),
          ].join(','),
        );
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="yawe_relatorio.csv"');
      res.send('\uFEFF' + rows.join('\n'));
      return;
    }

    if (format === 'txt') {
      const lines = [
        `=== ${reportTitle} ===`,
        `Motor: ${metaBlock.engine} (Blueprint v${metaBlock.blueprintVersion})`,
        `Curadoria: ${metaBlock.curadoria}`,
        `Exportado em: ${metaBlock.exportedAtUtc}`,
        `Fonte: ${metaBlock.sourceRepository} | Commit: ${metaBlock.indexCommitSha}`,
        `Edição canônica: ${metaBlock.primaryEdition}`,
        `Parâmetros: ${JSON.stringify(parameters)}`,
        '',
        hypotheses ? `HIPÓTESES DO PESQUISADOR (SEPARADAS DA EVIDÊNCIA TEXTUAL):\n${hypotheses}\n` : '',
        `OCORRÊNCIAS E EVIDÊNCIAS (${items.length}):`,
      ];
      for (const it of items) {
        lines.push(
          `- [${it.reference}] (${it.boundaryType ?? ''} | ${it.evidenceTier ?? ''}) offsets ${it.startOffset}..${it.endOffset}`,
          `  Stream: ${it.matchedStream ?? ''} | Original: ${it.verseVocalized ?? ''}`,
          it.translationPt ? `  PT-BR (${it.translationPtSource ?? 'ACF'}): ${it.translationPt}` : '',
        );
      }
      if (notebookEntries.length > 0) {
        lines.push('', `CADERNO DE INVESTIGAÇÃO (${notebookEntries.length} registros):`);
        for (const n of notebookEntries) {
          lines.push(`* ${n.title} [${n.reference}] (${n.evidence_tier}): ${n.hypothesis}`);
        }
      }
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="yawe_relatorio.txt"');
      res.send(lines.filter((l) => l !== '').join('\n'));
      return;
    }

    // Default: Markdown (NotebookLM-compatible structured source)
    const md: string[] = [
      `# ${reportTitle}`,
      '',
      `> **Motor:** ${metaBlock.engine} (Blueprint ${metaBlock.blueprintVersion})  `,
      `> **Curadoria:** ${metaBlock.curadoria}  `,
      `> **Fonte Canônica:** ${metaBlock.primaryEdition} (${metaBlock.sourceRepository}, commit \`${metaBlock.indexCommitSha.slice(0, 12)}\`)  `,
      `> **Exportação UTC:** ${metaBlock.exportedAtUtc}`,
      '',
      '## Parâmetros e Versões de Algoritmos',
      '```json',
      JSON.stringify({ parameters, algorithms: ENGINE_VERSIONS.map((v) => `${v.algorithm}@${v.version}`) }, null, 2),
      '```',
      '',
    ];

    if (hypotheses) {
      md.push('## Hipóteses Interpretativas (Separadas da Evidência Textual)', '', hypotheses, '');
    }

    md.push(`## Evidências Textuais (${items.length} registros)`, '');
    for (const it of items) {
      md.push(
        `### ${it.reference}`,
        `- **Camada:** ${it.evidenceTier ?? 'evidencia_textual'} · **Fronteira:** ${it.boundaryType ?? '—'} · **Offsets:** \`${it.startOffset}..${it.endOffset}\` · **Idioma:** ${it.language ?? 'Hebraico Bíblico'}`,
        `- **Trecho no stream:** \`${it.matchedStream ?? ''}\``,
        `- **Versículo vocalizado (sem cantilação):** ${it.verseVocalized ?? ''}`,
      );
      if (it.translationPt) {
        md.push(`- **Tradução PT-BR (${it.translationPtSource ?? 'ACF'}):** ${it.translationPt}`);
      }
      md.push('');
    }

    if (notebookEntries.length > 0) {
      md.push(`## Caderno de Pesquisa (${notebookEntries.length} entradas)`, '');
      for (const n of notebookEntries) {
        md.push(`- **${n.title}** (${n.reference} · \`${n.evidence_tier}\`): ${n.hypothesis}`);
      }
    }

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="yawe_relatorio.md"');
    res.send(md.join('\n'));
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`YA-WE | Pattern Engine ativo em http://0.0.0.0:${PORT} (${corpus.books.length} livros, ${corpus.manifest.totals.letters.toLocaleString()} letras)`);
  });
}

startServer().catch((err) => {
  console.error('Falha ao iniciar YA-WE | Pattern Engine:', err);
  process.exit(1);
});
