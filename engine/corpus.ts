import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isAramaicVerse, normalizeFinalLetters } from './normalize.ts';
import type {
  BookData,
  Division,
  LexiconStats,
  MatchBoundaryType,
  OccurrenceResult,
  VerseRecord,
  WordEntry,
} from './types.ts';

export interface ManifestData {
  engine_name: string;
  blueprint_version: string;
  curadoria: string;
  generated_at_utc: string;
  source_repository: string;
  books_json_url: string;
  books_json_sha256: string;
  index_commit_sha: string;
  primary_edition: string;
  canonical_books_count: number;
  traditional_books_count: number;
  totals: {
    chapters: number;
    verses: number;
    words: number;
    letters: number;
  };
  normalization_policy: Record<string, unknown>;
  validation_tests: Record<string, boolean>;
  books: Array<{
    order: number;
    title: string;
    slug: string;
    division: Division;
    heTitle: string;
    ptTitle: string;
    edition: string;
    license: string;
    json_url: string;
    original_file: string;
    original_sha256: string;
    search_file: string;
    search_file_sha256: string;
    stream_sha256: string;
    maps_file: string;
    chapters: number;
    verses: number;
    words: number;
    letters: number;
    ketiv_qere_verses: number;
    authorized_lacunae: { chapter: number; verse: number; raw: string; reason: string }[];
    portuguese_translation: { versionTitle?: string; license?: string; language?: string } | null;
  }>;
}

export interface VerseHashEntry {
  book: string;
  slug: string;
  ptBook: string;
  chapter: number;
  verse: number;
  verseStream: string;
  verseVocalized: string;
  translationPt: string;
}

export class TanakhCorpus {
  public readonly manifest: ManifestData;
  public readonly books: BookData[] = [];
  public readonly bookBySlug = new Map<string, BookData>();
  public readonly bookByTitle = new Map<string, BookData>();
  public readonly lexicon = new Map<string, LexiconStats>();
  public readonly lexiconFinalsNorm = new Map<string, string[]>();
  public readonly verseHashes = new Map<string, VerseHashEntry[]>();
  public readonly globalStream: string;
  public readonly globalBookOffsets: Array<{ slug: string; title: string; start: number; end: number }> = [];

  constructor(dataDir: string) {
    const manifestPath = path.join(dataDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifesto nao encontrado em ${manifestPath}. Execute scripts/import_tanakh.py e scripts/build_corpus.py.`);
    }
    this.manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ManifestData;

    const globalParts: string[] = [];
    let globalCursor = 0;

    for (const entry of this.manifest.books) {
      const searchPath = path.join(dataDir, '..', entry.search_file);
      const mapsPath = path.join(dataDir, '..', entry.maps_file);
      const searchJson = JSON.parse(fs.readFileSync(searchPath, 'utf-8')) as { book: string; stream: string };
      const mapsJson = JSON.parse(fs.readFileSync(mapsPath, 'utf-8')) as {
        refs: [number, number, number, number][];
        words: [number, number, number, number, number, string, string][];
        verses: VerseRecord[];
        masoreticDiffs: BookData['masoreticDiffs'];
        authorizedLacunae: BookData['authorizedLacunae'];
      };

      const words: WordEntry[] = mapsJson.words.map((w) => ({
        chapter: w[0],
        verse: w[1],
        wordIndex: w[2],
        start: w[3],
        end: w[4],
        cons: w[5],
        voc: w[6],
      }));

      const bookData: BookData = {
        order: entry.order,
        title: entry.title,
        slug: entry.slug,
        division: entry.division,
        heTitle: entry.heTitle,
        ptTitle: entry.ptTitle,
        edition: entry.edition,
        license: entry.license,
        chapters: entry.chapters,
        verseCount: entry.verses,
        wordCount: entry.words,
        letterCount: entry.letters,
        streamSha256: entry.stream_sha256,
        stream: searchJson.stream,
        streamFinalsNorm: normalizeFinalLetters(searchJson.stream),
        refs: mapsJson.refs,
        words,
        verses: mapsJson.verses,
        masoreticDiffs: mapsJson.masoreticDiffs ?? [],
        authorizedLacunae: mapsJson.authorizedLacunae ?? [],
        ptVersionTitle: entry.portuguese_translation?.versionTitle ?? null,
      };

      this.books.push(bookData);
      this.bookBySlug.set(bookData.slug, bookData);
      this.bookByTitle.set(bookData.title, bookData);

      globalParts.push(bookData.stream);
      this.globalBookOffsets.push({
        slug: bookData.slug,
        title: bookData.title,
        start: globalCursor,
        end: globalCursor + bookData.stream.length,
      });
      globalCursor += bookData.stream.length;

      // Indexar lexico e ocorrencias lexicais
      const bookWordSeen = new Set<string>();
      for (const w of words) {
        const aramaic = isAramaicVerse(bookData.title, w.chapter, w.verse);
        let stat = this.lexicon.get(w.cons);
        if (!stat) {
          stat = {
            word: w.cons,
            count: 0,
            booksCount: 0,
            hasAramaic: false,
            hasHebrew: false,
          };
          this.lexicon.set(w.cons, stat);
          const fn = normalizeFinalLetters(w.cons);
          const arr = this.lexiconFinalsNorm.get(fn) ?? [];
          arr.push(w.cons);
          this.lexiconFinalsNorm.set(fn, arr);
        }
        stat.count++;
        if (aramaic) stat.hasAramaic = true;
        else stat.hasHebrew = true;
        if (!bookWordSeen.has(w.cons)) {
          bookWordSeen.add(w.cons);
          stat.booksCount++;
        }
      }

      // Indexar hashes SHA-256 dos versiculos no stream
      for (const vr of bookData.verses) {
        if (vr.s === vr.e) continue; // lacuna autorizada
        const vStream = bookData.stream.slice(vr.s, vr.e);
        const hash = crypto.createHash('sha256').update(vStream, 'utf8').digest('hex');
        const arr = this.verseHashes.get(hash) ?? [];
        arr.push({
          book: bookData.title,
          slug: bookData.slug,
          ptBook: bookData.ptTitle,
          chapter: vr.c,
          verse: vr.v,
          verseStream: vStream,
          verseVocalized: vr.voc,
          translationPt: vr.pt,
        });
        this.verseHashes.set(hash, arr);
      }
    }

    this.globalStream = globalParts.join('');
  }

  public getBooksByScope(scope?: { division?: string; bookSlug?: string }): BookData[] {
    if (scope?.bookSlug && scope.bookSlug !== 'all') {
      const b = this.bookBySlug.get(scope.bookSlug);
      return b ? [b] : [];
    }
    if (scope?.division && scope.division !== 'all') {
      return this.books.filter((b) => b.division === scope.division);
    }
    return this.books;
  }

  public findVerseIndexByOffset(book: BookData, offset: number): number {
    let lo = 0;
    let hi = book.verses.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const vr = book.verses[mid];
      if (vr.s === vr.e) {
        // skip zero-length lacunae cleanly
        if (offset < vr.s) hi = mid - 1;
        else lo = mid + 1;
        continue;
      }
      if (offset < vr.s) {
        hi = mid - 1;
      } else if (offset >= vr.e) {
        lo = mid + 1;
      } else {
        return mid;
      }
    }
    return Math.min(Math.max(lo, 0), book.verses.length - 1);
  }

  public findFirstWordIndexAtOrBefore(book: BookData, offset: number): number {
    let lo = 0;
    let hi = book.words.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (book.words[mid].start <= offset) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  public getOverlappingWords(book: BookData, start: number, end: number): WordEntry[] {
    const startIdx = this.findFirstWordIndexAtOrBefore(book, start);
    const result: WordEntry[] = [];
    for (let i = startIdx; i < book.words.length; i++) {
      const w = book.words[i];
      if (w.start >= end) break;
      if (w.end > start && w.start < end) {
        result.push(w);
      }
    }
    return result;
  }

  public classifyBoundary(book: BookData, start: number, end: number): {
    boundaryType: MatchBoundaryType;
    overlappingWords: WordEntry[];
    crossesWords: boolean;
    crossesVerse: boolean;
  } {
    const overlappingWords = this.getOverlappingWords(book, start, end);
    if (overlappingWords.length === 0) {
      return {
        boundaryType: 'substring',
        overlappingWords: [],
        crossesWords: false,
        crossesVerse: false,
      };
    }
    const first = overlappingWords[0];
    const last = overlappingWords[overlappingWords.length - 1];
    const exactStart = first.start === start;
    const exactEnd = last.end === end;
    const crossesVerse = first.chapter !== last.chapter || first.verse !== last.verse;
    const crossesWords = overlappingWords.length > 1;

    let boundaryType: MatchBoundaryType;
    if (exactStart && exactEnd && overlappingWords.length === 1) {
      boundaryType = 'exact_word';
    } else if (exactStart && exactEnd && !crossesVerse) {
      boundaryType = 'multi_word';
    } else if (crossesVerse) {
      boundaryType = 'cross_verse';
    } else if (crossesWords) {
      boundaryType = 'resegmented';
    } else {
      boundaryType = 'substring';
    }

    return { boundaryType, overlappingWords, crossesWords, crossesVerse };
  }

  public buildOccurrence(
    book: BookData,
    start: number,
    end: number,
    options: {
      evidenceTier: OccurrenceResult['evidenceTier'];
      parametersSummary: string;
      transformationLog?: string[];
      cost?: number;
      distance?: number;
      elsSkip?: number;
    },
  ): OccurrenceResult {
    const startVIdx = this.findVerseIndexByOffset(book, start);
    const endVIdx = this.findVerseIndexByOffset(book, Math.max(start, end - 1));
    const vStart = book.verses[startVIdx];
    const vEnd = book.verses[endVIdx];
    const cls = this.classifyBoundary(book, start, end);

    const kq = book.masoreticDiffs
      .filter((d) => d.chapter === vStart.c && d.verse === vStart.v)
      .flatMap((d) => d.items);

    const isCrossVerse = vStart.c !== vEnd.c || vStart.v !== vEnd.v;
    const refLabel = isCrossVerse
      ? `${book.ptTitle} ${vStart.c}:${vStart.v}–${vEnd.c}:${vEnd.v}`
      : `${book.ptTitle} ${vStart.c}:${vStart.v}`;

    const beforeVerse = startVIdx > 0 ? book.verses[startVIdx - 1] : null;
    const afterVerse = endVIdx + 1 < book.verses.length ? book.verses[endVIdx + 1] : null;
    const aramaic = isAramaicVerse(book.title, vStart.c, vStart.v);

    return {
      id: `${book.slug}:${start}-${end}:${options.elsSkip ?? 0}`,
      book: book.title,
      slug: book.slug,
      ptBook: book.ptTitle,
      heBook: book.heTitle,
      division: book.division,
      chapter: vStart.c,
      verse: vStart.v,
      endChapter: isCrossVerse ? vEnd.c : undefined,
      endVerse: isCrossVerse ? vEnd.v : undefined,
      reference: refLabel,
      matchedStream: book.stream.slice(start, end),
      matchedWordsOriginal: cls.overlappingWords.map((w) => w.voc).join(' '),
      startOffset: start,
      endOffset: end,
      boundaryType: cls.boundaryType,
      crossesWords: cls.crossesWords,
      crossesVerse: cls.crossesVerse,
      isAramaicRange: aramaic,
      evidenceTier: options.evidenceTier,
      verseVocalized: isCrossVerse ? `${vStart.voc} ‖ ${vEnd.voc}` : vStart.voc,
      verseConsonantal: isCrossVerse ? `${vStart.cons} ‖ ${vEnd.cons}` : vStart.cons,
      verseStream: book.stream.slice(vStart.s, vEnd.e),
      contextBefore: beforeVerse ? `${beforeVerse.c}:${beforeVerse.v} ${beforeVerse.voc}` : '',
      contextAfter: afterVerse ? `${afterVerse.c}:${afterVerse.v} ${afterVerse.voc}` : '',
      translationPt: vStart.pt || '',
      translationPtSource: vStart.pt ? book.ptVersionTitle : null,
      edition: book.edition,
      language: aramaic ? 'Aramaico Bíblico' : 'Hebraico Bíblico',
      parametersSummary: options.parametersSummary,
      ketivQereInVerse: kq,
      transformationLog: options.transformationLog,
      cost: options.cost,
      distance: options.distance,
      elsSkip: options.elsSkip,
    };
  }
}
