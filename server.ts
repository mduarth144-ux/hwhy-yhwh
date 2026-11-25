import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENGINE_VERSIONS,
  analyzeIdentityDeclarations,
  analyzeInversionsAndPermutations,
  analyzeMasoreticFeatures,
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
import { CANONICAL_BOOK_BY_ID } from './engine/canon.ts';
import { TanakhCorpus } from './engine/corpus.ts';
import { MetadataStore } from './engine/db.ts';
import { TranslationRegistry } from './engine/translations.ts';

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

  const translations = new TranslationRegistry(path.join(DATA_DIR, 'translations'));
  const corpus = new TanakhCorpus(DATA_DIR, translations);
  const store = new MetadataStore(DATA_DIR);
  const dashboardCache = new Map<string, ReturnType<typeof buildDashboardSummary>>();

  const getPreferredTranslationId = (explicit?: unknown): string | null => {
    if (typeof explicit === 'string' && explicit.trim()) {
      const clean = explicit.trim();
      if (translations.getTranslationSummary(clean)?.id === clean) return clean;
    }
    const stored = store.getPreference('preferred_translation_id');
    if (stored && translations.getTranslationSummary(stored)?.id === stored) {
      return stored;
    }
    return translations.getDefaultTranslationId();
  };

  const getComparisonTranslationIds = (): string[] => {
    const raw = store.getPreference('comparison_translation_ids');
    if (raw) {
      try {
        const arr = JSON.parse(raw) as unknown;
        if (Array.isArray(arr)) {
          const valid = arr.map(String).filter((id) => Boolean(translations.getTranslationSummary(id)?.id === id));
          if (valid.length > 0) return valid;
        }
      } catch {
        // ignore parse error
      }
    }
    return translations.listTranslations().slice(0, 3).map((t) => t.id);
  };

  // Health & Manifest
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      books: corpus.books.length,
      letters: corpus.manifest.totals.letters,
      translations: translations.listTranslations().length,
    });
  });

  app.get('/api/corpus/manifest', (_req, res) => {
    res.json({
      manifest: corpus.manifest,
      algorithmVersions: ENGINE_VERSIONS,
    });
  });

  // Translation Library & Preferences
  app.get('/api/translations', (_req, res) => {
    res.json({
      defaultTranslationId: translations.getDefaultTranslationId(),
      preferredTranslationId: getPreferredTranslationId(),
      comparisonTranslationIds: getComparisonTranslationIds(),
      translations: translations.listTranslations(),
      catalogBooks: translations.getUnifiedBookCatalog(),
    });
  });

  app.post('/api/translations/refresh', (_req, res) => {
    const refreshInfo = translations.refresh();
    dashboardCache.clear();
    res.json({
      refreshInfo,
      defaultTranslationId: translations.getDefaultTranslationId(),
      preferredTranslationId: getPreferredTranslationId(),
      comparisonTranslationIds: getComparisonTranslationIds(),
      translations: translations.listTranslations(),
      catalogBooks: translations.getUnifiedBookCatalog(),
    });
  });

  app.post('/api/preferences', (req, res) => {
    const body = req.body ?? {};
    if (typeof body.preferredTranslationId === 'string') {
      const target = body.preferredTranslationId.trim();
      if (!translations.listTranslations().some((t) => t.id === target)) {
        res.status(400).json({ error: 'Tradução preferencial não instalada.' });
        return;
      }
      store.setPreference('preferred_translation_id', target);
    }
    if (Array.isArray(body.comparisonTranslationIds)) {
      const validIds = body.comparisonTranslationIds
        .map(String)
        .filter((id: string) => translations.listTranslations().some((t) => t.id === id));
      store.setPreference('comparison_translation_ids', JSON.stringify(validIds));
    }
    res.json({
      preferredTranslationId: getPreferredTranslationId(),
      comparisonTranslationIds: getComparisonTranslationIds(),
    });
  });

  app.get('/api/dashboard', (req, res) => {
    const trId = getPreferredTranslationId(req.query.translationId) ?? 'acf';
    let cached = dashboardCache.get(trId);
    if (!cached) {
      cached = buildDashboardSummary(corpus, trId);
      dashboardCache.set(trId, cached);
    }
    const pins = store.listPinnedSearches().map((pin) => {
      let parsedParams: Record<string, unknown> = {};
      try {
        parsedParams = JSON.parse(pin.parameters_json) as Record<string, unknown>;
      } catch {
        parsedParams = {};
      }
      let liveCount = pin.last_total_hits;
      if (pin.module === 'busca_continua') {
        const resSearch = searchContinuousStream(corpus, {
          query: pin.query_text,
          division: typeof parsedParams.division === 'string' ? parsedParams.division : 'all',
          bookSlug: typeof parsedParams.bookSlug === 'string' ? parsedParams.bookSlug : 'all',
          boundaryFilter: (parsedParams.boundaryFilter as 'all') ?? 'all',
          normalizeFinals: Boolean(parsedParams.normalizeFinals),
          pageSize: 10,
          translationId: trId,
        });
        liveCount = resSearch.totalCount;
      }
      return {
        ...pin,
        live_total_hits: liveCount,
      };
    });
    res.json({
      ...cached,
      pinnedSearches: pins,
      recentSearches: store.listSearchHistory(10),
    });
  });

  app.get('/api/dashboard/pins', (_req, res) => {
    res.json({ pins: store.listPinnedSearches() });
  });

  app.post('/api/dashboard/pins', (req, res) => {
    const body = req.body ?? {};
    const label = String(body.label || '').trim();
    const queryText = String(body.query_text || '').trim();
    const moduleName = String(body.module || 'busca_continua').trim();
    if (!label || !queryText) {
      res.status(400).json({ error: 'Rótulo e consulta são obrigatórios para fixar no dashboard.' });
      return;
    }
    const paramsObj = body.parameters ?? {};
    const searchRes = searchContinuousStream(corpus, {
      query: queryText,
      division: typeof paramsObj.division === 'string' ? paramsObj.division : 'all',
      bookSlug: typeof paramsObj.bookSlug === 'string' ? paramsObj.bookSlug : 'all',
      boundaryFilter: paramsObj.boundaryFilter ?? 'all',
      normalizeFinals: Boolean(paramsObj.normalizeFinals),
      pageSize: 10,
    });
    const pin = store.addPinnedSearch({
      label,
      module: moduleName,
      query_text: queryText,
      parameters_json: JSON.stringify(paramsObj),
      last_total_hits: searchRes.totalCount,
    });
    res.status(201).json({ pin: { ...pin, live_total_hits: searchRes.totalCount } });
  });

  app.delete('/api/dashboard/pins/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }
    res.json({ deleted: store.deletePinnedSearch(id) });
  });

  // Explorer: Book chapter with all textual layers (Tanakh compat)
  app.get('/api/corpus/book/:slug/chapter/:chapter', (req, res) => {
    const slug = String(req.params.slug || '');
    const chapterNum = Number(req.params.chapter);
    const trId = getPreferredTranslationId(req.query.translationId);
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

    const verses = chapterVerses.map((v) => {
      const tr = corpus.resolveVerseTranslation(book.slug, v.c, v.v, trId);
      return {
        chapter: v.c,
        verse: v.v,
        startOffset: v.s,
        endOffset: v.e,
        originalPlain: stripHtmlTags(v.orig),
        vocalized: v.voc,
        consonantalSpaced: v.cons,
        streamSlice: book.stream.slice(v.s, v.e),
        translationPt: tr.text,
        translationSource: tr.source,
        translationState: tr.state,
        translationNote: tr.note,
        ketivQere: kqMap.get(v.v) ?? [],
        isAuthorizedLacuna: lacunaSet.has(v.v),
      };
    });

    const chapterStreamStart = chapterVerses[0]?.s ?? 0;
    const chapterStreamEnd = chapterVerses[chapterVerses.length - 1]?.e ?? chapterStreamStart;
    const activeTrSummary = translations.getTranslationSummary(trId);

    res.json({
      hasHebrewOriginal: true,
      book: {
        title: book.title,
        slug: book.slug,
        ptTitle: book.ptTitle,
        heTitle: book.heTitle,
        division: book.division,
        chapters: book.chapters,
        edition: book.edition,
        license: book.license,
        ptVersionTitle: activeTrSummary?.name ?? book.ptVersionTitle,
        translationId: activeTrSummary?.id ?? trId ?? 'acf',
        translationSigla: activeTrSummary?.sigla ?? 'ACF',
        streamSha256: book.streamSha256,
      },
      chapter: chapterNum,
      chapterStream: book.stream.slice(chapterStreamStart, chapterStreamEnd),
      chapterStreamStart,
      chapterStreamEnd,
      verses,
    });
  });

  // Unified Multi-Canon Reader (supports Tanakh + Deuterocanonicals + NT without inventing Hebrew)
  app.get('/api/library/book/:slug/chapter/:chapter', (req, res) => {
    const slug = String(req.params.slug || '');
    const chapterNum = Number(req.params.chapter);
    const trId = getPreferredTranslationId(req.query.translationId);
    const masoreticBook = corpus.bookBySlug.get(slug);
    const catalogMeta = CANONICAL_BOOK_BY_ID.get(slug);

    if (masoreticBook) {
      if (!Number.isInteger(chapterNum) || chapterNum < 1 || chapterNum > masoreticBook.chapters) {
        res.status(404).json({ error: 'Capítulo fora do intervalo deste livro.' });
        return;
      }
      const chapterVerses = masoreticBook.verses.filter((v) => v.c === chapterNum);
      const kqMap = new Map(
        masoreticBook.masoreticDiffs
          .filter((d) => d.chapter === chapterNum)
          .map((d) => [d.verse, d.items]),
      );
      const lacunaSet = new Set(
        masoreticBook.authorizedLacunae.filter((l) => l.chapter === chapterNum).map((l) => l.verse),
      );

      const activeTrSummary = translations.getTranslationSummary(trId);
      const trChapter = translations.getChapter(trId, slug, chapterNum);

      const verses = chapterVerses.map((v) => {
        const tr = corpus.resolveVerseTranslation(masoreticBook.slug, v.c, v.v, trId);
        return {
          chapter: v.c,
          verse: v.v,
          startOffset: v.s,
          endOffset: v.e,
          originalPlain: stripHtmlTags(v.orig),
          vocalized: v.voc,
          consonantalSpaced: v.cons,
          streamSlice: masoreticBook.stream.slice(v.s, v.e),
          translationPt: tr.text,
          translationSource: tr.source,
          translationState: tr.state,
          translationNote: tr.note,
          ketivQere: kqMap.get(v.v) ?? [],
          isAuthorizedLacuna: lacunaSet.has(v.v),
        };
      });

      const chapterStreamStart = chapterVerses[0]?.s ?? 0;
      const chapterStreamEnd = chapterVerses[chapterVerses.length - 1]?.e ?? chapterStreamStart;

      res.json({
        hasHebrewOriginal: true,
        book: {
          title: masoreticBook.title,
          slug: masoreticBook.slug,
          ptTitle: masoreticBook.ptTitle,
          heTitle: masoreticBook.heTitle,
          division: masoreticBook.division,
          canonGroup: catalogMeta?.canonGroup ?? 'writings',
          chapters: masoreticBook.chapters,
          edition: masoreticBook.edition,
          license: masoreticBook.license,
          ptVersionTitle: activeTrSummary?.name ?? masoreticBook.ptVersionTitle,
          translationId: activeTrSummary?.id ?? trId ?? 'acf',
          translationSigla: activeTrSummary?.sigla ?? 'ACF',
          translationLanguage: activeTrSummary?.language ?? 'pt-BR',
          versification: trChapter?.book.versification ?? null,
          versificationMap: trChapter?.book.versificationMap ?? [],
          streamSha256: masoreticBook.streamSha256,
        },
        chapter: chapterNum,
        chapterStream: masoreticBook.stream.slice(chapterStreamStart, chapterStreamEnd),
        chapterStreamStart,
        chapterStreamEnd,
        verses,
      });
      return;
    }

    // Livro adicional (NT, Deuterocanonico, etc.) via TranslationRegistry sem original massoretico
    const trChapter = translations.getChapter(trId, slug, chapterNum);
    if (!trChapter) {
      res.status(404).json({ error: 'Livro ou capítulo não disponível nas traduções instaladas.' });
      return;
    }

    res.json({
      hasHebrewOriginal: false,
      notice:
        'Livro disponível via tradução instalada — não possui original massorético hebraico indexado no corpus consonantal.',
      book: {
        title: trChapter.book.title,
        slug: trChapter.book.bookId,
        ptTitle: catalogMeta?.ptTitle ?? trChapter.book.title,
        heTitle: null,
        division: null,
        canonGroup: trChapter.book.canonGroup,
        chapters: trChapter.book.chapters,
        edition: trChapter.translation.edition,
        license: trChapter.translation.copyright.license,
        ptVersionTitle: trChapter.translation.name,
        translationId: trChapter.translation.id,
        translationSigla: trChapter.translation.sigla,
        translationLanguage: trChapter.translation.language,
        versification: trChapter.book.versification,
        versificationMap: trChapter.book.versificationMap,
        streamSha256: null,
      },
      chapter: chapterNum,
      chapterStream: null,
      chapterStreamStart: null,
      chapterStreamEnd: null,
      verses: trChapter.verses.map((v) => ({
        chapter: v.chapter,
        verse: v.verse,
        startOffset: null,
        endOffset: null,
        originalPlain: null,
        vocalized: null,
        consonantalSpaced: null,
        streamSlice: null,
        translationPt: v.text ?? '',
        translationSource: trChapter.translation.name,
        translationState: v.state?.status ?? null,
        translationNote: v.state?.note ?? null,
        ketivQere: [],
        isAuthorizedLacuna: v.state?.status === 'lacuna' || v.state?.status === 'omitted',
      })),
    });
  });

  // Multi-translation Comparator (§10)
  app.post('/api/compare/translations', (req, res) => {
    const body = req.body ?? {};
    const bookId = String(body.bookId || 'genesis');
    const chapter = Math.max(1, Number(body.chapter) || 1);
    const verse = Number.isInteger(body.verse) ? Number(body.verse) : null;
    const requestedIds = Array.isArray(body.translationIds)
      ? body.translationIds.map(String)
      : getComparisonTranslationIds();

    const masoreticBook = corpus.bookBySlug.get(bookId);
    const catalogMeta = CANONICAL_BOOK_BY_ID.get(bookId);

    if (verse && verse >= 1) {
      const vr = masoreticBook?.verses.find((v) => v.c === chapter && v.v === verse) ?? null;
      const cmp = translations.compareTranslationsForVerse(requestedIds, bookId, chapter, verse);
      res.json({
        mode: 'verse',
        hasHebrewOriginal: Boolean(masoreticBook),
        ptTitle: masoreticBook?.ptTitle ?? catalogMeta?.ptTitle ?? bookId,
        heTitle: masoreticBook?.heTitle ?? null,
        original: vr && masoreticBook
          ? {
              originalPlain: stripHtmlTags(vr.orig),
              vocalized: vr.voc,
              consonantalSpaced: vr.cons,
              stream: masoreticBook.stream.slice(vr.s, vr.e),
              startOffset: vr.s,
              endOffset: vr.e,
            }
          : null,
        ...cmp,
      });
      return;
    }

    // Modo capitulo completo lado a lado
    let verseNumbers: number[] = [];
    if (masoreticBook) {
      verseNumbers = masoreticBook.verses.filter((v) => v.c === chapter).map((v) => v.v);
    } else {
      for (const tid of requestedIds) {
        const chData = translations.getChapter(tid, bookId, chapter);
        if (chData) {
          verseNumbers = chData.verses.map((v) => v.verse);
          break;
        }
      }
    }

    const rows = verseNumbers.slice(0, 120).map((vNum) => {
      const vr = masoreticBook?.verses.find((v) => v.c === chapter && v.v === vNum) ?? null;
      const cmp = translations.compareTranslationsForVerse(requestedIds, bookId, chapter, vNum);
      return {
        verse: vNum,
        original: vr && masoreticBook
          ? {
              originalPlain: stripHtmlTags(vr.orig),
              vocalized: vr.voc,
              consonantalSpaced: vr.cons,
              stream: masoreticBook.stream.slice(vr.s, vr.e),
            }
          : null,
        entries: cmp.entries,
        deterministicDiffs: cmp.deterministicDiffs,
      };
    });

    res.json({
      mode: 'chapter',
      hasHebrewOriginal: Boolean(masoreticBook),
      bookId,
      ptTitle: masoreticBook?.ptTitle ?? catalogMeta?.ptTitle ?? bookId,
      heTitle: masoreticBook?.heTitle ?? null,
      chapter,
      rows,
    });
  });

  // Continuous Stream Search
  app.post('/api/search/continuous', (req, res) => {
    const body = req.body ?? {};
    const query = typeof body.query === 'string' ? body.query : '';
    const trId = getPreferredTranslationId(body.translationId);
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
      translationId: trId,
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
      translationId: getPreferredTranslationId(body.translationId),
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
      translationId: getPreferredTranslationId(body.translationId),
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
      maxLettersCap: body.maxLettersCap ? Number(body.maxLettersCap) : undefined,
      translationId: getPreferredTranslationId(body.translationId),
    });
    res.json(result);
  });

  // Identical Verses (SHA-256)
  app.get('/api/compare/identical', (req, res) => {
    const minLetters = Math.max(4, Math.min(100, Number(req.query.minLetters) || 12));
    const limit = Math.max(10, Math.min(200, Number(req.query.limit) || 100));
    const trId = getPreferredTranslationId(req.query.translationId);
    res.json(findIdenticalVerses(corpus, minLetters, limit, trId));
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
      translationId: getPreferredTranslationId(body.translationId),
    });
    res.json(result);
  });

  // Experimental Phonetic Search (Lexicon + Continuous Stream)
  app.post('/api/search/phonetic', (req, res) => {
    const body = req.body ?? {};
    const rules = Array.isArray(body.activeRuleIds) ? body.activeRuleIds.map(String) : [];
    const result = experimentalPhoneticSearch(corpus, {
      term: typeof body.term === 'string' ? body.term : '',
      activeRuleIds: rules,
      maxCost: Number(body.maxCost) || 1.2,
      limit: Number(body.limit) || 50,
      mode: body.mode === 'continuous' || body.mode === 'both' ? body.mode : 'lexicon',
      division: typeof body.division === 'string' ? body.division : 'all',
      bookSlug: typeof body.bookSlug === 'string' ? body.bookSlug : 'all',
      translationId: getPreferredTranslationId(body.translationId),
    });
    res.json(result);
  });

  // Identity Declarations
  app.get('/api/labs/identity', (req, res) => {
    res.json(analyzeIdentityDeclarations(corpus, getPreferredTranslationId(req.query.translationId)));
  });

  // Masoretic Lab (§12)
  app.post('/api/labs/masoretic', (req, res) => {
    const body = req.body ?? {};
    const result = analyzeMasoreticFeatures(corpus, {
      selectedSigns: Array.isArray(body.selectedSigns) ? body.selectedSigns.map(String) : [],
      matchMode: body.matchMode === 'verse_all' ? 'verse_all' : 'word_all',
      consonantalFilter: typeof body.consonantalFilter === 'string' ? body.consonantalFilter : '',
      division: typeof body.division === 'string' ? body.division : 'all',
      bookSlug: typeof body.bookSlug === 'string' ? body.bookSlug : 'all',
      page: Number(body.page) || 1,
      pageSize: Number(body.pageSize) || 25,
      translationId: getPreferredTranslationId(body.translationId),
    });
    res.json(result);
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
      translationId: getPreferredTranslationId(body.translationId),
    });
    res.json(result);
  });

  // Validation & Acceptance Suite
  app.get('/api/validation', (_req, res) => {
    res.json(runValidationSuite(corpus));
  });

  // Notebook, Connections & Search History (SQLite)
  app.get('/api/notebook', (_req, res) => {
    res.json({
      entries: store.listNotebookEntries(),
      connections: store.listNotebookConnections(),
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
      translations_snapshot_json:
        typeof body.translations_snapshot_json === 'string'
          ? body.translations_snapshot_json
          : JSON.stringify(body.translations_snapshot ?? {}),
      algorithm_version: typeof body.algorithm_version === 'string' ? body.algorithm_version : 'yawe-2.1.0',
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

  app.post('/api/notebook/connections', (req, res) => {
    const body = req.body ?? {};
    const fromId = Number(body.from_entry_id);
    const toId = Number(body.to_entry_id);
    const relationNote = String(body.relation_note || '').trim();
    if (!Number.isInteger(fromId) || !Number.isInteger(toId) || fromId === toId || !relationNote) {
      res.status(400).json({ error: 'Selecione duas anotações distintas e descreva a relação.' });
      return;
    }
    const connection = store.addNotebookConnection(fromId, toId, relationNote);
    res.status(201).json({ connection });
  });

  app.delete('/api/notebook/connections/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'ID inválido.' });
      return;
    }
    res.json({ deleted: store.deleteNotebookConnection(id) });
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
    const notebookConnections = body.includeNotebook ? store.listNotebookConnections() : [];

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
      res.send(JSON.stringify({ meta: metaBlock, hypotheses, items, notebookEntries, notebookConnections }, null, 2));
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
          lines.push(`* [#${n.id}] ${n.title} [${n.reference}] (${n.evidence_tier}): ${n.hypothesis}`);
        }
      }
      if (notebookConnections.length > 0) {
        lines.push('', `CONEXÕES ENTRE DESCOBERTAS (${notebookConnections.length}):`);
        for (const c of notebookConnections) {
          lines.push(`* #${c.from_entry_id} <-> #${c.to_entry_id}: ${c.relation_note}`);
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
        md.push(`- **#${n.id} · ${n.title}** (${n.reference} · \`${n.evidence_tier}\`): ${n.hypothesis}`);
      }
      md.push('');
    }

    if (notebookConnections.length > 0) {
      md.push(`## Conexões entre Descobertas (${notebookConnections.length})`, '');
      for (const c of notebookConnections) {
        md.push(`- **#${c.from_entry_id} ↔ #${c.to_entry_id}:** ${c.relation_note}`);
      }
      md.push('');
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
