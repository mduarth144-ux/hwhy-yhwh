import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CANONICAL_BOOK_BY_ID, CANONICAL_BOOK_CATALOG, type CanonGroup } from './canon.ts';

export interface VerseStateRecord {
  chapter: number;
  verse: number;
  status: 'omitted' | 'combined' | 'split' | 'non_conventional' | 'lacuna';
  combinedWith?: string;
  sourceRef?: string;
  masoreticRef?: string;
  note: string;
  validated?: boolean;
}

export interface VersificationMapRecord {
  sourceRef: string;
  targetRef: string | null;
  relation: '1:1' | '1:N' | 'N:1' | 'unmapped';
  validated: boolean;
  note?: string;
}

export interface TranslationBookManifestItem {
  bookId: string;
  title: string;
  canonGroup: CanonGroup;
  order: number;
  file: string;
  chapters: number;
  verses: number;
  sha256: string;
  versificationStatus: 'exact_masoretic' | 'mapped_validated' | 'native_unmapped' | 'custom';
  lacunaeCount?: number;
}

export interface TranslationManifest {
  schemaVersion: string;
  id: string;
  name: string;
  sigla: string;
  language: string;
  edition: string;
  revision: string;
  origin: {
    sourceLabel: string;
    sourceUrl?: string;
    importer?: string;
    importedAtUtc?: string;
  };
  copyright: {
    license: string;
    holder?: string;
    notice?: string;
    restrictedDistribution: boolean;
  };
  canon: 'tanakh' | 'protestant_66' | 'catholic_73' | 'lxx' | 'custom';
  versification: {
    system: 'masoretic' | 'christian_standard' | 'lxx' | 'vulgate' | 'mixed';
    mappedToMasoretic: boolean;
    validationStatus: 'validated' | 'partial' | 'unvalidated';
    notes?: string;
  };
  validation: {
    status: 'validated' | 'partial' | 'unvalidated' | 'draft';
    validatedAtUtc?: string;
    validator?: string;
    notes?: string;
  };
  books: TranslationBookManifestItem[];
}

export interface TranslationBookData {
  schemaVersion: string;
  translationId: string;
  bookId: string;
  title: string;
  nativeTitle?: string;
  canonGroup: CanonGroup;
  language: string;
  versionTitle?: string;
  versionSource?: string;
  versification: {
    system: string;
    mappedToMasoretic: boolean;
    validated: boolean;
    sourceNumberingPreserved?: boolean;
    notes?: string;
  };
  text: Array<Array<string | null>>;
  verseStates?: VerseStateRecord[];
  versificationMap?: VersificationMapRecord[];
}

export interface ResolvedVerseResult {
  translationId: string;
  translationName: string;
  sigla: string;
  language: string;
  text: string | null;
  state: VerseStateRecord | null;
  versificationLinks: VersificationMapRecord[];
  versificationSystem: string;
  versificationValidated: boolean;
  mappedToMasoretic: boolean;
  unmappedWarning: string | null;
}

export interface TranslationSummary {
  id: string;
  name: string;
  sigla: string;
  language: string;
  edition: string;
  revision: string;
  origin: string;
  originDetails: TranslationManifest['origin'];
  copyright: {
    status: 'public_domain' | 'restricted_local_only' | 'custom_license';
    license: string;
    restrictedLocalOnly: boolean;
    restrictedDistribution: boolean;
    holder?: string;
    attribution?: string;
    notice?: string;
  };
  canon: TranslationManifest['canon'];
  versification: {
    system: 'masoretic' | 'christian_standard' | 'lxx' | 'vulgate' | 'mixed';
    mappedToMasoretic: boolean;
    validationStatus: 'validated' | 'partial' | 'unvalidated';
    validated: boolean;
    notes?: string;
  };
  validation: TranslationManifest['validation'];
  booksCount: number;
  chaptersCount: number;
  versesCount: number;
  canonGroups: CanonGroup[];
  books: TranslationBookManifestItem[];
  warnings: string[];
  integrityWarnings: string[];
  isValid: boolean;
}

const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{1,47}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

export class TranslationRegistry {
  public readonly translationsDir: string;
  private manifests = new Map<string, TranslationManifest>();
  private summaries = new Map<string, TranslationSummary>();
  private bookCache = new Map<string, TranslationBookData>();
  private globalDefaultId = 'acf';

  constructor(translationsDir: string) {
    this.translationsDir = path.resolve(translationsDir);
    this.refresh();
  }

  public refresh(): { discovered: number; valid: number; warnings: string[] } {
    this.manifests.clear();
    this.summaries.clear();
    this.bookCache.clear();
    const globalWarnings: string[] = [];

    if (!fs.existsSync(this.translationsDir)) {
      return { discovered: 0, valid: 0, warnings: ['Diretório data/translations ausente.'] };
    }

    const globalManifestPath = path.join(this.translationsDir, 'manifest.json');
    if (fs.existsSync(globalManifestPath)) {
      try {
        const gm = JSON.parse(fs.readFileSync(globalManifestPath, 'utf-8')) as {
          defaultTranslationId?: string;
        };
        if (gm.defaultTranslationId && VALID_ID_RE.test(gm.defaultTranslationId)) {
          this.globalDefaultId = gm.defaultTranslationId;
        }
      } catch {
        globalWarnings.push('data/translations/manifest.json inválido; prosseguindo com autodescoberta.');
      }
    }

    const entries = fs.readdirSync(this.translationsDir, { withFileTypes: true });
    let discovered = 0;

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const folderId = ent.name;
      if (!VALID_ID_RE.test(folderId)) {
        globalWarnings.push(`Pasta ignorada por ID fora do padrão (${folderId}).`);
        continue;
      }

      const subDir = path.resolve(this.translationsDir, folderId);
      if (!subDir.startsWith(this.translationsDir + path.sep)) continue;

      const manifestFile = path.join(subDir, 'manifest.json');
      if (!fs.existsSync(manifestFile)) {
        globalWarnings.push(`Tradução "${folderId}" ignorada: manifest.json ausente.`);
        continue;
      }
      discovered++;

      const warnings: string[] = [];
      let parsed: TranslationManifest;
      try {
        parsed = JSON.parse(fs.readFileSync(manifestFile, 'utf-8')) as TranslationManifest;
      } catch (err) {
        globalWarnings.push(`Tradução "${folderId}" falhou ao ler manifest.json: ${String(err)}`);
        continue;
      }

      if (parsed.schemaVersion !== '1.0.0') {
        warnings.push(`schemaVersion "${parsed.schemaVersion}" diferente de 1.0.0.`);
      }
      if (parsed.id !== folderId) {
        warnings.push(`ID do manifesto ("${parsed.id}") difere do nome da pasta ("${folderId}").`);
      }
      if (!parsed.name || !parsed.sigla || !parsed.language || !Array.isArray(parsed.books)) {
        globalWarnings.push(`Tradução "${folderId}" ignorada por falta de campos obrigatórios no manifest.json.`);
        continue;
      }

      const validBooks: TranslationBookManifestItem[] = [];
      for (const bk of parsed.books) {
        if (!bk.bookId || !bk.file) continue;
        const resolvedBook = path.resolve(subDir, bk.file);
        if (!resolvedBook.startsWith(subDir + path.sep)) {
          warnings.push(`Caminho de livro rejeitado fora do diretório: ${bk.file}`);
          continue;
        }
        if (!fs.existsSync(resolvedBook)) {
          warnings.push(`Arquivo ausente: ${bk.file}`);
          continue;
        }
        if (bk.sha256 && SHA256_RE.test(bk.sha256)) {
          const actualHash = crypto.createHash('sha256').update(fs.readFileSync(resolvedBook)).digest('hex');
          if (actualHash !== bk.sha256) {
            warnings.push(`Checksum SHA-256 divergente em ${bk.file}`);
          }
        }
        validBooks.push(bk);
      }

      if (validBooks.length === 0) {
        globalWarnings.push(`Tradução "${folderId}" ignorada: nenhum arquivo de livro válido encontrado.`);
        continue;
      }

      const cleanManifest: TranslationManifest = {
        ...parsed,
        books: validBooks,
      };
      const rawCopy = cleanManifest.copyright ?? {
        license: 'Não informado',
        restrictedDistribution: false,
      };
      const copyStatus: 'public_domain' | 'restricted_local_only' | 'custom_license' =
        rawCopy.restrictedDistribution
          ? 'restricted_local_only'
          : /dom[ií]nio\s*p[uú]blico|public\s*domain/i.test(rawCopy.license ?? '')
            ? 'public_domain'
            : 'custom_license';

      const rawVers = cleanManifest.versification ?? {
        system: 'christian_standard' as const,
        mappedToMasoretic: false,
        validationStatus: 'unvalidated' as const,
      };

      const totalChapters = validBooks.reduce((acc, b) => acc + (b.chapters || 0), 0);
      const totalVerses = validBooks.reduce((acc, b) => acc + (b.verses || 0), 0);
      const canonGroups = Array.from(new Set(validBooks.map((b) => b.canonGroup)));

      this.manifests.set(folderId, cleanManifest);
      this.summaries.set(folderId, {
        id: cleanManifest.id,
        name: cleanManifest.name,
        sigla: cleanManifest.sigla,
        language: cleanManifest.language,
        edition: cleanManifest.edition ?? cleanManifest.name,
        revision: cleanManifest.revision ?? '1.0',
        origin: cleanManifest.origin?.sourceLabel ?? 'Local',
        originDetails: cleanManifest.origin ?? { sourceLabel: 'Local' },
        copyright: {
          status: copyStatus,
          license: rawCopy.license ?? 'Não informado',
          restrictedLocalOnly: Boolean(rawCopy.restrictedDistribution),
          restrictedDistribution: Boolean(rawCopy.restrictedDistribution),
          holder: rawCopy.holder,
          attribution: rawCopy.notice,
          notice: rawCopy.notice,
        },
        canon: cleanManifest.canon ?? 'custom',
        versification: {
          system: rawVers.system,
          mappedToMasoretic: Boolean(rawVers.mappedToMasoretic),
          validationStatus: rawVers.validationStatus ?? 'unvalidated',
          validated: rawVers.validationStatus === 'validated',
          notes: rawVers.notes,
        },
        validation: cleanManifest.validation ?? { status: 'unvalidated' },
        booksCount: validBooks.length,
        chaptersCount: totalChapters,
        versesCount: totalVerses,
        canonGroups,
        books: validBooks,
        warnings,
        integrityWarnings: warnings,
        isValid: warnings.length === 0,
      });
    }

    return {
      discovered,
      valid: this.manifests.size,
      warnings: globalWarnings,
    };
  }

  public listTranslations(): TranslationSummary[] {
    return Array.from(this.summaries.values()).sort((a, b) => {
      if (a.id === this.globalDefaultId) return -1;
      if (b.id === this.globalDefaultId) return 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }

  public getDefaultTranslationId(): string | null {
    if (this.manifests.has(this.globalDefaultId)) return this.globalDefaultId;
    if (this.manifests.has('acf')) return 'acf';
    const first = this.manifests.keys().next();
    return first.done ? null : first.value;
  }

  public getTranslationSummary(translationId?: string | null): TranslationSummary | null {
    const id = translationId && this.summaries.has(translationId)
      ? translationId
      : this.getDefaultTranslationId();
    if (!id) return null;
    return this.summaries.get(id) ?? null;
  }

  public getBook(translationId: string | null | undefined, bookId: string): TranslationBookData | null {
    const resolvedId = translationId && this.manifests.has(translationId)
      ? translationId
      : this.getDefaultTranslationId();
    if (!resolvedId) return null;

    const cacheKey = `${resolvedId}:${bookId}`;
    const cached = this.bookCache.get(cacheKey);
    if (cached) return cached;

    const manifest = this.manifests.get(resolvedId);
    if (!manifest) return null;
    const item = manifest.books.find((b) => b.bookId === bookId);
    if (!item) return null;

    const translationDir = path.resolve(this.translationsDir, resolvedId);
    const filePath = path.resolve(translationDir, item.file);
    if (!filePath.startsWith(translationDir + path.sep) || !fs.existsSync(filePath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TranslationBookData;
      if (!Array.isArray(parsed.text)) return null;
      this.bookCache.set(cacheKey, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  public getVerse(
    translationId: string | null | undefined,
    bookId: string,
    chapter: number,
    verse: number,
  ): ResolvedVerseResult | null {
    const summary = this.getTranslationSummary(translationId);
    if (!summary) return null;
    const book = this.getBook(summary.id, bookId);
    if (!book) return null;

    const chArr = book.text[chapter - 1];
    const rawVal = chArr && verse >= 1 && verse <= chArr.length ? chArr[verse - 1] : null;
    const state =
      book.verseStates?.find((st) => st.chapter === chapter && st.verse === verse) ?? null;

    const refPrefix = `${chapter}:${verse}`;
    const links =
      book.versificationMap?.filter(
        (m) => m.sourceRef === refPrefix || m.targetRef === refPrefix || m.sourceRef.startsWith(`${chapter}:`),
      ) ?? [];

    const unmappedWarning = !book.versification.mappedToMasoretic
      ? 'Numeração nativa não mapeada ao Texto Massorético.'
      : !book.versification.validated
        ? 'Mapeamento de versificação marcado como não validado.'
        : null;

    return {
      translationId: summary.id,
      translationName: summary.name,
      sigla: summary.sigla,
      language: summary.language,
      text: typeof rawVal === 'string' && rawVal.trim().length > 0 ? rawVal : null,
      state,
      versificationLinks: links,
      versificationSystem: book.versification.system,
      versificationValidated: book.versification.validated,
      mappedToMasoretic: book.versification.mappedToMasoretic,
      unmappedWarning,
    };
  }

  public getChapter(translationId: string | null | undefined, bookId: string, chapter: number) {
    const summary = this.getTranslationSummary(translationId);
    if (!summary) return null;
    const book = this.getBook(summary.id, bookId);
    if (!book) return null;
    if (chapter < 1 || chapter > book.text.length) return null;

    const chArr = book.text[chapter - 1] ?? [];
    const verses = chArr.map((rawVal, idx) => {
      const verseNum = idx + 1;
      const state = book.verseStates?.find((st) => st.chapter === chapter && st.verse === verseNum) ?? null;
      return {
        chapter,
        verse: verseNum,
        text: typeof rawVal === 'string' && rawVal.trim().length > 0 ? rawVal : null,
        state,
      };
    });

    return {
      translation: summary,
      book: {
        bookId: book.bookId,
        title: book.title,
        nativeTitle: book.nativeTitle ?? book.title,
        canonGroup: book.canonGroup,
        chapters: book.text.length,
        language: book.language,
        versification: book.versification,
        versificationMap: book.versificationMap ?? [],
      },
      chapter,
      verses,
    };
  }

  public getUnifiedBookCatalog(): Array<{
    canonOrder: number;
    order: number;
    bookId: string;
    ptTitle: string;
    heTitle: string | null;
    canonGroup: CanonGroup;
    hasMasoreticOriginal: boolean;
    expectedChapters: number;
    availableTranslations: Array<{
      translationId: string;
      id: string;
      sigla: string;
      name: string;
      language: string;
      chapters: number;
      versesCount: number;
      verses: number;
    }>;
  }> {
    const map = new Map<
      string,
      {
        canonOrder: number;
        order: number;
        bookId: string;
        ptTitle: string;
        heTitle: string | null;
        canonGroup: CanonGroup;
        hasMasoreticOriginal: boolean;
        expectedChapters: number;
        availableTranslations: Array<{
          translationId: string;
          id: string;
          sigla: string;
          name: string;
          language: string;
          chapters: number;
          versesCount: number;
          verses: number;
        }>;
      }
    >();

    for (const entry of CANONICAL_BOOK_CATALOG) {
      map.set(entry.bookId, {
        canonOrder: entry.order,
        order: entry.order,
        bookId: entry.bookId,
        ptTitle: entry.ptTitle,
        heTitle: entry.heTitle ?? null,
        canonGroup: entry.canonGroup,
        hasMasoreticOriginal: entry.hasMasoreticOriginal,
        expectedChapters: 1,
        availableTranslations: [],
      });
    }

    for (const tr of this.summaries.values()) {
      for (const bk of tr.books) {
        let item = map.get(bk.bookId);
        if (!item) {
          const fallbackMeta = CANONICAL_BOOK_BY_ID.get(bk.bookId);
          item = {
            canonOrder: fallbackMeta?.order ?? bk.order ?? 900,
            order: fallbackMeta?.order ?? bk.order ?? 900,
            bookId: bk.bookId,
            ptTitle: fallbackMeta?.ptTitle ?? bk.title,
            heTitle: fallbackMeta?.heTitle ?? null,
            canonGroup: bk.canonGroup ?? 'deuterocanonical',
            hasMasoreticOriginal: fallbackMeta?.hasMasoreticOriginal ?? false,
            expectedChapters: bk.chapters || 1,
            availableTranslations: [],
          };
          map.set(bk.bookId, item);
        }
        item.expectedChapters = Math.max(item.expectedChapters, bk.chapters || 1);
        item.availableTranslations.push({
          translationId: tr.id,
          id: tr.id,
          sigla: tr.sigla,
          name: tr.name,
          language: tr.language,
          chapters: bk.chapters,
          versesCount: bk.verses,
          verses: bk.verses,
        });
      }
    }

    return Array.from(map.values())
      .filter((item) => item.hasMasoreticOriginal || item.availableTranslations.length > 0)
      .sort((a, b) => a.canonOrder - b.canonOrder);
  }

  public compareTranslationsForVerse(
    translationIds: string[],
    bookId: string,
    chapter: number,
    verse: number,
  ) {
    const targetIds = Array.from(
      new Set(
        (translationIds.length > 0 ? translationIds : this.listTranslations().map((t) => t.id)).filter((id) =>
          this.manifests.has(id),
        ),
      ),
    );

    const entries = targetIds.map((id) => {
      const resolved = this.getVerse(id, bookId, chapter, verse);
      if (!resolved) {
        const sum = this.getTranslationSummary(id);
        return {
          translationId: id,
          translationName: sum?.name ?? id,
          sigla: sum?.sigla ?? id.toUpperCase(),
          language: sum?.language ?? 'pt-BR',
          text: null,
          state: null,
          versificationValidated: false,
          mappedToMasoretic: false,
          unmappedWarning: 'Livro ou versículo ausente nesta tradução.',
          signals: extractTextSignals(''),
        };
      }
      return {
        ...resolved,
        signals: extractTextSignals(resolved.text ?? ''),
      };
    });

    const deterministicDiffs = analyzeTranslationDifferences(
      entries.map((e) => ({ sigla: e.sigla, text: e.text ?? '', signals: e.signals })),
    );

    return {
      bookId,
      chapter,
      verse,
      entries,
      deterministicDiffs,
      methodologicalNote:
        'Comparação estritamente descritiva entre versões de versículo; diferenças de termos ou nomes não implicam alinhamento lexical automático palavra por palavra.',
    };
  }
}

const DIVINE_NAME_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'SENHOR (caixa alta)', regex: /\bSENHOR\b/g },
  { label: 'Senhor', regex: /\bSenhor\b/g },
  { label: 'Jeová', regex: /\bJeová\b/gi },
  { label: 'Javé / Iahweh', regex: /\b(?:Javé|Jahweh|Iahweh|Yahweh)\b/gi },
  { label: 'Eterno', regex: /\bEterno\b/gi },
  { label: 'Adonai', regex: /\bAdonai\b/gi },
  { label: 'YHWH', regex: /\bYHWH\b/gi },
  { label: 'Deus / Elohim', regex: /\b(?:Deus|Elohim)\b/gi },
];

const KEY_TERM_RENDERINGS: Array<{ concept: string; regex: RegExp }> = [
  { concept: 'torah_lei', regex: /\b(?:torá|torah|lei|instrução|ensinamento)\b/gi },
  { concept: 'nefesh_alma', regex: /\b(?:alma|almas|vida|vidas|pessoa|pessoas|criatura|ser)\b/gi },
  { concept: 'ruach_espirito', regex: /\b(?:espírito|sopro|vento|alento)\b/gi },
  { concept: 'olam_eterno', regex: /\b(?:eterno|eternamente|perpétuo|século|séculos|sempre)\b/gi },
];

export function extractTextSignals(text: string) {
  const clean = text.trim();
  const wordTokens = clean
    ? clean
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean)
    : [];

  const divineRenderings: string[] = [];
  for (const pat of DIVINE_NAME_PATTERNS) {
    if (pat.regex.test(clean)) {
      divineRenderings.push(pat.label);
    }
    pat.regex.lastIndex = 0;
  }

  const keyConceptTerms: Record<string, string[]> = {};
  for (const kc of KEY_TERM_RENDERINGS) {
    const matches = clean.match(kc.regex);
    if (matches && matches.length > 0) {
      keyConceptTerms[kc.concept] = Array.from(new Set(matches.map((m) => m.toLowerCase())));
    }
  }

  const properNames = Array.from(
    new Set(
      (clean.match(/(?<!^|[.!?]\s)\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{2,}/g) ?? []).filter(
        (w) => w !== 'SENHOR' && w !== 'Senhor' && w !== 'Deus' && w !== 'Espírito',
      ),
    ),
  );

  const punctuationProfile = {
    questionMarks: (clean.match(/\?/g) ?? []).length,
    exclamations: (clean.match(/!/g) ?? []).length,
    semicolons: (clean.match(/;/g) ?? []).length,
    colons: (clean.match(/:/g) ?? []).length,
    quotes: (clean.match(/[«»"“”']/g) ?? []).length,
  };

  return {
    wordCount: wordTokens.length,
    charCount: clean.length,
    tokens: wordTokens,
    divineRenderings,
    keyConceptTerms,
    properNames,
    punctuationProfile,
  };
}

function analyzeTranslationDifferences(
  items: Array<{ sigla: string; text: string; signals: ReturnType<typeof extractTextSignals> }>,
) {
  const nonEmpty = items.filter((it) => it.text.trim().length > 0);
  if (nonEmpty.length < 2) {
    return {
      comparedCount: nonEmpty.length,
      identicalText: false,
      sharedTokens: [] as string[],
      distinctiveByTranslation: [] as Array<{ sigla: string; distinctiveTokens: string[]; divineRenderings: string[] }>,
      divineNameDivergence: false,
      punctuationDivergence: false,
      conceptDifferences: [] as Array<{ concept: string; byTranslation: Record<string, string[]> }>,
    };
  }

  const tokenSets = nonEmpty.map((it) => new Set(it.signals.tokens));
  const sharedTokens = Array.from(tokenSets[0]).filter((tok) => tokenSets.every((s) => s.has(tok)));
  const sharedSet = new Set(sharedTokens);

  const distinctiveByTranslation = nonEmpty.map((it) => ({
    sigla: it.sigla,
    distinctiveTokens: Array.from(new Set(it.signals.tokens.filter((t) => !sharedSet.has(t)))),
    divineRenderings: it.signals.divineRenderings,
  }));

  const divineSignatures = new Set(nonEmpty.map((it) => it.signals.divineRenderings.join('|')));
  const punctSignatures = new Set(nonEmpty.map((it) => JSON.stringify(it.signals.punctuationProfile)));

  const conceptDifferences: Array<{ concept: string; byTranslation: Record<string, string[]> }> = [];
  for (const kc of KEY_TERM_RENDERINGS) {
    const byTranslation: Record<string, string[]> = {};
    const allFound = new Set<string>();
    for (const it of nonEmpty) {
      const vals = it.signals.keyConceptTerms[kc.concept] ?? [];
      if (vals.length > 0) {
        byTranslation[it.sigla] = vals;
        vals.forEach((v) => allFound.add(v));
      }
    }
    if (allFound.size > 1 || (allFound.size === 1 && Object.keys(byTranslation).length < nonEmpty.length)) {
      conceptDifferences.push({ concept: kc.concept, byTranslation });
    }
  }

  const normalizedTexts = new Set(nonEmpty.map((it) => it.text.trim()));

  return {
    comparedCount: nonEmpty.length,
    identicalText: normalizedTexts.size === 1,
    sharedTokens,
    distinctiveByTranslation,
    divineNameDivergence: divineSignatures.size > 1,
    punctuationDivergence: punctSignatures.size > 1,
    conceptDifferences,
  };
}
