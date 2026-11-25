import { TanakhCorpus } from './corpus.ts';
import {
  PHONETIC_RULES,
  generateUniquePermutations,
  levenshteinLetters,
  normalizeConsonantal,
  normalizeFinalLetters,
  reverseLogical,
  weightedPhoneticDistance,
} from './normalize.ts';
import type {
  BookData,
  EngineVersionInfo,
  MatchBoundaryType,
  OccurrenceResult,
} from './types.ts';

export const ENGINE_VERSIONS: EngineVersionInfo[] = [
  { algorithm: 'continuous_stream_search', version: '2.1.0', description: 'Busca determinística exata e de ressegmentação sobre stream consonantal Unicode' },
  { algorithm: 'aho_corasick_multi', version: '1.0.0', description: 'Autômato de Aho-Corasick para varredura simultânea de múltiplos padrões' },
  { algorithm: 'consecutive_repetitions', version: '1.3.0', description: 'Detector de repetições adjacentes em palavras e tandem repeats no stream' },
  { algorithm: 'suffix_array_kasai_lcp', version: '2.0.0', description: 'Suffix Array (radix counting sort O(N log N)) + Kasai LCP com métricas explícitas de cobertura' },
  { algorithm: 'verse_sha256_levenshtein', version: '1.1.0', description: 'Comparação exata por hash SHA-256 de versículos e alinhamento Levenshtein letra a letra' },
  { algorithm: 'inversions_permutations', version: '1.1.0', description: 'Inversão lógica e permutação combinatória limitada com validação lexical no corpus' },
  { algorithm: 'phonetic_weighted_edit', version: '2.0.0', description: 'Distância fonética experimental no léxico e stream contínuo com regras 1:1, 1:N e N:1' },
  { algorithm: 'masoretic_sign_inspector', version: '1.0.0', description: 'Auditoria determinística de sinais massoréticos e vocalizações atestadas do Tetragrama' },
  { algorithm: 'els_equidistant', version: '1.1.0', description: 'Sequências Equidistantes de Letras (ELS) com controle estatístico de expectativa aleatória' },
];

// ============================================================================
// 1. AHO-CORASICK AUTOMATON
// ============================================================================
interface ACNode {
  next: Map<string, number>;
  fail: number;
  outputs: string[];
}

export class AhoCorasick {
  private nodes: ACNode[] = [{ next: new Map(), fail: 0, outputs: [] }];

  constructor(patterns: string[]) {
    const unique = Array.from(new Set(patterns.filter((p) => p.length > 0)));
    for (const pat of unique) {
      let state = 0;
      for (const ch of pat) {
        let nxt = this.nodes[state].next.get(ch);
        if (nxt === undefined) {
          nxt = this.nodes.length;
          this.nodes.push({ next: new Map(), fail: 0, outputs: [] });
          this.nodes[state].next.set(ch, nxt);
        }
        state = nxt;
      }
      this.nodes[state].outputs.push(pat);
    }

    const queue: number[] = [];
    for (const [, child] of this.nodes[0].next) {
      this.nodes[child].fail = 0;
      queue.push(child);
    }

    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      for (const [ch, nxt] of this.nodes[curr].next) {
        let f = this.nodes[curr].fail;
        while (f !== 0 && !this.nodes[f].next.has(ch)) {
          f = this.nodes[f].fail;
        }
        const failTarget = this.nodes[f].next.get(ch) ?? 0;
        this.nodes[nxt].fail = failTarget;
        if (this.nodes[failTarget].outputs.length > 0) {
          this.nodes[nxt].outputs.push(...this.nodes[failTarget].outputs);
        }
        queue.push(nxt);
      }
    }
  }

  public search(text: string): Array<{ pattern: string; start: number; end: number }> {
    const matches: Array<{ pattern: string; start: number; end: number }> = [];
    let state = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      while (state !== 0 && !this.nodes[state].next.has(ch)) {
        state = this.nodes[state].fail;
      }
      state = this.nodes[state].next.get(ch) ?? 0;
      const outs = this.nodes[state].outputs;
      if (outs.length > 0) {
        for (const pat of outs) {
          matches.push({ pattern: pat, start: i - pat.length + 1, end: i + 1 });
        }
      }
    }
    return matches;
  }
}

// ============================================================================
// 2. CONTINUOUS STREAM SEARCH & ELS
// ============================================================================
export interface ContinuousSearchParams {
  query: string;
  division?: string;
  bookSlug?: string;
  chapter?: number;
  normalizeFinals?: boolean;
  boundaryFilter?: 'all' | MatchBoundaryType;
  crossBooks?: boolean;
  page?: number;
  pageSize?: number;
  translationId?: string | null;
}

export function searchContinuousStream(corpus: TanakhCorpus, params: ContinuousSearchParams) {
  const rawQuery = params.query.trim();
  const queries = rawQuery
    .split(/[,;\n]+/)
    .map((q) => normalizeConsonantal(q))
    .filter((q) => q.length > 0);

  const normalizeFinals = Boolean(params.normalizeFinals);
  const effectiveQueries = Array.from(
    new Set(queries.map((q) => (normalizeFinals ? normalizeFinalLetters(q) : q))),
  );

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, params.pageSize ?? 50));

  if (effectiveQueries.length === 0) {
    return {
      queries: [],
      totalCount: 0,
      page,
      pageSize,
      boundaryBreakdown: { exact_word: 0, multi_word: 0, resegmented: 0, cross_verse: 0, substring: 0 },
      bookBreakdown: [] as Array<{ book: string; slug: string; ptBook: string; count: number }>,
      occurrences: [] as OccurrenceResult[],
      crossBookMatches: [] as Array<{ fromBook: string; toBook: string; matchedStream: string; globalStart: number; globalEnd: number }>,
      algorithmVersion: 'continuous_stream_search@2.0.0',
      computationalLimits: 'Sem truncamento de contagem total; paginação explícita (máx. 200 itens/página).',
    };
  }

  const books = corpus.getBooksByScope({ division: params.division, bookSlug: params.bookSlug });
  const ac = effectiveQueries.length > 1 ? new AhoCorasick(effectiveQueries) : null;
  const singlePattern = effectiveQueries.length === 1 ? effectiveQueries[0] : null;

  const boundaryBreakdown: Record<MatchBoundaryType, number> = {
    exact_word: 0,
    multi_word: 0,
    resegmented: 0,
    cross_verse: 0,
    substring: 0,
  };
  const bookCounts = new Map<string, { book: string; slug: string; ptBook: string; count: number }>();
  const rawHits: Array<{ book: BookData; start: number; end: number; pattern: string }> = [];

  for (const book of books) {
    const haystack = normalizeFinals ? book.streamFinalsNorm : book.stream;
    let chapterStartOffset = 0;
    let chapterEndOffset = haystack.length;

    if (params.chapter && params.chapter > 0 && params.bookSlug && params.bookSlug !== 'all') {
      const chapterVerses = book.verses.filter((v) => v.c === params.chapter && v.e > v.s);
      if (chapterVerses.length === 0) continue;
      chapterStartOffset = chapterVerses[0].s;
      chapterEndOffset = chapterVerses[chapterVerses.length - 1].e;
    }

    const slice =
      chapterStartOffset === 0 && chapterEndOffset === haystack.length
        ? haystack
        : haystack.slice(chapterStartOffset, chapterEndOffset);

    const hits: Array<{ pattern: string; start: number; end: number }> = [];
    if (ac) {
      for (const m of ac.search(slice)) {
        hits.push({
          pattern: m.pattern,
          start: chapterStartOffset + m.start,
          end: chapterStartOffset + m.end,
        });
      }
    } else if (singlePattern) {
      let idx = slice.indexOf(singlePattern);
      while (idx !== -1) {
        hits.push({
          pattern: singlePattern,
          start: chapterStartOffset + idx,
          end: chapterStartOffset + idx + singlePattern.length,
        });
        idx = slice.indexOf(singlePattern, idx + 1);
      }
    }

    for (const h of hits) {
      const cls = corpus.classifyBoundary(book, h.start, h.end);
      if (params.boundaryFilter && params.boundaryFilter !== 'all' && cls.boundaryType !== params.boundaryFilter) {
        continue;
      }
      boundaryBreakdown[cls.boundaryType]++;
      rawHits.push({ book, start: h.start, end: h.end, pattern: h.pattern });
      const prev = bookCounts.get(book.slug) ?? { book: book.title, slug: book.slug, ptBook: book.ptTitle, count: 0 };
      prev.count++;
      bookCounts.set(book.slug, prev);
    }
  }

  // Opcional: travessia de fronteiras entre livros (desligada por padrao, conforme Secao 06)
  const crossBookMatches: Array<{
    fromBook: string;
    toBook: string;
    matchedStream: string;
    globalStart: number;
    globalEnd: number;
  }> = [];

  if (params.crossBooks && (!params.bookSlug || params.bookSlug === 'all') && (!params.division || params.division === 'all')) {
    const gStream = normalizeFinals ? normalizeFinalLetters(corpus.globalStream) : corpus.globalStream;
    for (const pat of effectiveQueries) {
      if (pat.length < 2) continue;
      for (let bi = 0; bi < corpus.globalBookOffsets.length - 1; bi++) {
        const boundary = corpus.globalBookOffsets[bi].end;
        const winStart = Math.max(0, boundary - pat.length + 1);
        const winEnd = Math.min(gStream.length, boundary + pat.length - 1);
        const windowStr = gStream.slice(winStart, winEnd);
        let pos = windowStr.indexOf(pat);
        while (pos !== -1) {
          const gs = winStart + pos;
          const ge = gs + pat.length;
          if (gs < boundary && ge > boundary) {
            crossBookMatches.push({
              fromBook: corpus.globalBookOffsets[bi].title,
              toBook: corpus.globalBookOffsets[bi + 1].title,
              matchedStream: corpus.globalStream.slice(gs, ge),
              globalStart: gs,
              globalEnd: ge,
            });
          }
          pos = windowStr.indexOf(pat, pos + 1);
        }
      }
    }
  }

  const startIdx = (page - 1) * pageSize;
  const pageHits = rawHits.slice(startIdx, startIdx + pageSize);
  const paramSummary = `consulta="${effectiveQueries.join(', ')}" | finais_norm=${normalizeFinals} | fronteira=${params.boundaryFilter ?? 'all'} | cruzar_livros=${Boolean(params.crossBooks)}`;

  const occurrences = pageHits.map((h) =>
    corpus.buildOccurrence(h.book, h.start, h.end, {
      evidenceTier: h.book.stream.slice(h.start, h.end) === h.pattern || !normalizeFinals ? 'evidencia_textual' : 'correspondencia_estrutural',
      parametersSummary: paramSummary,
      translationId: params.translationId,
    }),
  );

  return {
    queries: effectiveQueries,
    totalCount: rawHits.length,
    page,
    pageSize,
    boundaryBreakdown,
    bookBreakdown: Array.from(bookCounts.values()).sort((a, b) => b.count - a.count),
    occurrences,
    crossBookMatches,
    algorithmVersion: ac ? 'aho_corasick_multi@1.0.0' : 'continuous_stream_search@2.1.0',
    computationalLimits: 'Busca exaustiva sobre stream contínuo; paginação sem ocultação de contagens totais.',
  };
}

export function searchELS(
  corpus: TanakhCorpus,
  params: {
    query: string;
    bookSlug: string;
    minSkip: number;
    maxSkip: number;
    includeNegative?: boolean;
    normalizeFinals?: boolean;
    limit?: number;
    translationId?: string | null;
  },
) {
  const cleanQuery = normalizeConsonantal(params.query);
  const effectiveQuery = params.normalizeFinals ? normalizeFinalLetters(cleanQuery) : cleanQuery;
  const book = corpus.bookBySlug.get(params.bookSlug) ?? corpus.books[0];

  const minSkip = Math.max(1, Math.min(500, Math.abs(params.minSkip || 2)));
  const maxSkip = Math.max(minSkip, Math.min(500, Math.abs(params.maxSkip || 100)));
  const maxResults = Math.min(200, params.limit ?? 100);

  if (effectiveQuery.length < 3 || !book) {
    return {
      query: effectiveQuery,
      book: book?.title ?? '',
      totalHits: 0,
      expectedRandomHits: 0,
      hits: [],
      computationalLimits: 'ELS requer termo >= 3 letras; intervalo |d| limitado a 1..500; máx. 200 resultados retornados.',
      algorithmVersion: 'els_equidistant@1.0.0',
    };
  }

  const stream = params.normalizeFinals ? book.streamFinalsNorm : book.stream;
  const N = stream.length;
  const L = effectiveQuery.length;

  // Frequencias reais das letras no livro para controle estatistico de ocorrencia ao acaso
  const letterFreq = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    letterFreq.set(stream[i], (letterFreq.get(stream[i]) ?? 0) + 1);
  }
  let pTerm = 1;
  for (const ch of effectiveQuery) {
    pTerm *= (letterFreq.get(ch) ?? 0) / N;
  }

  const skips: number[] = [];
  for (let d = minSkip; d <= maxSkip; d++) {
    skips.push(d);
    if (params.includeNegative) skips.push(-d);
  }

  let expectedRandomHits = 0;
  let totalHits = 0;
  const hits: Array<{
    skip: number;
    bookSlug: string;
    startOffset: number;
    endOffset: number;
    referenceStart: string;
    referenceEnd: string;
    letterOffsets: number[];
    verseStartVocalized: string;
    matchedLetters: Array<{
      queryIndex: number;
      letter: string;
      offset: number;
      reference: string;
      chapter: number;
      verse: number;
      localOffset: number;
    }>;
    verseSpans: Array<{
      reference: string;
      slug: string;
      chapter: number;
      verse: number;
      vocalized: string;
      consonantal: string;
      translationPt: string;
      streamLength: number;
      highlights: Array<{ localOffset: number; queryIndex: number; letter: string }>;
    }>;
    letterWindows: Array<{
      queryIndex: number;
      offset: number;
      reference: string;
      before: string;
      letter: string;
      after: string;
    }>;
  }> = [];

  for (const d of skips) {
    const absD = Math.abs(d);
    const span = (L - 1) * absD;
    if (span >= N) continue;
    expectedRandomHits += (N - span) * pTerm;

    const startMin = d > 0 ? 0 : span;
    const startMax = d > 0 ? N - span - 1 : N - 1;
    const firstChar = effectiveQuery[0];

    for (let pos = startMin; pos <= startMax; pos++) {
      if (stream[pos] !== firstChar) continue;
      let ok = true;
      for (let k = 1; k < L; k++) {
        if (stream[pos + k * d] !== effectiveQuery[k]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        totalHits++;
        if (hits.length < maxResults) {
          const letterOffsets = Array.from({ length: L }, (_, k) => pos + k * d);
          const minOff = Math.min(letterOffsets[0], letterOffsets[L - 1]);
          const maxOff = Math.max(letterOffsets[0], letterOffsets[L - 1]);
          const vS = book.verses[corpus.findVerseIndexByOffset(book, minOff)];
          const vE = book.verses[corpus.findVerseIndexByOffset(book, maxOff)];

          const matchedLetters = letterOffsets.map((off, queryIndex) => {
            const vIdx = corpus.findVerseIndexByOffset(book, off);
            const vr = book.verses[vIdx];
            return {
              queryIndex,
              letter: stream[off],
              offset: off,
              reference: `${book.ptTitle} ${vr.c}:${vr.v}`,
              chapter: vr.c,
              verse: vr.v,
              localOffset: off - vr.s,
            };
          });

          const verseMap = new Map<
            number,
            {
              vIdx: number;
              reference: string;
              slug: string;
              chapter: number;
              verse: number;
              vocalized: string;
              consonantal: string;
              translationPt: string;
              streamLength: number;
              highlights: Array<{ localOffset: number; queryIndex: number; letter: string }>;
            }
          >();

          for (const ml of matchedLetters) {
            const vIdx = corpus.findVerseIndexByOffset(book, ml.offset);
            const vr = book.verses[vIdx];
            let entry = verseMap.get(vIdx);
            if (!entry) {
              const tr = corpus.resolveVerseTranslation(book.slug, vr.c, vr.v, params.translationId);
              entry = {
                vIdx,
                reference: `${book.ptTitle} ${vr.c}:${vr.v}`,
                slug: book.slug,
                chapter: vr.c,
                verse: vr.v,
                vocalized: vr.voc,
                consonantal: vr.cons,
                translationPt: tr.text,
                streamLength: vr.e - vr.s,
                highlights: [],
              };
              verseMap.set(vIdx, entry);
            }
            entry.highlights.push({
              localOffset: ml.localOffset,
              queryIndex: ml.queryIndex,
              letter: ml.letter,
            });
          }

          const verseSpans = Array.from(verseMap.values())
            .sort((a, b) => a.vIdx - b.vIdx)
            .map(({ vIdx: _vIdx, ...rest }) => rest);

          const letterWindows = matchedLetters.map((ml) => {
            const radius = 10;
            const leftStart = Math.max(0, ml.offset - radius);
            const rightEnd = Math.min(N, ml.offset + radius + 1);
            return {
              queryIndex: ml.queryIndex,
              offset: ml.offset,
              reference: ml.reference,
              before: stream.slice(leftStart, ml.offset),
              letter: stream[ml.offset],
              after: stream.slice(ml.offset + 1, rightEnd),
            };
          });

          hits.push({
            skip: d,
            bookSlug: book.slug,
            startOffset: letterOffsets[0],
            endOffset: letterOffsets[L - 1],
            referenceStart: `${book.ptTitle} ${vS.c}:${vS.v}`,
            referenceEnd: `${book.ptTitle} ${vE.c}:${vE.v}`,
            letterOffsets,
            verseStartVocalized: vS.voc,
            matchedLetters,
            verseSpans,
            letterWindows,
          });
        }
      }
    }
  }

  return {
    query: effectiveQuery,
    book: book.title,
    ptBook: book.ptTitle,
    totalHits,
    expectedRandomHits: Number(expectedRandomHits.toFixed(4)),
    observedOverExpected: expectedRandomHits > 0 ? Number((totalHits / expectedRandomHits).toFixed(3)) : null,
    hits,
    computationalLimits: `Escopo: ${book.ptTitle} (${N.toLocaleString()} letras); skips |d| de ${minSkip} a ${maxSkip}; máximo ${maxResults} ocorrências detalhadas.`,
    algorithmVersion: 'els_equidistant@1.0.0',
  };
}

// ============================================================================
// 3. CONSECUTIVE REPETITIONS
// ============================================================================
export interface RepetitionGroup {
  unit: string;
  unitVocalized: string;
  repeatCount: number;
  unitWordLength: number;
  unitLetterLength: number;
  book: string;
  slug: string;
  ptBook: string;
  chapter: number;
  verse: number;
  reference: string;
  startOffset: number;
  endOffset: number;
  boundaryType: 'palavra_exata' | 'subcadeia_stream';
  verseVocalized: string;
  translationPt: string;
}

export function findConsecutiveRepetitions(
  corpus: TanakhCorpus,
  params: {
    mode?: 'words' | 'stream' | 'both';
    division?: string;
    bookSlug?: string;
    minRepeats?: number;
    maxUnitWords?: number;
    minStreamUnitLen?: number;
    maxStreamUnitLen?: number;
    page?: number;
    pageSize?: number;
    translationId?: string | null;
  },
) {
  const mode = params.mode ?? 'both';
  const minRepeats = Math.max(2, params.minRepeats ?? 2);
  const maxUnitWords = Math.min(4, Math.max(1, params.maxUnitWords ?? 3));
  const minStreamLen = Math.max(2, params.minStreamUnitLen ?? 2);
  const maxStreamLen = Math.min(18, Math.max(minStreamLen, params.maxStreamUnitLen ?? 10));
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, params.pageSize ?? 60));

  const books = corpus.getBooksByScope({ division: params.division, bookSlug: params.bookSlug });
  const results: RepetitionGroup[] = [];

  for (const book of books) {
    if (mode === 'words' || mode === 'both') {
      const words = book.words;
      for (let uLen = 1; uLen <= maxUnitWords; uLen++) {
        let i = 0;
        while (i + uLen * minRepeats <= words.length) {
          let repeats = 1;
          while (i + (repeats + 1) * uLen <= words.length) {
            let match = true;
            for (let k = 0; k < uLen; k++) {
              if (words[i + k].cons !== words[i + repeats * uLen + k].cons) {
                match = false;
                break;
              }
            }
            if (!match) break;
            repeats++;
          }
          if (repeats >= minRepeats) {
            const firstW = words[i];
            const lastW = words[i + repeats * uLen - 1];
            const vIdx = corpus.findVerseIndexByOffset(book, firstW.start);
            const vr = book.verses[vIdx];
            const unitWords = words.slice(i, i + uLen);
            const tr = corpus.resolveVerseTranslation(book.slug, vr.c, vr.v, params.translationId);
            results.push({
              unit: unitWords.map((w) => w.cons).join(' '),
              unitVocalized: unitWords.map((w) => w.voc).join(' '),
              repeatCount: repeats,
              unitWordLength: uLen,
              unitLetterLength: unitWords.reduce((s, w) => s + w.cons.length, 0),
              book: book.title,
              slug: book.slug,
              ptBook: book.ptTitle,
              chapter: firstW.chapter,
              verse: firstW.verse,
              reference:
                firstW.chapter === lastW.chapter && firstW.verse === lastW.verse
                  ? `${book.ptTitle} ${firstW.chapter}:${firstW.verse}`
                  : `${book.ptTitle} ${firstW.chapter}:${firstW.verse}–${lastW.chapter}:${lastW.verse}`,
              startOffset: firstW.start,
              endOffset: lastW.end,
              boundaryType: 'palavra_exata',
              verseVocalized: vr.voc,
              translationPt: tr.text,
            });
            i += repeats * uLen;
          } else {
            i++;
          }
        }
      }
    }

    if (mode === 'stream' || mode === 'both') {
      const stream = book.stream;
      const seenStreamStarts = new Set<string>();
      for (let L = minStreamLen; L <= maxStreamLen; L++) {
        for (let i = 0; i + L * minRepeats <= stream.length; i++) {
          const unit = stream.slice(i, i + L);
          // Verifica se toda a unidade e uma letra repetida de comprimento menor quando L > 2
          let repeats = 1;
          while (i + (repeats + 1) * L <= stream.length && stream.slice(i + repeats * L, i + (repeats + 1) * L) === unit) {
            repeats++;
          }
          if (repeats >= minRepeats) {
            const end = i + repeats * L;
            // Evita duplicar exatamente o mesmo span ja capturado no modo palavra_exata
            const key = `${i}-${end}`;
            if (seenStreamStarts.has(key)) continue;
            // So adiciona subcadeia_stream se nao for identica a palavra_exata ja registrada no mesmo intervalo
            const alreadyWord = results.some(
              (r) => r.slug === book.slug && r.startOffset === i && r.endOffset === end && r.boundaryType === 'palavra_exata',
            );
            if (!alreadyWord && mode === 'stream') {
              seenStreamStarts.add(key);
              const vr = book.verses[corpus.findVerseIndexByOffset(book, i)];
              const tr = corpus.resolveVerseTranslation(book.slug, vr.c, vr.v, params.translationId);
              results.push({
                unit,
                unitVocalized: unit,
                repeatCount: repeats,
                unitWordLength: 0,
                unitLetterLength: L,
                book: book.title,
                slug: book.slug,
                ptBook: book.ptTitle,
                chapter: vr.c,
                verse: vr.v,
                reference: `${book.ptTitle} ${vr.c}:${vr.v}`,
                startOffset: i,
                endOffset: end,
                boundaryType: 'subcadeia_stream',
                verseVocalized: vr.voc,
                translationPt: tr.text,
              });
            } else if (mode === 'both' && !alreadyWord) {
              // No modo 'both', inclui apenas tandem repeats com L >= 4 para evitar ruido de pares de 2 letras
              if (L >= 4) {
                seenStreamStarts.add(key);
                const vr = book.verses[corpus.findVerseIndexByOffset(book, i)];
                const tr = corpus.resolveVerseTranslation(book.slug, vr.c, vr.v, params.translationId);
                results.push({
                  unit,
                  unitVocalized: unit,
                  repeatCount: repeats,
                  unitWordLength: 0,
                  unitLetterLength: L,
                  book: book.title,
                  slug: book.slug,
                  ptBook: book.ptTitle,
                  chapter: vr.c,
                  verse: vr.v,
                  reference: `${book.ptTitle} ${vr.c}:${vr.v}`,
                  startOffset: i,
                  endOffset: end,
                  boundaryType: 'subcadeia_stream',
                  verseVocalized: vr.voc,
                  translationPt: tr.text,
                });
              }
            }
            i = end - 1;
          }
        }
      }
    }
  }

  results.sort((a, b) => b.repeatCount - a.repeatCount || b.unitLetterLength - a.unitLetterLength);

  // Agrupamento resumido por unidade repetida
  const freqByUnit = new Map<string, { unit: string; unitVocalized: string; occurrences: number; maxRepeats: number }>();
  for (const r of results) {
    const prev = freqByUnit.get(r.unit) ?? {
      unit: r.unit,
      unitVocalized: r.unitVocalized,
      occurrences: 0,
      maxRepeats: r.repeatCount,
    };
    prev.occurrences++;
    if (r.repeatCount > prev.maxRepeats) prev.maxRepeats = r.repeatCount;
    freqByUnit.set(r.unit, prev);
  }

  const startIdx = (page - 1) * pageSize;
  return {
    totalCount: results.length,
    page,
    pageSize,
    topUnits: Array.from(freqByUnit.values())
      .sort((a, b) => b.occurrences - a.occurrences || b.maxRepeats - a.maxRepeats)
      .slice(0, 30),
    items: results.slice(startIdx, startIdx + pageSize),
    algorithmVersion: 'consecutive_repetitions@1.2.0',
    computationalLimits: `Repetições mínimas: ${minRepeats}; máx. palavras/unidade: ${maxUnitWords}; tandem stream: ${minStreamLen}..${maxStreamLen} letras.`,
  };
}

// ============================================================================
// 4. SUFFIX ARRAY + KASAI LCP (O(N log N) RADIX COUNTING SORT, EXHAUSTIVE OR SCOPED)
// ============================================================================
export function buildSuffixArrayAndLCP(text: string): { sa: Int32Array; lcp: Int32Array } {
  const n = text.length;
  if (n === 0) {
    return { sa: new Int32Array(0), lcp: new Int32Array(0) };
  }
  const sa = new Int32Array(n);
  const tmpSa = new Int32Array(n);
  let rk = new Int32Array(n);
  let tmpRk = new Int32Array(n);

  // Alfabeto hebraico + separador '$' fica em 0..2048; fallback para charCode maximo caso haja outro simbolo
  let maxVal = 256;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);
    rk[i] = c;
    if (c > maxVal) maxVal = c;
  }

  let alphabet = Math.max(n, maxVal + 1);
  let cnt = new Int32Array(alphabet);

  for (let i = 0; i < n; i++) cnt[rk[i]]++;
  for (let i = 1; i < alphabet; i++) cnt[i] += cnt[i - 1];
  for (let i = n - 1; i >= 0; i--) {
    sa[--cnt[rk[i]]] = i;
  }

  let classes = 1;
  tmpRk[sa[0]] = 0;
  for (let i = 1; i < n; i++) {
    if (rk[sa[i]] !== rk[sa[i - 1]]) classes++;
    tmpRk[sa[i]] = classes - 1;
  }
  {
    const swap = rk;
    rk = tmpRk;
    tmpRk = swap;
  }

  for (let k = 1; k < n && classes < n; k <<= 1) {
    // 1) Ordena pela segunda metade (pos + k)
    let p = 0;
    for (let i = n - k; i < n; i++) tmpSa[p++] = i;
    for (let i = 0; i < n; i++) {
      if (sa[i] >= k) tmpSa[p++] = sa[i] - k;
    }

    // 2) Counting sort estavel pela primeira metade (rk[tmpSa[i]])
    cnt.fill(0, 0, classes);
    for (let i = 0; i < n; i++) cnt[rk[tmpSa[i]]]++;
    for (let i = 1; i < classes; i++) cnt[i] += cnt[i - 1];
    for (let i = n - 1; i >= 0; i--) {
      const idx = tmpSa[i];
      sa[--cnt[rk[idx]]] = idx;
    }

    classes = 1;
    tmpRk[sa[0]] = 0;
    for (let i = 1; i < n; i++) {
      const cur1 = rk[sa[i]];
      const prev1 = rk[sa[i - 1]];
      const cur2 = sa[i] + k < n ? rk[sa[i] + k] : -1;
      const prev2 = sa[i - 1] + k < n ? rk[sa[i - 1] + k] : -1;
      if (cur1 !== prev1 || cur2 !== prev2) classes++;
      tmpRk[sa[i]] = classes - 1;
    }
    const swap = rk;
    rk = tmpRk;
    tmpRk = swap;
  }

  // Kasai LCP O(N)
  const rankInv = new Int32Array(n);
  for (let i = 0; i < n; i++) rankInv[sa[i]] = i;

  const lcp = new Int32Array(n);
  let h = 0;
  for (let i = 0; i < n; i++) {
    const r = rankInv[i];
    if (r > 0) {
      const j = sa[r - 1];
      while (i + h < n && j + h < n && text.charCodeAt(i + h) === text.charCodeAt(j + h)) {
        h++;
      }
      lcp[r] = h;
      if (h > 0) h--;
    }
  }

  return { sa, lcp };
}

export function discoverRecurringPhrasesSuffixArray(
  corpus: TanakhCorpus,
  params: {
    bookSlug?: string;
    division?: string;
    minLength?: number;
    maxLength?: number;
    minFrequency?: number;
    limit?: number;
    maxLettersCap?: number;
    translationId?: string | null;
  },
) {
  const minLength = Math.max(4, Math.min(60, params.minLength ?? 9));
  const maxLength = Math.max(minLength, Math.min(80, params.maxLength ?? 32));
  const minFrequency = Math.max(2, params.minFrequency ?? 5);
  const limit = Math.min(150, params.limit ?? 60);

  const books = corpus.getBooksByScope({ bookSlug: params.bookSlug, division: params.division });
  const totalScopeLetters = books.reduce((sum, b) => sum + b.stream.length, 0);
  // Radix counting sort O(N log N) permite indexar até todo o Tanakh (~1.196.840 letras) sem truncamento silencioso
  const maxCap = Math.min(1_250_000, Math.max(50_000, params.maxLettersCap ?? 1_250_000));

  let combinedStream = '';
  const slices: Array<{ book: BookData; start: number; end: number }> = [];
  let truncatedCorpus = false;
  let analyzedPureLetters = 0;

  for (const b of books) {
    if (analyzedPureLetters + b.stream.length > maxCap && slices.length > 0) {
      truncatedCorpus = true;
      break;
    }
    const s = combinedStream.length;
    if (b.stream.length > maxCap) {
      const cut = b.stream.slice(0, maxCap);
      combinedStream += cut + '$';
      slices.push({ book: b, start: s, end: s + cut.length });
      analyzedPureLetters += cut.length;
      truncatedCorpus = true;
      break;
    }
    combinedStream += b.stream + '$';
    slices.push({ book: b, start: s, end: s + b.stream.length });
    analyzedPureLetters += b.stream.length;
  }

  const { sa, lcp } = buildSuffixArrayAndLCP(combinedStream);
  const n = combinedStream.length;

  const candidateMap = new Map<string, { phrase: string; frequency: number; sampleGlobalOffset: number }>();

  const stack: Array<{ startIdx: number; len: number }> = [];
  for (let i = 1; i <= n; i++) {
    const currLcp = i < n ? lcp[i] : 0;
    let startIdx = i - 1;
    while (stack.length > 0 && stack[stack.length - 1].len > currLcp) {
      const top = stack.pop()!;
      const freq = i - top.startIdx;
      const len = Math.min(top.len, maxLength);
      if (freq >= minFrequency && len >= minLength) {
        const offset = sa[top.startIdx];
        const phrase = combinedStream.slice(offset, offset + len);
        if (!phrase.includes('$')) {
          const existing = candidateMap.get(phrase);
          if (!existing || freq > existing.frequency) {
            candidateMap.set(phrase, { phrase, frequency: freq, sampleGlobalOffset: offset });
          }
        }
      }
      startIdx = top.startIdx;
    }
    if (currLcp >= minLength && (stack.length === 0 || stack[stack.length - 1].len < currLcp)) {
      stack.push({ startIdx, len: currLcp });
    }
  }

  const rawList = Array.from(candidateMap.values()).sort(
    (a, b) => b.frequency - a.frequency || b.phrase.length - a.phrase.length,
  );
  const kept: typeof rawList = [];
  for (const item of rawList) {
    const shadowed = kept.some(
      (k) => k.frequency === item.frequency && k.phrase.includes(item.phrase),
    );
    if (!shadowed) kept.push(item);
    if (kept.length >= limit) break;
  }

  const phrases = kept.map((item) => {
    const slice = slices.find((s) => item.sampleGlobalOffset >= s.start && item.sampleGlobalOffset < s.end) ?? slices[0];
    const localStart = item.sampleGlobalOffset - slice.start;
    const localEnd = localStart + item.phrase.length;
    const occ = corpus.buildOccurrence(slice.book, localStart, localEnd, {
      evidenceTier: 'correspondencia_estrutural',
      parametersSummary: `suffix_array minLen=${minLength} maxLen=${maxLength} minFreq=${minFrequency}`,
      translationId: params.translationId,
    });
    return {
      phrase: item.phrase,
      length: item.phrase.length,
      frequency: item.frequency,
      sampleReference: occ.reference,
      sampleWords: occ.matchedWordsOriginal,
      sampleBoundaryType: occ.boundaryType,
      sampleVerseVocalized: occ.verseVocalized,
      sampleTranslationPt: occ.translationPt,
    };
  });

  const coveragePercent =
    totalScopeLetters > 0 ? Number(((analyzedPureLetters / totalScopeLetters) * 100).toFixed(2)) : 100;
  const isExhaustive = !truncatedCorpus && analyzedPureLetters >= totalScopeLetters;

  return {
    totalDiscovered: candidateMap.size,
    returnedCount: phrases.length,
    analyzedLetters: analyzedPureLetters,
    totalScopeLetters,
    coveragePercent,
    isExhaustive,
    analyzedBooks: slices.map((s) => s.book.ptTitle),
    truncatedCorpus,
    phrases,
    algorithmVersion: 'suffix_array_kasai_lcp@2.0.0',
    computationalLimits: isExhaustive
      ? `Varredura EXAUSTIVA (${coveragePercent}% do escopo: ${analyzedPureLetters.toLocaleString('pt-BR')} / ${totalScopeLetters.toLocaleString('pt-BR')} letras); comprimento ${minLength}..${maxLength}; frequência >= ${minFrequency}.`
      : `Varredura PARCIAL (${coveragePercent}% do escopo: ${analyzedPureLetters.toLocaleString('pt-BR')} / ${totalScopeLetters.toLocaleString('pt-BR')} letras, teto ${maxCap.toLocaleString('pt-BR')}); NÃO exaustiva.`,
  };
}

// ============================================================================
// 5. REPEATED VERSES, PARALLELS & LETTER-BY-LETTER COMPARISON
// ============================================================================
export interface DiffOp {
  op: 'eq' | 'del' | 'ins' | 'sub';
  a: string;
  b: string;
}

export function diffStringsLetterByLetter(a: string, b: string): DiffOp[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      ops.push({ op: 'eq', a: a[i - 1], b: b[j - 1] });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.push({ op: 'sub', a: a[i - 1], b: b[j - 1] });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ op: 'del', a: a[i - 1], b: '' });
      i--;
    } else {
      ops.push({ op: 'ins', a: '', b: b[j - 1] });
      j--;
    }
  }
  return ops.reverse();
}

export function findIdenticalVerses(
  corpus: TanakhCorpus,
  minLetters = 12,
  limit = 100,
  translationId?: string | null,
) {
  const clusters: Array<{
    hash: string;
    letterLength: number;
    count: number;
    stream: string;
    occurrences: Array<{
      book: string;
      slug: string;
      ptBook: string;
      chapter: number;
      verse: number;
      reference: string;
      verseVocalized: string;
      translationPt: string;
    }>;
  }> = [];

  for (const [hash, list] of corpus.verseHashes.entries()) {
    if (list.length < 2) continue;
    if (list[0].verseStream.length < minLetters) continue;
    clusters.push({
      hash,
      letterLength: list[0].verseStream.length,
      count: list.length,
      stream: list[0].verseStream,
      occurrences: list.map((item) => ({
        book: item.book,
        slug: item.slug,
        ptBook: item.ptBook,
        chapter: item.chapter,
        verse: item.verse,
        reference: `${item.ptBook} ${item.chapter}:${item.verse}`,
        verseVocalized: item.verseVocalized,
        translationPt: corpus.resolveVerseTranslation(item.slug, item.chapter, item.verse, translationId).text,
      })),
    });
  }

  clusters.sort((a, b) => b.count - a.count || b.letterLength - a.letterLength);
  return {
    totalClusters: clusters.length,
    clusters: clusters.slice(0, limit),
    algorithmVersion: 'verse_sha256_levenshtein@1.1.0',
  };
}

export function compareChapters(
  corpus: TanakhCorpus,
  left: { slug: string; chapter: number },
  right: { slug: string; chapter: number },
) {
  const bookA = corpus.bookBySlug.get(left.slug);
  const bookB = corpus.bookBySlug.get(right.slug);
  if (!bookA || !bookB) {
    throw new Error('Livro não encontrado para comparação.');
  }
  const versesA = bookA.verses.filter((v) => v.c === left.chapter);
  const versesB = bookB.verses.filter((v) => v.c === right.chapter);

  // Alinha melhor correspondencia por versiculo usando indice 1:1 e melhor similaridade Levenshtein
  const comparisons = versesA.map((va, idx) => {
    const streamA = bookA.stream.slice(va.s, va.e);
    let bestB = versesB[idx] ?? null;
    let bestSim = 0;
    let bestDist = streamA.length;

    // Se comprimento de capitulos diferir (ex: Sl 18 vs 2Sm 22), encontra o melhor paralelo dentro do capitulo B
    for (const vb of versesB) {
      const streamB = bookB.stream.slice(vb.s, vb.e);
      if (Math.abs(streamA.length - streamB.length) > Math.max(streamA.length, streamB.length) * 0.65) {
        continue;
      }
      const dist = levenshteinLetters(streamA, streamB);
      const maxLen = Math.max(streamA.length, streamB.length, 1);
      const sim = 1 - dist / maxLen;
      if (sim > bestSim) {
        bestSim = sim;
        bestDist = dist;
        bestB = vb;
      }
    }

    const chosenB = bestSim >= 0.45 && bestB ? bestB : versesB[idx] ?? null;
    const streamB = chosenB ? bookB.stream.slice(chosenB.s, chosenB.e) : '';
    const dist = chosenB ? levenshteinLetters(streamA, streamB) : streamA.length;
    const maxLen = Math.max(streamA.length, streamB.length, 1);
    const similarity = chosenB ? Number(((1 - dist / maxLen) * 100).toFixed(2)) : 0;

    return {
      leftRef: `${bookA.ptTitle} ${va.c}:${va.v}`,
      rightRef: chosenB ? `${bookB.ptTitle} ${chosenB.c}:${chosenB.v}` : '—',
      leftVocalized: va.voc,
      rightVocalized: chosenB?.voc ?? '',
      leftStream: streamA,
      rightStream: streamB,
      editDistance: dist,
      similarityPercent: similarity,
      identical: streamA === streamB && streamA.length > 0,
      diffOps: chosenB && streamA !== streamB && streamA.length <= 220 && streamB.length <= 220
        ? diffStringsLetterByLetter(streamA, streamB)
        : [],
    };
  });

  const avgSimilarity =
    comparisons.length > 0
      ? Number((comparisons.reduce((s, c) => s + c.similarityPercent, 0) / comparisons.length).toFixed(2))
      : 0;

  return {
    leftLabel: `${bookA.ptTitle} ${left.chapter}`,
    rightLabel: `${bookB.ptTitle} ${right.chapter}`,
    leftVerseCount: versesA.length,
    rightVerseCount: versesB.length,
    identicalCount: comparisons.filter((c) => c.identical).length,
    averageSimilarityPercent: avgSimilarity,
    comparisons,
    algorithmVersion: 'verse_sha256_levenshtein@1.0.0',
  };
}

// ============================================================================
// 6. INVERSIONS & PERMUTATIONS
// ============================================================================
export function analyzeInversionsAndPermutations(
  corpus: TanakhCorpus,
  params: {
    term: string;
    normalizeFinals?: boolean;
    includePermutations?: boolean;
    includeStreamSubstrings?: boolean;
    translationId?: string | null;
  },
) {
  const clean = normalizeConsonantal(params.term);
  const normalizeFinals = Boolean(params.normalizeFinals);
  const inverted = reverseLogical(clean, normalizeFinals);

  const classifyWord = (word: string) => {
    const key = normalizeFinals ? normalizeFinalLetters(word) : word;
    if (normalizeFinals) {
      const variants = corpus.lexiconFinalsNorm.get(key) ?? [];
      let totalCount = 0;
      let hasAramaic = false;
      let hasHebrew = false;
      let booksCount = 0;
      for (const v of variants) {
        const st = corpus.lexicon.get(v);
        if (st) {
          totalCount += st.count;
          if (st.hasAramaic) hasAramaic = true;
          if (st.hasHebrew) hasHebrew = true;
          booksCount = Math.max(booksCount, st.booksCount);
        }
      }
      return {
        form: word,
        attestedVariants: variants,
        lexiconCount: totalCount,
        booksCount,
        classification:
          totalCount === 0
            ? 'não_atestada_como_palavra'
            : hasAramaic && !hasHebrew
              ? 'aramaico_bíblico'
              : hasAramaic && hasHebrew
                ? 'hebraico_e_aramaico'
                : 'hebraico_bíblico',
      };
    }

    const st = corpus.lexicon.get(word);
    return {
      form: word,
      attestedVariants: st ? [word] : [],
      lexiconCount: st?.count ?? 0,
      booksCount: st?.booksCount ?? 0,
      classification: !st
        ? 'não_atestada_como_palavra'
        : st.hasAramaic && !st.hasHebrew
          ? 'aramaico_bíblico'
          : st.hasAramaic && st.hasHebrew
            ? 'hebraico_e_aramaico'
            : 'hebraico_bíblico',
    };
  };

  const originalInfo = classifyWord(clean);
  const invertedInfo = classifyWord(inverted);

  const invertedSearch = inverted
    ? searchContinuousStream(corpus, {
        query: inverted,
        normalizeFinals,
        boundaryFilter: params.includeStreamSubstrings ? 'all' : 'exact_word',
        pageSize: 25,
        translationId: params.translationId,
      })
    : null;

  let permutationsData: {
    truncated: boolean;
    totalTheoretical: number;
    attested: Array<ReturnType<typeof classifyWord>>;
    unattestedCount: number;
    sampleUnattested: string[];
  } | null = null;

  if (params.includePermutations && clean.length > 0) {
    const gen = generateUniquePermutations(normalizeFinals ? normalizeFinalLetters(clean) : clean, 7, 720);
    const attested: Array<ReturnType<typeof classifyWord>> = [];
    const sampleUnattested: string[] = [];
    let unattestedCount = 0;

    for (const perm of gen.permutations) {
      const info = classifyWord(perm);
      if (info.lexiconCount > 0) {
        attested.push(info);
      } else {
        unattestedCount++;
        if (sampleUnattested.length < 24) sampleUnattested.push(perm);
      }
    }
    attested.sort((a, b) => b.lexiconCount - a.lexiconCount);
    permutationsData = {
      truncated: gen.truncated,
      totalTheoretical: gen.totalTheoretical,
      attested,
      unattestedCount,
      sampleUnattested,
    };
  }

  return {
    original: originalInfo,
    inverted: invertedInfo,
    invertedSampleOccurrences: invertedSearch?.occurrences ?? [],
    invertedTotalStreamHits: invertedSearch?.totalCount ?? 0,
    permutations: permutationsData,
    algorithmVersion: 'inversions_permutations@1.1.0',
    computationalLimits: 'Permutações limitadas a palavras <= 7 letras (máx. 720 arranjos únicos) com validação integral no léxico do Tanakh.',
  };
}

// ============================================================================
// 7. EXPERIMENTAL PHONETIC SEARCH (LEXICON + CONTINUOUS CROSS-WORD STREAM)
// ============================================================================
export function experimentalPhoneticSearch(
  corpus: TanakhCorpus,
  params: {
    term: string;
    activeRuleIds: string[];
    maxCost?: number;
    limit?: number;
    mode?: 'lexicon' | 'continuous' | 'both';
    division?: string;
    bookSlug?: string;
    translationId?: string | null;
  },
) {
  const clean = normalizeConsonantal(params.term);
  const maxCost = Math.min(2.5, Math.max(0.2, params.maxCost ?? 1.2));
  const limit = Math.min(100, Math.max(10, params.limit ?? 50));
  const mode = params.mode ?? 'lexicon';
  const ruleSet = new Set(params.activeRuleIds);

  if (!clean) {
    return {
      query: '',
      mode,
      activeRules: [] as typeof PHONETIC_RULES,
      availableRules: PHONETIC_RULES,
      totalLexiconCandidates: 0,
      matches: [],
      continuousTotalCandidates: 0,
      continuousExactCount: 0,
      continuousApproximateCount: 0,
      continuousMatches: [] as OccurrenceResult[],
      disclaimer: 'Hipóteses fonéticas experimentais: transformações e custos registrados explicitamente; nunca exibidas como ocorrências exatas.',
      algorithmVersion: 'phonetic_weighted_edit@2.0.0',
    };
  }

  // 1) Busca no Lexico (palavras isoladas)
  const candidates: Array<{
    word: string;
    cost: number;
    editDistance: number;
    transformations: string[];
    lexiconCount: number;
    booksCount: number;
    language: string;
    matchType: 'exact_consonantal' | 'phonetic_approximation';
  }> = [];

  if (mode === 'lexicon' || mode === 'both') {
    const hasExpansionRules = PHONETIC_RULES.some(
      (r) => ruleSet.has(r.id) && r.pair[0].length !== r.pair[1].length,
    );
    const maxLenDelta = Math.ceil(maxCost) + (hasExpansionRules ? 2 : 0);

    for (const [word, stat] of corpus.lexicon.entries()) {
      if (Math.abs(word.length - clean.length) > maxLenDelta) continue;
      const res = weightedPhoneticDistance(clean, word, ruleSet);
      if (res.cost <= maxCost) {
        candidates.push({
          word,
          cost: res.cost,
          editDistance: res.editDistance,
          transformations: res.transformations,
          lexiconCount: stat.count,
          booksCount: stat.booksCount,
          language: stat.hasAramaic && !stat.hasHebrew ? 'Aramaico Bíblico' : 'Hebraico Bíblico',
          matchType: res.cost === 0 ? 'exact_consonantal' : 'phonetic_approximation',
        });
      }
    }
    candidates.sort((a, b) => a.cost - b.cost || b.lexiconCount - a.lexiconCount);
  }

  const topCandidates = candidates.slice(0, limit);
  const enriched = topCandidates.map((cand) => {
    const sample = searchContinuousStream(corpus, {
      query: cand.word,
      boundaryFilter: 'exact_word',
      pageSize: 2,
      translationId: params.translationId,
    });
    return {
      ...cand,
      evidenceTier: cand.cost === 0 ? 'evidencia_textual' : 'hipotese_fonetica',
      sampleOccurrences: sample.occurrences,
    };
  });

  // 2) Busca no Stream Continuo (atravessa limites de palavras e versiculos)
  let continuousMatches: OccurrenceResult[] = [];
  let continuousTotalCandidates = 0;
  let continuousExactCount = 0;
  let continuousApproximateCount = 0;

  if (mode === 'continuous' || mode === 'both') {
    const qChars = [...normalizeFinalLetters(clean)];
    const m = qChars.length;

    // Precomputa conjunto de caracteres compativeis e custo minimo se ausente para poda admissivel O(1)
    const compatByPos: Array<Set<string>> = qChars.map((ch) => new Set([ch]));
    const minSubCostByPos: number[] = new Array(m).fill(1.0);
    const minElisionByPos: number[] = new Array(m).fill(1.0);

    for (const rule of PHONETIC_RULES) {
      if (!ruleSet.has(rule.id)) continue;
      const [r1, r2] = rule.pair;
      for (let p = 0; p < m; p++) {
        const qch = qChars[p];
        if (r1 === qch && r2 === '') {
          minElisionByPos[p] = Math.min(minElisionByPos[p], rule.cost);
        } else if (r2 === qch && r1 === '') {
          minElisionByPos[p] = Math.min(minElisionByPos[p], rule.cost);
        } else if (r1.length === 1 && r2.length === 1) {
          if (r1 === qch) {
            compatByPos[p].add(r2);
            minSubCostByPos[p] = Math.min(minSubCostByPos[p], rule.cost);
          } else if (r2 === qch) {
            compatByPos[p].add(r1);
            minSubCostByPos[p] = Math.min(minSubCostByPos[p], rule.cost);
          }
        } else if (r1.length > 0 && r2.length > 0) {
          // Para regras 1:N (ex: ו <-> וו), ambos os caracteres individuais contam como compativeis na poda
          if (r1 === qch) {
            for (const c of r2) compatByPos[p].add(c);
            minSubCostByPos[p] = Math.min(minSubCostByPos[p], rule.cost);
          } else if (r2.includes(qch)) {
            for (const c of r1) compatByPos[p].add(c);
            minSubCostByPos[p] = Math.min(minSubCostByPos[p], rule.cost);
          }
        }
      }
    }

    const minMissCostByPos = qChars.map((_, p) => Math.min(1.0, minSubCostByPos[p], minElisionByPos[p]));
    const maxDel = Math.floor(maxCost / 0.45);
    const minWinLen = Math.max(2, m - maxDel);
    const maxWinLen = m + Math.floor(maxCost / 0.25);

    const books = corpus.getBooksByScope({ division: params.division, bookSlug: params.bookSlug });
    const rawStreamHits: Array<{
      book: BookData;
      start: number;
      end: number;
      cost: number;
      editDistance: number;
      transformations: string[];
      matchType: 'exact_consonantal' | 'phonetic_approximation';
    }> = [];

    // Tabela de frequencia deslizante em codigo Unicode hebraico (0x05D0..0x05EA => 0..26)
    const charCounts = new Int32Array(32);
    const toIdx = (code: number) => code - 0x05d0;

    for (const book of books) {
      const stream = book.stream;
      const normStream = book.streamFinalsNorm;
      const N = stream.length;
      if (N < minWinLen) continue;

      let lastAcceptedEnd = -1;
      for (let start = 0; start <= N - minWinLen; start++) {
        // Poda admissivel sobre a janela maxima [start, start + maxWinLen)
        charCounts.fill(0);
        const outerEnd = Math.min(N, start + maxWinLen);
        for (let t = start; t < outerEnd; t++) {
          const ci = toIdx(normStream.charCodeAt(t));
          if (ci >= 0 && ci < 27) charCounts[ci]++;
        }

        let lowerBound = 0;
        for (let p = 0; p < m; p++) {
          let found = false;
          for (const allowed of compatByPos[p]) {
            const ci = toIdx(allowed.charCodeAt(0));
            if (ci >= 0 && ci < 27 && charCounts[ci] > 0) {
              found = true;
              break;
            }
          }
          if (!found) {
            lowerBound += minMissCostByPos[p];
            if (lowerBound > maxCost + 1e-9) break;
          }
        }
        if (lowerBound > maxCost + 1e-9) continue;

        let bestForStart: { end: number; cost: number; editDistance: number; transformations: string[] } | null = null;
        for (let len = minWinLen; len <= maxWinLen && start + len <= N; len++) {
          const cand = stream.slice(start, start + len);
          const res = weightedPhoneticDistance(clean, cand, ruleSet);
          if (res.cost <= maxCost) {
            if (
              !bestForStart ||
              res.cost < bestForStart.cost - 1e-9 ||
              (Math.abs(res.cost - bestForStart.cost) <= 1e-9 &&
                Math.abs(len - m) < Math.abs(bestForStart.end - start - m))
            ) {
              bestForStart = {
                end: start + len,
                cost: res.cost,
                editDistance: res.editDistance,
                transformations: res.transformations,
              };
            }
          }
        }

        if (bestForStart) {
          // Evita repeticao redundante dentro do mesmo intervalo imediato quando já existe match com custo melhor/igual
          if (start < lastAcceptedEnd && rawStreamHits.length > 0 && rawStreamHits[rawStreamHits.length - 1].book.slug === book.slug) {
            const prev = rawStreamHits[rawStreamHits.length - 1];
            if (bestForStart.cost < prev.cost - 1e-9) {
              prev.start = start;
              prev.end = bestForStart.end;
              prev.cost = bestForStart.cost;
              prev.editDistance = bestForStart.editDistance;
              prev.transformations = bestForStart.transformations;
              prev.matchType = bestForStart.cost === 0 ? 'exact_consonantal' : 'phonetic_approximation';
              lastAcceptedEnd = bestForStart.end;
            }
            continue;
          }
          const mt = bestForStart.cost === 0 ? 'exact_consonantal' : 'phonetic_approximation';
          rawStreamHits.push({
            book,
            start,
            end: bestForStart.end,
            cost: bestForStart.cost,
            editDistance: bestForStart.editDistance,
            transformations: bestForStart.transformations,
            matchType: mt,
          });
          lastAcceptedEnd = bestForStart.end;
          if (rawStreamHits.length >= 4000) break;
        }
      }
      if (rawStreamHits.length >= 4000) break;
    }

    continuousTotalCandidates = rawStreamHits.length;
    for (const h of rawStreamHits) {
      if (h.matchType === 'exact_consonantal') continuousExactCount++;
      else continuousApproximateCount++;
    }

    rawStreamHits.sort((a, b) => a.cost - b.cost || a.start - b.start);
    const paramSummary = `fonetica_continua="${clean}" | maxCost=${maxCost} | regras=[${Array.from(ruleSet).join(',')}]`;
    continuousMatches = rawStreamHits.slice(0, limit).map((h) =>
      corpus.buildOccurrence(h.book, h.start, h.end, {
        evidenceTier: h.matchType === 'exact_consonantal' ? 'evidencia_textual' : 'hipotese_fonetica',
        parametersSummary: paramSummary,
        transformationLog: h.transformations,
        cost: h.cost,
        distance: h.editDistance,
        translationId: params.translationId,
        matchType: h.matchType,
      }),
    );
  }

  return {
    query: clean,
    mode,
    activeRules: PHONETIC_RULES.filter((r) => ruleSet.has(r.id)),
    availableRules: PHONETIC_RULES,
    totalLexiconCandidates: candidates.length,
    matches: enriched,
    continuousTotalCandidates,
    continuousExactCount,
    continuousApproximateCount,
    continuousMatches,
    disclaimer:
      'Hipóteses fonéticas experimentais: correspondências consonantais exatas (custo 0) são separadas explicitamente de aproximações fonéticas com transformações registradas.',
    algorithmVersion: 'phonetic_weighted_edit@2.0.0',
  };
}

// ============================================================================
// 8. IDENTITY DECLARATIONS & INDEPENDENT LABORATORIES
// ============================================================================
export const IDENTITY_INITIAL_VOCABULARY = [
  { term: 'אני', label: 'ani (eu)' },
  { term: 'אנכי', label: 'anokhi (eu)' },
  { term: 'אני אני', label: 'ani ani (eu, eu)' },
  { term: 'אנכי אנכי', label: 'anokhi anokhi (eu, eu)' },
  { term: 'אני הוא', label: 'ani hu (eu sou Ele)' },
  { term: 'אני אני הוא', label: 'ani ani hu (eu, eu sou Ele)' },
  { term: 'הנני', label: 'hineni (eis-me aqui)' },
  { term: 'הנני אני', label: 'hineni ani' },
  { term: 'אהיה', label: 'ehyeh' },
  { term: 'אהיה אשר אהיה', label: 'ehyeh asher ehyeh' },
  { term: 'יהוה', label: 'YHWH (Tetragrama)' },
  { term: 'יה', label: 'Yah' },
  { term: 'יהו', label: 'Yahu / Yeho' },
  { term: 'שמי', label: 'shemi (meu nome)' },
  { term: 'שמו', label: 'shemo (seu nome)' },
  { term: 'אחד', label: 'echad (um)' },
  { term: 'אל שדי', label: 'El Shaddai' },
];

export interface LaboratoryDef {
  id: string;
  title: string;
  description: string;
  terms: Array<{ he: string; pt: string }>;
}

export const LABORATORIES: LaboratoryDef[] = [
  {
    id: 'misterio',
    title: 'Mistério e Revelação',
    description: 'Vocabulário de segredo, interpretação, maravilha, entendimento e coração.',
    terms: [
      { he: 'רז', pt: 'mistério' },
      { he: 'סוד', pt: 'segredo' },
      { he: 'גל', pt: 'desvendar' },
      { he: 'גלה', pt: 'revelar' },
      { he: 'פלא', pt: 'maravilha' },
      { he: 'פשר', pt: 'interpretação' },
      { he: 'בינה', pt: 'entendimento' },
      { he: 'דעת', pt: 'conhecimento' },
      { he: 'רעיון', pt: 'pensamento' },
      { he: 'לבב', pt: 'coração' },
    ],
  },
  {
    id: 'identidade',
    title: 'Identidade',
    description: 'Núcleo pronominal e declarações nominais de presença e ser.',
    terms: [
      { he: 'אני', pt: 'eu' },
      { he: 'אנכי', pt: 'eu (enfático)' },
      { he: 'הוא', pt: 'ele' },
      { he: 'הנני', pt: 'eis-me aqui' },
      { he: 'אהיה', pt: 'serei / sou' },
      { he: 'יהוה', pt: 'YHWH' },
    ],
  },
  {
    id: 'pai_filho_pedra',
    title: 'Pai, Filho e Pedra',
    description: 'Relações lexicais consonantais entre אב, בן, אבן e אביון.',
    terms: [
      { he: 'אב', pt: 'pai' },
      { he: 'בן', pt: 'filho' },
      { he: 'אבן', pt: 'pedra' },
      { he: 'אביון', pt: 'necessitado' },
    ],
  },
  {
    id: 'direita_acusacao',
    title: 'Direita e Acusação',
    description: 'Eixo de posição jurídica/espacial: direita e adversário/acusador.',
    terms: [
      { he: 'ימין', pt: 'direita' },
      { he: 'ימיני', pt: 'minha direita' },
      { he: 'ימינו', pt: 'sua direita' },
      { he: 'שטן', pt: 'adversário / acusador' },
    ],
  },
  {
    id: 'pastor_salvacao_shaddai_ventre',
    title: 'Pastor, Salvação, Shaddai e Ventre',
    description: 'Agrupamento consonantal de cuidado pastoral, livramento, Shaddai e ventre.',
    terms: [
      { he: 'רעה', pt: 'pastor / apascentar' },
      { he: 'רעי', pt: 'meu pastor / pastor' },
      { he: 'ישועה', pt: 'salvação' },
      { he: 'יהושע', pt: 'Josué' },
      { he: 'מושיע', pt: 'salvador' },
      { he: 'אל', pt: 'El / Deus' },
      { he: 'שדי', pt: 'Shaddai' },
      { he: 'שדים', pt: 'seios / peitos' },
      { he: 'רחם', pt: 'útero / compaixão' },
      { he: 'בטן', pt: 'ventre' },
    ],
  },
];

export function analyzeIdentityDeclarations(corpus: TanakhCorpus, translationId?: string | null) {
  const summary = IDENTITY_INITIAL_VOCABULARY.map((item) => {
    const clean = item.term.split(' ').map(normalizeConsonantal).join('');
    const search = searchContinuousStream(corpus, {
      query: clean,
      boundaryFilter: item.term.includes(' ') ? 'multi_word' : 'exact_word',
      pageSize: 8,
      translationId,
    });
    return {
      term: item.term,
      streamPattern: clean,
      label: item.label,
      exactCount: search.totalCount,
      sampleOccurrences: search.occurrences,
    };
  });

  // Descoberta automatica de bigramas/trigramas frequentes com אני, אנכי, יהוה
  const triggers = new Set(['אני', 'אנכי', 'אהיה', 'הנני']);
  const discoveredBigrams = new Map<string, { phrase: string; voc: string; count: number; sampleRef: string }>();

  for (const book of corpus.books) {
    for (let i = 0; i < book.words.length - 1; i++) {
      const w1 = book.words[i];
      if (!triggers.has(w1.cons)) continue;
      const w2 = book.words[i + 1];
      if (w1.chapter !== w2.chapter || w1.verse !== w2.verse) continue;
      const key = `${w1.cons} ${w2.cons}`;
      const prev = discoveredBigrams.get(key) ?? {
        phrase: key,
        voc: `${w1.voc} ${w2.voc}`,
        count: 0,
        sampleRef: `${book.ptTitle} ${w1.chapter}:${w1.verse}`,
      };
      prev.count++;
      discoveredBigrams.set(key, prev);
    }
  }

  // Diferencas massoreticas (Ketiv/Qere) envolvendo termos de identidade ou Tetragrama
  const masoreticIdentityDiffs: Array<{
    reference: string;
    ketiv: string;
    qere: string;
    type: string;
    verseVocalized: string;
  }> = [];

  for (const book of corpus.books) {
    for (const diff of book.masoreticDiffs) {
      for (const item of diff.items) {
        const kClean = normalizeConsonantal(item.ketiv);
        const qClean = normalizeConsonantal(item.qere);
        if (
          kClean.includes('יהוה') ||
          qClean.includes('יהוה') ||
          kClean === 'אני' ||
          qClean === 'אני' ||
          kClean === 'הוא' ||
          qClean === 'הוא' ||
          kClean === 'שמו' ||
          qClean === 'שמו'
        ) {
          const vr = book.verses.find((v) => v.c === diff.chapter && v.v === diff.verse);
          masoreticIdentityDiffs.push({
            reference: `${book.ptTitle} ${diff.chapter}:${diff.verse}`,
            ketiv: item.ketiv,
            qere: item.qere,
            type: item.type,
            verseVocalized: vr?.voc ?? '',
          });
        }
      }
    }
  }

  return {
    vocabulary: summary,
    autoDiscoveredFormulas: Array.from(discoveredBigrams.values())
      .filter((d) => d.count >= 4)
      .sort((a, b) => b.count - a.count)
      .slice(0, 35),
    masoreticDiffs: masoreticIdentityDiffs.slice(0, 40),
    totalMasoreticDiffsMatched: masoreticIdentityDiffs.length,
    note: 'Locutores e destinatários nunca são atribuídos automaticamente pelo motor; exija leitura do contexto integral antes de anotar hipóteses no caderno.',
  };
}

export function runLaboratories(
  corpus: TanakhCorpus,
  params: {
    selectedLabIds: string[];
    enableCrossings?: boolean;
    division?: string;
    bookSlug?: string;
    translationId?: string | null;
  },
) {
  const selectedLabs = LABORATORIES.filter((l) => params.selectedLabIds.includes(l.id));
  const activeLabs = selectedLabs.length > 0 ? selectedLabs : [LABORATORIES[0]];
  const books = corpus.getBooksByScope({ division: params.division, bookSlug: params.bookSlug });

  // Mapeamento palavra exata -> labs
  const termToLabs = new Map<string, Array<{ labId: string; labTitle: string; pt: string }>>();
  for (const lab of activeLabs) {
    for (const t of lab.terms) {
      const arr = termToLabs.get(t.he) ?? [];
      arr.push({ labId: lab.id, labTitle: lab.title, pt: t.pt });
      termToLabs.set(t.he, arr);
    }
  }

  const labStats: Record<string, Record<string, { he: string; pt: string; count: number; sampleRefs: string[] }>> = {};
  for (const lab of activeLabs) {
    labStats[lab.id] = {};
    for (const t of lab.terms) {
      labStats[lab.id][t.he] = { he: t.he, pt: t.pt, count: 0, sampleRefs: [] };
    }
  }

  const crossings: Array<{
    reference: string;
    slug: string;
    chapter: number;
    verse: number;
    matchedSegments: Array<{ labId: string; labTitle: string; term: string; pt: string; wordVocalized: string }>;
    verseVocalized: string;
    translationPt: string;
  }> = [];

  // Grafo de co-ocorrencia entre termos dentro do mesmo versiculo
  const edgeWeights = new Map<string, number>();
  const nodeCounts = new Map<string, { id: string; label: string; labId: string; count: number }>();

  for (const book of books) {
    // Agrupar palavras por versiculo
    let wIdx = 0;
    for (const vr of book.verses) {
      const verseHits: Array<{ labId: string; labTitle: string; term: string; pt: string; voc: string }> = [];
      while (wIdx < book.words.length && (book.words[wIdx].chapter < vr.c || (book.words[wIdx].chapter === vr.c && book.words[wIdx].verse < vr.v))) {
        wIdx++;
      }
      while (wIdx < book.words.length && book.words[wIdx].chapter === vr.c && book.words[wIdx].verse === vr.v) {
        const w = book.words[wIdx];
        const mappings = termToLabs.get(w.cons);
        if (mappings) {
          for (const m of mappings) {
            const st = labStats[m.labId][w.cons];
            st.count++;
            if (st.sampleRefs.length < 5) {
              const ref = `${book.ptTitle} ${vr.c}:${vr.v}`;
              if (!st.sampleRefs.includes(ref)) st.sampleRefs.push(ref);
            }
            verseHits.push({ labId: m.labId, labTitle: m.labTitle, term: w.cons, pt: m.pt, voc: w.voc });
            const nKey = `${m.labId}:${w.cons}`;
            const prevNode = nodeCounts.get(nKey) ?? { id: nKey, label: `${w.cons} (${m.pt})`, labId: m.labId, count: 0 };
            prevNode.count++;
            nodeCounts.set(nKey, prevNode);
          }
        }
        wIdx++;
      }

      if (verseHits.length >= 2) {
        // Edges de co-ocorrencia no versiculo
        const uniqueNodes = Array.from(new Set(verseHits.map((h) => `${h.labId}:${h.term}`))).sort();
        for (let a = 0; a < uniqueNodes.length; a++) {
          for (let b = a + 1; b < uniqueNodes.length; b++) {
            const ek = `${uniqueNodes[a]}|${uniqueNodes[b]}`;
            edgeWeights.set(ek, (edgeWeights.get(ek) ?? 0) + 1);
          }
        }

        // Cruzamentos (versiculos com >= 2 termos distintos ou >= 2 labs selecionados)
        const distinctTerms = new Set(verseHits.map((h) => h.term));
        const distinctLabs = new Set(verseHits.map((h) => h.labId));
        const passesCrossing =
          params.enableCrossings &&
          ((activeLabs.length > 1 && distinctLabs.size >= 2) || (activeLabs.length === 1 && distinctTerms.size >= 2));

        if (passesCrossing && crossings.length < 150) {
          const tr = corpus.resolveVerseTranslation(book.slug, vr.c, vr.v, params.translationId);
          crossings.push({
            reference: `${book.ptTitle} ${vr.c}:${vr.v}`,
            slug: book.slug,
            chapter: vr.c,
            verse: vr.v,
            matchedSegments: verseHits.map((h) => ({
              labId: h.labId,
              labTitle: h.labTitle,
              term: h.term,
              pt: h.pt,
              wordVocalized: h.voc,
            })),
            verseVocalized: vr.voc,
            translationPt: tr.text,
          });
        }
      }
    }
  }

  const graphNodes = Array.from(nodeCounts.values()).sort((a, b) => b.count - a.count);
  const graphEdges = Array.from(edgeWeights.entries())
    .map(([key, weight]) => {
      const [source, target] = key.split('|');
      return { source, target, weight };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 60);

  return {
    laboratories: activeLabs.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description,
      terms: Object.values(labStats[l.id]),
    })),
    crossings,
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
    },
    note: 'Segmentos preservados de forma independente sem fundir termos ou atribuir equivalência semântica automática.',
  };
}

// ============================================================================
// 9. ACCEPTANCE TESTS & SECTION 14 VALIDATION CASES
// ============================================================================
export function runValidationSuite(corpus: TanakhCorpus) {
  const acceptanceTests: Array<{ name: string; passed: boolean; details: string }> = [];

  // 1. Regex consonantal estrita + soma de comprimentos + monotonicidade em todos os 39 livros
  const streamRegexOk = corpus.books.every((b) => /^[\u05D0-\u05EA]+$/.test(b.stream));
  const lengthSumOk = corpus.books.every((b) => {
    const sum = b.verses.reduce((acc, v) => acc + (v.e - v.s), 0);
    return sum === b.stream.length;
  });
  const monotonicOk = corpus.books.every((b) => {
    let prev = 0;
    for (const [, , s, e] of b.refs) {
      if (s !== prev || e < s) return false;
      prev = e;
    }
    return prev === b.stream.length;
  });

  acceptanceTests.push({
    name: 'Corpus integral validado (39 livros / 24 tradicionais)',
    passed: corpus.books.length === 39,
    details: `${corpus.books.length}/39 livros canônicos carregados (${corpus.manifest.totals.verses.toLocaleString()} versículos, ${corpus.manifest.totals.letters.toLocaleString()} letras).`,
  });
  acceptanceTests.push({
    name: 'Stream puro ^[\\u05D0-\\u05EA]+$ sem separadores internos',
    passed: streamRegexOk && lengthSumOk && monotonicOk,
    details: `Regex consonantal=${streamRegexOk}, Soma de versículos=${lengthSumOk}, Offsets monotônicos=${monotonicOk}.`,
  });

  // 2. Paridade busca ingenua vs motor (amostra de termos)
  const paritySamples = [
    { slug: 'genesis', term: 'בראשית' },
    { slug: 'deuteronomy', term: 'אניאניהוא' },
    { slug: 'isaiah', term: 'קדושקדושקדוש' },
    { slug: 'exodus', term: 'יהוהיהוה' },
  ];
  let parityPassed = true;
  const parityNotes: string[] = [];
  for (const s of paritySamples) {
    const book = corpus.bookBySlug.get(s.slug)!;
    // Busca ingenua direta no stream
    let naiveCount = 0;
    let idx = book.stream.indexOf(s.term);
    while (idx !== -1) {
      naiveCount++;
      idx = book.stream.indexOf(s.term, idx + 1);
    }
    const engineRes = searchContinuousStream(corpus, { query: s.term, bookSlug: s.slug });
    if (naiveCount !== engineRes.totalCount) parityPassed = false;
    parityNotes.push(`${book.ptTitle}:${s.term}=${engineRes.totalCount}`);
  }
  acceptanceTests.push({
    name: 'Paridade busca ingênua vs motor determinístico',
    passed: parityPassed,
    details: parityNotes.join(' · '),
  });

  // 3. Secao 14 Casos de Validacao
  const verifyVerseContains = (slug: string, chapter: number, verse: number, expectedStreamFragment: string) => {
    const book = corpus.bookBySlug.get(slug);
    if (!book) return { ok: false, ref: `${slug} ${chapter}:${verse}`, actual: '' };
    const vr = book.verses.find((v) => v.c === chapter && v.v === verse);
    if (!vr) return { ok: false, ref: `${book.ptTitle} ${chapter}:${verse}`, actual: '' };
    const vStream = book.stream.slice(vr.s, vr.e);
    return {
      ok: vStream.includes(expectedStreamFragment),
      ref: `${book.ptTitle} ${chapter}:${verse}`,
      actual: vr.voc,
    };
  };

  const c1 = verifyVerseContains('deuteronomy', 32, 39, 'אניאניהוא');
  const c2 = verifyVerseContains('isaiah', 43, 11, 'אנכיאנכייהוה');
  const c3a = verifyVerseContains('isaiah', 43, 25, 'אנכיאנכיהוא');
  const c3b = verifyVerseContains('isaiah', 51, 12, 'אנכיאנכיהוא');
  const c4 = verifyVerseContains('exodus', 34, 6, 'יהוהיהוה');
  const c5a = verifyVerseContains('genesis', 3, 13, 'מהזאתעשית');
  const c5b = verifyVerseContains('genesis', 12, 18, 'מהזאתעשית');
  const c5c = verifyVerseContains('genesis', 26, 10, 'מהזאתעשית');
  const c6 = verifyVerseContains('isaiah', 6, 3, 'קדושקדושקדוש');
  const c7 = verifyVerseContains('jeremiah', 22, 29, 'ארץארץארץ');

  // Paralelos Sl 14/53 e Sl 18/2Sm 22
  const cmp14_53 = compareChapters(corpus, { slug: 'psalms', chapter: 14 }, { slug: 'psalms', chapter: 53 });
  const cmp18_2sm22 = compareChapters(corpus, { slug: 'psalms', chapter: 18 }, { slug: 'ii_samuel', chapter: 22 });

  // Gn 49:24-25 Pastor, Pedra, Pai, Shaddai
  const gn = corpus.bookBySlug.get('genesis')!;
  const gn49_24 = gn.verses.find((v) => v.c === 49 && v.v === 24)!;
  const gn49_25 = gn.verses.find((v) => v.c === 49 && v.v === 25)!;
  const gn49_stream = gn.stream.slice(gn49_24.s, gn49_25.e);
  const gn49_ok = ['רעה', 'אבן', 'אביך', 'שדי'].every((t) => gn49_stream.includes(t));

  // Sl 109:6,31 direita e acusacao
  const ps = corpus.bookBySlug.get('psalms')!;
  const ps109_6 = ps.verses.find((v) => v.c === 109 && v.v === 6)!;
  const ps109_31 = ps.verses.find((v) => v.c === 109 && v.v === 31)!;
  const ps109_ok =
    ps.stream.slice(ps109_6.s, ps109_6.e).includes('ימינו') &&
    ps.stream.slice(ps109_6.s, ps109_6.e).includes('ושטן') &&
    ps.stream.slice(ps109_31.s, ps109_31.e).includes('לימין');

  const validationCases = [
    { id: 'dt-32-39', label: 'Dt 32:39 — אני אני הוא', passed: c1.ok, reference: c1.ref, snippet: c1.actual },
    { id: 'is-43-11', label: 'Is 43:11 — אנכי אנכי יהוה', passed: c2.ok, reference: c2.ref, snippet: c2.actual },
    { id: 'is-43-25-51-12', label: 'Is 43:25 e 51:12 — אנכי אנכי הוא', passed: c3a.ok && c3b.ok, reference: `${c3a.ref} · ${c3b.ref}`, snippet: c3a.actual },
    { id: 'ex-34-6', label: 'Ex 34:6 — יהוה יהוה', passed: c4.ok, reference: c4.ref, snippet: c4.actual },
    { id: 'gn-mah-zot', label: 'Gn 3:13, 12:18, 26:10 — מה זאת עשית', passed: c5a.ok && c5b.ok && c5c.ok, reference: `${c5a.ref} · ${c5b.ref} · ${c5c.ref}`, snippet: c5a.actual },
    { id: 'is-6-3', label: 'Is 6:3 — קדוש קדוש קדוש', passed: c6.ok, reference: c6.ref, snippet: c6.actual },
    { id: 'jr-22-29', label: 'Jr 22:29 — ארץ ארץ ארץ', passed: c7.ok, reference: c7.ref, snippet: c7.actual },
    { id: 'sl-14-53', label: 'Salmos 14 / Salmos 53 (paralelos)', passed: cmp14_53.averageSimilarityPercent > 65, reference: 'Sl 14 ↔ Sl 53', snippet: `Similaridade média: ${cmp14_53.averageSimilarityPercent}%` },
    { id: 'sl-18-2sm-22', label: 'Salmos 18 / II Samuel 22 (paralelos)', passed: cmp18_2sm22.averageSimilarityPercent > 75, reference: 'Sl 18 ↔ II Sm 22', snippet: `Similaridade média: ${cmp18_2sm22.averageSimilarityPercent}%` },
    { id: 'gn-49-24-25', label: 'Gn 49:24–25 — Pastor, Pedra, Pai e Shaddai', passed: gn49_ok, reference: 'Gênesis 49:24–25', snippet: gn49_24.voc },
    { id: 'sl-109-6-31', label: 'Sl 109:6,31 — Direita e Acusação', passed: ps109_ok, reference: 'Salmos 109:6, 31', snippet: `${ps109_6.voc} | ${ps109_31.voc}` },
  ];

  return {
    allPassed: acceptanceTests.every((t) => t.passed) && validationCases.every((c) => c.passed),
    acceptanceTests,
    validationCases,
    algorithmVersions: ENGINE_VERSIONS,
  };
}

// ============================================================================
// 10. LABORATÓRIO MASSORÉTICO (§12) — SINAIS E VOCALIZAÇÕES DO TETRAGRAMA
// ============================================================================
export interface MasoreticSignDef {
  id: string;
  label: string;
  hebrewExample: string;
  category: 'vogal' | 'diacritico' | 'separador' | 'cantilacao';
  description: string;
}

export const MASORETIC_SIGN_DEFS: MasoreticSignDef[] = [
  { id: 'holam', label: 'Holam (חולם)', hebrewExample: 'בֹ / בֹּ', category: 'vogal', description: 'Ponto vocálico superior (U+05B9 / U+05BA)' },
  { id: 'shuruk', label: 'Shuruk (שורוק)', hebrewExample: 'וּ', category: 'vogal', description: 'Vav com ponto medial (וּ) sem vogal subscrita' },
  { id: 'qamats', label: 'Qamats / Qamats Qatan (קמץ)', hebrewExample: 'בָ / בׇ', category: 'vogal', description: 'Sinal massorético U+05B8 / U+05C7' },
  { id: 'patach', label: 'Patach (פתח)', hebrewExample: 'בַ', category: 'vogal', description: 'Vogal breve subscrita (U+05B7)' },
  { id: 'segol', label: 'Segol (סגול)', hebrewExample: 'בֶ', category: 'vogal', description: 'Três pontos em triângulo invertido (U+05B6)' },
  { id: 'tzere', label: 'Tzere (צירי)', hebrewExample: 'בֵ', category: 'vogal', description: 'Dois pontos horizontais (U+05B5)' },
  { id: 'hiriq', label: 'Hiriq (חיריק)', hebrewExample: 'בִ', category: 'vogal', description: 'Ponto subscrito único (U+05B4)' },
  { id: 'kubutz', label: 'Kubutz (קובוץ)', hebrewExample: 'בֻ', category: 'vogal', description: 'Três pontos diagonais subscritos (U+05BB)' },
  { id: 'sheva', label: 'Sheva (שווא)', hebrewExample: 'בְ', category: 'vogal', description: 'Dois pontos verticais subscritos (U+05B0)' },
  { id: 'hataf', label: 'Hatafim (חטפים)', hebrewExample: 'אֱ / אֲ / אֳ', category: 'vogal', description: 'Semivogais reduzidas (U+05B1..U+05B3)' },
  { id: 'dagesh', label: 'Dagesh / Mapiq (דגש)', hebrewExample: 'בּ / הּ', category: 'diacritico', description: 'Ponto interno consonantal (U+05BC fora de shuruk)' },
  { id: 'shin_sin_dot', label: 'Pontos Shin / Sin', hebrewExample: 'שׁ / שׂ', category: 'diacritico', description: 'Distinção šin/śin (U+05C1 / U+05C2)' },
  { id: 'maqaf', label: 'Maqaf (מקף)', hebrewExample: 'כָּל־הָאָרֶץ', category: 'separador', description: 'Hífen massorético de ligação prosódica (U+05BE)' },
  { id: 'paseq', label: 'Paseq (פסק)', hebrewExample: 'אֱלֹהִים ׀', category: 'separador', description: 'Barra vertical separadora massorética (U+05C0)' },
  { id: 'teamim', label: "Te'amim (טעמים)", hebrewExample: 'בְּרֵאשִׁ֖ית', category: 'cantilacao', description: 'Sinais massoréticos de cantilação (U+0591..U+05AF)' },
];

function stripHtmlPlain(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&thinsp;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasMasoreticSign(token: string, signId: string): boolean {
  switch (signId) {
    case 'holam':
      return /[\u05B9\u05BA]/.test(token);
    case 'shuruk':
      return /\u05D5\u05BC(?![\u05B0-\u05BB\u05C7])/.test(token);
    case 'qamats':
      return /[\u05B8\u05C7]/.test(token);
    case 'patach':
      return /\u05B7/.test(token);
    case 'segol':
      return /\u05B6/.test(token);
    case 'tzere':
      return /\u05B5/.test(token);
    case 'hiriq':
      return /\u05B4/.test(token);
    case 'kubutz':
      return /\u05BB/.test(token);
    case 'sheva':
      return /\u05B0/.test(token);
    case 'hataf':
      return /[\u05B1\u05B2\u05B3]/.test(token);
    case 'dagesh':
      return /[^\u05D5]\u05BC|\u05D5\u05BC[\u05B0-\u05BB\u05C7]/.test(token);
    case 'shin_sin_dot':
      return /[\u05C1\u05C2]/.test(token);
    case 'maqaf':
      return /\u05BE/.test(token);
    case 'paseq':
      return /\u05C0/.test(token);
    case 'teamim':
      return /[\u0591-\u05AF]/.test(token);
    default:
      return false;
  }
}

function describeNiqqudSequence(vocWord: string): string {
  const labels: string[] = [];
  if (/\u05B0/.test(vocWord)) labels.push('Sheva');
  if (/[\u05B1-\u05B3]/.test(vocWord)) labels.push('Hataf');
  if (/[\u05B9\u05BA]/.test(vocWord)) labels.push('Holam');
  if (/\u05B8/.test(vocWord)) labels.push('Qamats');
  if (/\u05B4/.test(vocWord)) labels.push('Hiriq');
  if (/\u05B5/.test(vocWord)) labels.push('Tzere');
  if (/\u05B6/.test(vocWord)) labels.push('Segol');
  if (/\u05B7/.test(vocWord)) labels.push('Patach');
  return labels.length > 0 ? labels.join(' + ') : 'Sem niqqud';
}

function inferTraditionalReadingNote(vocForm: string): string {
  if (/\u05B4/.test(vocForm)) {
    return 'Pontuação tradicional associada ao Qere perpetuum "Elohim" (ex.: após Adonai).';
  }
  if (/[\u05B9\u05BA]/.test(vocForm)) {
    return 'Pontuação tradicional com Holam explícito preservada no códice (Adonai pleno / tradição massorética).';
  }
  if (/\u05B0/.test(vocForm) && /\u05B8/.test(vocForm)) {
    return 'Pontuação massorética padrão associada ao Qere perpetuum "Adonai" (vogais reduzidas sobre consoantes do Tetragrama).';
  }
  return 'Forma vocalizada atestada no corpus massorético; grafia consonantal e leitura tradicional são registradas separadamente.';
}

export function analyzeMasoreticFeatures(
  corpus: TanakhCorpus,
  params: {
    selectedSigns?: string[];
    matchMode?: 'word_all' | 'verse_all';
    consonantalFilter?: string;
    division?: string;
    bookSlug?: string;
    page?: number;
    pageSize?: number;
    translationId?: string | null;
  },
) {
  const selectedSigns = Array.from(new Set((params.selectedSigns ?? []).filter(Boolean)));
  const matchMode = params.matchMode ?? 'word_all';
  const cleanFilter = params.consonantalFilter ? normalizeConsonantal(params.consonantalFilter) : '';
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(80, Math.max(10, params.pageSize ?? 25));

  const books = corpus.getBooksByScope({ division: params.division, bookSlug: params.bookSlug });

  // 1) Auditoria integral de todas as vocalizacoes efetivamente atestadas de יהוה no escopo
  const tetraMap = new Map<
    string,
    {
      vocalizedForm: string;
      consonantal: string;
      count: number;
      niqqudProfile: string;
      traditionNote: string;
      divisionCounts: { Torah: number; Prophets: number; Writings: number };
      samples: Array<{
        reference: string;
        slug: string;
        chapter: number;
        verse: number;
        verseOriginal: string;
        verseVocalized: string;
        verseConsonantal: string;
        verseStream: string;
        translationPt: string;
      }>;
    }
  >();

  let totalTetragrammaton = 0;

  // 2) Contagem de sinais e busca combinatoria em versiculos
  const signVerseCounts: Record<string, number> = {};
  for (const def of MASORETIC_SIGN_DEFS) {
    signVerseCounts[def.id] = 0;
  }

  const matchedVerses: Array<{
    reference: string;
    slug: string;
    chapter: number;
    verse: number;
    matchedTokens: string[];
    verseOriginal: string;
    verseVocalized: string;
    verseConsonantal: string;
    verseStream: string;
    translationPt: string;
  }> = [];

  for (const book of books) {
    for (const w of book.words) {
      if (w.cons !== 'יהוה') continue;
      totalTetragrammaton++;
      const formKey = w.voc;
      let entry = tetraMap.get(formKey);
      if (!entry) {
        entry = {
          vocalizedForm: formKey,
          consonantal: 'יהוה',
          count: 0,
          niqqudProfile: describeNiqqudSequence(formKey),
          traditionNote: inferTraditionalReadingNote(formKey),
          divisionCounts: { Torah: 0, Prophets: 0, Writings: 0 },
          samples: [],
        };
        tetraMap.set(formKey, entry);
      }
      entry.count++;
      entry.divisionCounts[book.division]++;
      if (entry.samples.length < 4) {
        const vr = book.verses.find((v) => v.c === w.chapter && v.v === w.verse);
        if (vr) {
          const ref = `${book.ptTitle} ${vr.c}:${vr.v}`;
          if (!entry.samples.some((s) => s.reference === ref)) {
            const tr = corpus.resolveVerseTranslation(book.slug, vr.c, vr.v, params.translationId);
            entry.samples.push({
              reference: ref,
              slug: book.slug,
              chapter: vr.c,
              verse: vr.v,
              verseOriginal: stripHtmlPlain(vr.orig),
              verseVocalized: vr.voc,
              verseConsonantal: vr.cons,
              verseStream: book.stream.slice(vr.s, vr.e),
              translationPt: tr.text,
            });
          }
        }
      }
    }

    for (const vr of book.verses) {
      const origPlain = stripHtmlPlain(vr.orig);
      for (const def of MASORETIC_SIGN_DEFS) {
        if (hasMasoreticSign(origPlain, def.id)) {
          signVerseCounts[def.id]++;
        }
      }

      if (selectedSigns.length > 0 || cleanFilter.length > 0) {
        const tokens = origPlain.split(/\s+/).filter(Boolean);
        let versePasses = false;
        const matchedTokens: string[] = [];

        if (matchMode === 'word_all') {
          for (const tok of tokens) {
            const signsOk = selectedSigns.every((sid) => hasMasoreticSign(tok, sid));
            const consOk = !cleanFilter || normalizeConsonantal(tok).includes(cleanFilter);
            if (signsOk && consOk) {
              versePasses = true;
              matchedTokens.push(tok);
            }
          }
        } else {
          const verseSignsOk = selectedSigns.every((sid) => hasMasoreticSign(origPlain, sid));
          const verseConsOk = !cleanFilter || book.stream.slice(vr.s, vr.e).includes(cleanFilter);
          if (verseSignsOk && verseConsOk) {
            versePasses = true;
            for (const tok of tokens) {
              if (
                selectedSigns.some((sid) => hasMasoreticSign(tok, sid)) ||
                (cleanFilter && normalizeConsonantal(tok).includes(cleanFilter))
              ) {
                matchedTokens.push(tok);
              }
            }
          }
        }

        if (versePasses) {
          const tr = corpus.resolveVerseTranslation(book.slug, vr.c, vr.v, params.translationId);
          matchedVerses.push({
            reference: `${book.ptTitle} ${vr.c}:${vr.v}`,
            slug: book.slug,
            chapter: vr.c,
            verse: vr.v,
            matchedTokens: matchedTokens.slice(0, 8),
            verseOriginal: origPlain,
            verseVocalized: vr.voc,
            verseConsonantal: vr.cons,
            verseStream: book.stream.slice(vr.s, vr.e),
            translationPt: tr.text,
          });
        }
      }
    }
  }

  const tetragrammatonForms = Array.from(tetraMap.values())
    .sort((a, b) => b.count - a.count)
    .map((f) => ({
      ...f,
      percent: totalTetragrammaton > 0 ? Number(((f.count / totalTetragrammaton) * 100).toFixed(2)) : 0,
    }));

  const startIdx = (page - 1) * pageSize;

  return {
    scope: {
      division: params.division ?? 'all',
      bookSlug: params.bookSlug ?? 'all',
      booksCount: books.length,
      totalVersesScanned: books.reduce((s, b) => s + b.verses.length, 0),
    },
    availableSigns: MASORETIC_SIGN_DEFS.map((def) => ({
      ...def,
      versesWithSign: signVerseCounts[def.id] ?? 0,
    })),
    tetragrammaton: {
      totalOccurrences: totalTetragrammaton,
      distinctVocalizedFormsCount: tetragrammatonForms.length,
      forms: tetragrammatonForms,
      methodologicalNote:
        'O motor preserva a forma massorética original sem substituir o Nome automaticamente. Grafia consonantal (יהוה), pontuação massorética (niqqud/te’amim), leitura tradicional (Qere perpetuum Adonai/Elohim) e hipóteses fonéticas permanecem explicitamente separadas.',
    },
    signSearch: {
      selectedSigns,
      matchMode,
      consonantalFilter: cleanFilter,
      totalMatchedVerses: matchedVerses.length,
      page,
      pageSize,
      items: matchedVerses.slice(startIdx, startIdx + pageSize),
    },
    algorithmVersion: 'masoretic_sign_inspector@1.0.0',
  };
}

// ============================================================================
// 11. DASHBOARD DE ESTATISTICAS E DESCOBERTAS DETERMINISTICAS
// ============================================================================
export function buildDashboardSummary(corpus: TanakhCorpus, translationId?: string | null) {
  const ketivQereTotal = corpus.books.reduce(
    (acc, b) => acc + b.masoreticDiffs.reduce((s, d) => s + d.items.length, 0),
    0,
  );
  const totalLetters = corpus.manifest.totals.letters;

  const divisionLabels: Record<string, string> = {
    Torah: 'Torá (Pentateuco)',
    Prophets: 'Profetas (Nevi’im)',
    Writings: 'Escritos (Ketuvim)',
  };

  const divisionBreakdown = (['Torah', 'Prophets', 'Writings'] as const).map((div) => {
    const bks = corpus.books.filter((b) => b.division === div);
    const chapters = bks.reduce((s, b) => s + b.chapters, 0);
    const verses = bks.reduce((s, b) => s + b.verseCount, 0);
    const words = bks.reduce((s, b) => s + b.wordCount, 0);
    const letters = bks.reduce((s, b) => s + b.letterCount, 0);
    return {
      division: div,
      ptLabel: divisionLabels[div],
      booksCount: bks.length,
      chapters,
      verses,
      words,
      letters,
      percentLetters: Number(((letters / totalLetters) * 100).toFixed(1)),
    };
  });

  const topBooksByLetters = [...corpus.books]
    .sort((a, b) => b.letterCount - a.letterCount)
    .slice(0, 6)
    .map((b) => ({
      slug: b.slug,
      ptTitle: b.ptTitle,
      heTitle: b.heTitle,
      division: b.division,
      chapters: b.chapters,
      verses: b.verseCount,
      letters: b.letterCount,
      percentCorpus: Number(((b.letterCount / totalLetters) * 100).toFixed(1)),
    }));

  const discoverySpecs = [
    {
      id: 'ani_ani_hu',
      query: 'אניאניהוא',
      displayHebrew: 'אֲנִי אֲנִי הוּא',
      transliteration: 'Ani Ani Hu',
      title: 'Declaração Dupla de Identidade',
      category: 'identidade',
      insight: 'Ocorrência singular no stream consonantal em Deuteronômio 32:39 ("Eu, Eu sou Ele").',
    },
    {
      id: 'ani_ani',
      query: 'אניאני',
      displayHebrew: 'אֲנִי אֲנִי',
      transliteration: 'Ani Ani',
      title: 'Repetição Pronominal ("Eu, Eu")',
      category: 'identidade',
      insight: 'Inclui repetições diretas entre palavras (Dt 32:39, Is 48:11) e ressegmentações no fluxo contínuo.',
    },
    {
      id: 'anokhi_anokhi',
      query: 'אנכיאנכי',
      displayHebrew: 'אָנֹכִי אָנֹכִי',
      transliteration: 'Anokhi Anokhi',
      title: 'Duplicação Enfática ("Eu, Eu" — Anokhi)',
      category: 'identidade',
      insight: 'Presente em Isaías 43:11 (com יהוה), Isaías 43:25 e Isaías 51:12 (com הוא).',
    },
    {
      id: 'yhwh_yhwh',
      query: 'יהוהיהוה',
      displayHebrew: 'יְהוָה יְהוָה',
      transliteration: 'YHWH YHWH',
      title: 'Tetragrama Repetido Adjacente',
      category: 'tetragrama',
      insight: 'Proclamação dupla consecutiva em Êxodo 34:6 e ocorrências em fronteiras contínuas.',
    },
    {
      id: 'qadosh_3x',
      query: 'קדושקדושקדוש',
      displayHebrew: 'קָדוֹשׁ קָדוֹשׁ קָדוֹשׁ',
      transliteration: 'Qadosh Qadosh Qadosh',
      title: 'Triságio Adjacente 3×',
      category: 'repeticao_tripla',
      insight: 'Repetição tripla exata de "Santo" registrada em Isaías 6:3.',
    },
    {
      id: 'eretz_3x',
      query: 'ארץארץארץ',
      displayHebrew: 'אֶרֶץ אֶרֶץ אֶרֶץ',
      transliteration: 'Eretz Eretz Eretz',
      title: 'Clamor Tríplice ("Terra, Terra, Terra")',
      category: 'repeticao_tripla',
      insight: 'Triplicação consecutiva literal em Jeremias 22:29.',
    },
    {
      id: 'mah_zot_asita',
      query: 'מהזאתעשית',
      displayHebrew: 'מַה־זֹּאת עָשִׂיתָ',
      transliteration: 'Mah Zot Asita',
      title: 'Fórmula "Que é isto que fizeste?"',
      category: 'formula',
      insight: 'Padrão interrogativo recorrente em Gênesis (3:13, 12:18, 26:10) e Juízes 15:11.',
    },
    {
      id: 'yhwh_total',
      query: 'יהוה',
      displayHebrew: 'יְהוָה',
      transliteration: 'YHWH (Tetragrama)',
      title: 'Tetragrama no Stream Contínuo',
      category: 'tetragrama',
      insight: 'Distinção explícita entre palavras exatas e sequências ressegmentadas ou entre versículos.',
    },
  ];

  const keyDiscoveries = discoverySpecs.map((spec) => {
    const res = searchContinuousStream(corpus, {
      query: spec.query,
      boundaryFilter: 'all',
      page: 1,
      pageSize: 10,
      translationId,
    });
    const first = res.occurrences[0] ?? null;
    const exactWordsCount = (res.boundaryBreakdown.exact_word ?? 0) + (res.boundaryBreakdown.multi_word ?? 0);
    const nonWordStreamCount = res.totalCount - exactWordsCount;
    return {
      id: spec.id,
      query: spec.query,
      displayHebrew: spec.displayHebrew,
      transliteration: spec.transliteration,
      title: spec.title,
      category: spec.category,
      insight: spec.insight,
      totalCount: res.totalCount,
      exactWordsCount,
      nonWordStreamCount,
      boundaryBreakdown: res.boundaryBreakdown,
      topBooks: res.bookBreakdown.slice(0, 4),
      sample: first
        ? {
            reference: first.reference,
            slug: first.slug,
            chapter: first.chapter,
            verse: first.verse,
            verseVocalized: first.verseVocalized,
            translationPt: first.translationPt,
            translationPtSource: first.translationPtSource,
            matchedStream: first.matchedStream,
            startOffset: first.startOffset,
            endOffset: first.endOffset,
          }
        : null,
    };
  });

  const reps2x = findConsecutiveRepetitions(corpus, {
    mode: 'words',
    minRepeats: 2,
    maxUnitWords: 2,
    page: 1,
    pageSize: 12,
    translationId,
  });
  const reps3x = findConsecutiveRepetitions(corpus, {
    mode: 'words',
    minRepeats: 3,
    maxUnitWords: 1,
    page: 1,
    pageSize: 12,
    translationId,
  });

  const identical = findIdenticalVerses(corpus, 18, 8, translationId);
  const cmpPs14_53 = compareChapters(corpus, { slug: 'psalms', chapter: 14 }, { slug: 'psalms', chapter: 53 });
  const cmpPs18_2Sm22 = compareChapters(corpus, { slug: 'psalms', chapter: 18 }, { slug: 'ii_samuel', chapter: 22 });
  const cmpIs37_2Rs19 = compareChapters(corpus, { slug: 'isaiah', chapter: 37 }, { slug: 'ii_kings', chapter: 19 });

  const elsTorahGenesis = searchELS(corpus, {
    query: 'תורה',
    bookSlug: 'genesis',
    minSkip: 49,
    maxSkip: 50,
    includeNegative: false,
    limit: 10,
    translationId,
  });

  return {
    generatedAtUtc: new Date().toISOString(),
    activeTranslationId: translationId ?? corpus.resolveVerseTranslation('genesis', 1, 1, translationId).translationId ?? 'acf',
    corpusTotals: {
      books: corpus.books.length,
      traditionalBooks: corpus.manifest.traditional_books_count,
      chapters: corpus.manifest.totals.chapters,
      verses: corpus.manifest.totals.verses,
      words: corpus.manifest.totals.words,
      letters: totalLetters,
      uniqueLexiconWords: corpus.lexicon.size,
      ketivQereTotal,
    },
    divisionBreakdown,
    topBooksByLetters,
    keyDiscoveries,
    repetitionsSummary: {
      total2xPlus: reps2x.totalCount,
      total3xPlus: reps3x.totalCount,
      topRepeatedUnits: reps2x.topUnits.slice(0, 8),
      tripleOccurrences: reps3x.items.slice(0, 6).map((it) => ({
        unitVocalized: it.unitVocalized,
        repeatCount: it.repeatCount,
        reference: it.reference,
        slug: it.slug,
        chapter: it.chapter,
        verseVocalized: it.verseVocalized,
        translationPt: it.translationPt,
      })),
    },
    parallelsSummary: {
      identicalClustersCount: identical.totalClusters,
      topClusters: identical.clusters.slice(0, 4).map((cl) => ({
        count: cl.count,
        letterLength: cl.letterLength,
        verseVocalized: cl.occurrences[0]?.verseVocalized ?? '',
        translationPt: cl.occurrences[0]?.translationPt ?? '',
        references: cl.occurrences.slice(0, 5).map((o) => ({
          reference: o.reference,
          slug: o.slug,
          chapter: o.chapter,
        })),
      })),
      featuredComparisons: [
        {
          leftSlug: 'psalms',
          leftChapter: 14,
          rightSlug: 'psalms',
          rightChapter: 53,
          label: 'Salmos 14 ↔ Salmos 53',
          similarityPercent: cmpPs14_53.averageSimilarityPercent,
          identicalCount: cmpPs14_53.identicalCount,
          totalVerses: cmpPs14_53.comparisons.length,
        },
        {
          leftSlug: 'psalms',
          leftChapter: 18,
          rightSlug: 'ii_samuel',
          rightChapter: 22,
          label: 'Salmos 18 ↔ II Samuel 22',
          similarityPercent: cmpPs18_2Sm22.averageSimilarityPercent,
          identicalCount: cmpPs18_2Sm22.identicalCount,
          totalVerses: cmpPs18_2Sm22.comparisons.length,
        },
        {
          leftSlug: 'isaiah',
          leftChapter: 37,
          rightSlug: 'ii_kings',
          rightChapter: 19,
          label: 'Isaías 37 ↔ II Reis 19',
          similarityPercent: cmpIs37_2Rs19.averageSimilarityPercent,
          identicalCount: cmpIs37_2Rs19.identicalCount,
          totalVerses: cmpIs37_2Rs19.comparisons.length,
        },
      ],
    },
    elsSummary: {
      query: 'תורה',
      bookSlug: 'genesis',
      ptBook: 'Gênesis',
      minSkip: 49,
      maxSkip: 50,
      totalHits: elsTorahGenesis.totalHits,
      expectedRandomHits: elsTorahGenesis.expectedRandomHits,
      observedOverExpected: elsTorahGenesis.observedOverExpected,
      sampleHit: elsTorahGenesis.hits[0]
        ? {
            skip: elsTorahGenesis.hits[0].skip,
            referenceStart: elsTorahGenesis.hits[0].referenceStart,
            referenceEnd: elsTorahGenesis.hits[0].referenceEnd,
            letterOffsets: elsTorahGenesis.hits[0].letterOffsets,
          }
        : null,
    },
  };
}

