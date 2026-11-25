import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeInversionsAndPermutations,
  analyzeMasoreticFeatures,
  buildDashboardSummary,
  discoverRecurringPhrasesSuffixArray,
  experimentalPhoneticSearch,
  findConsecutiveRepetitions,
  runValidationSuite,
  searchContinuousStream,
  searchELS,
} from '../engine/algorithms.ts';
import { TanakhCorpus } from '../engine/corpus.ts';
import { weightedPhoneticDistance } from '../engine/normalize.ts';
import { TranslationRegistry } from '../engine/translations.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');

console.log('Carregando corpus YA-WE...');
const translations = new TranslationRegistry(path.join(dataDir, 'translations'));
const corpus = new TanakhCorpus(dataDir, translations);
const suite = runValidationSuite(corpus);

console.log('\n=== TESTES DE ACEITAÇÃO (SEÇÃO 13) ===');
for (const t of suite.acceptanceTests) {
  console.log(`[${t.passed ? 'OK' : 'FALHA'}] ${t.name} -> ${t.details}`);
}

console.log('\n=== CASOS DE VALIDAÇÃO (SEÇÃO 14) ===');
for (const c of suite.validationCases) {
  console.log(`[${c.passed ? 'OK' : 'FALHA'}] ${c.label} (${c.reference})`);
}

assert.equal(suite.allPassed, true, 'Suite principal de aceitação e validação deve passar integralmente.');
assert.equal(corpus.books.length, 39, 'Corpus deve conter exatamente 39 livros.');
assert.equal(corpus.manifest.totals.chapters, 929, 'Corpus deve conter 929 capítulos.');
assert.equal(corpus.manifest.totals.verses, 23206, 'Corpus deve conter 23.206 versículos.');
assert.equal(corpus.manifest.totals.words, 305440, 'Corpus deve conter 305.440 palavras.');
assert.equal(corpus.manifest.totals.letters, 1196840, 'Corpus deve conter 1.196.840 letras consonantais.');

// 1) Verificação do desacoplamento: data/maps sem campo `pt` embutido e ACF migrado
console.log('\n=== VERIFICAÇÃO DE DESACOPLAMENTO (MAPAS vs TRADUÇÕES) ===');
const mapsDir = path.join(dataDir, 'maps');
const mapFiles = fs.readdirSync(mapsDir).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
assert.equal(mapFiles.length, 39, 'data/maps deve conter 39 livros canônicos.');
for (const mf of mapFiles) {
  const raw = JSON.parse(fs.readFileSync(path.join(mapsDir, mf), 'utf-8')) as {
    verses: Array<Record<string, unknown>>;
  };
  assert.equal(raw.verses.some((v) => 'pt' in v), false, `${mf} não deve conter texto de tradução embutido.`);
}

const acfSummary = translations.getTranslationSummary('acf');
assert.ok(acfSummary, 'Tradução ACF deve estar registrada em data/translations/acf.');
assert.equal(acfSummary.booksCount, 39, 'ACF deve conter os 39 livros migrados.');
assert.equal(acfSummary.isValid, true, 'ACF deve passar na verificação SHA-256 sem alertas.');
const ps3_1 = translations.getVerse('acf', 'psalms', 3, 1);
assert.ok(ps3_1?.state?.status === 'non_conventional', 'Salmos 3:1 deve preservar estado non_conventional de sobrescrito.');
console.log('[OK] Mapas consonantais sem campo pt; ACF validada (39 livros, SHA-256 íntegro, sobrescritos preservados).');

// 2) Validação dos contratos de schema e exemplos para o importador externo
console.log('\n=== VALIDAÇÃO DE SCHEMAS E EXEMPLOS ===');
const schemasDir = path.join(rootDir, 'docs', 'schemas');
const examplesDir = path.join(rootDir, 'docs', 'examples');
for (const sf of ['global-translations-manifest.v1.schema.json', 'translation-manifest.v1.schema.json', 'translation-book.v1.schema.json']) {
  const parsed = JSON.parse(fs.readFileSync(path.join(schemasDir, sf), 'utf-8')) as Record<string, unknown>;
  assert.ok(parsed.$schema && parsed.type === 'object', `Schema ${sf} válido.`);
}
for (const ef of fs.readdirSync(examplesDir).filter((f) => f.endsWith('.json'))) {
  const parsed = JSON.parse(fs.readFileSync(path.join(examplesDir, ef), 'utf-8')) as Record<string, unknown>;
  assert.equal(parsed.schemaVersion, '1.0.0', `Exemplo ${ef} deve declarar schemaVersion 1.0.0.`);
}
console.log('[OK] Todos os JSON Schemas e exemplos estão sintaticamente e estruturalmente válidos.');

// 3) Teste dinâmico de tradução multicânon (sem fabricar hebraico, testando diff e versificação)
console.log('\n=== TESTE DINÂMICO MULTICÂNON E COMPARADOR ===');
const tempTrId = 'test_multicanon';
const tempTrDir = path.join(dataDir, 'translations', tempTrId);
fs.rmSync(tempTrDir, { recursive: true, force: true });

try {
  fs.mkdirSync(tempTrDir, { recursive: true });
  const genBook = {
    schemaVersion: '1.0.0',
    translationId: tempTrId,
    bookId: 'genesis',
    title: 'Gênesis',
    canonGroup: 'torah',
    language: 'pt-BR',
    versification: {
      system: 'christian_standard',
      mappedToMasoretic: true,
      validated: true,
    },
    text: [
      ['No princípio Deus criou os céus e a terra.'],
      [
        'Assim foram terminados os céus e a terra.',
        'E no sétimo dia descansou.',
        'E abençoou Deus o sétimo dia.',
        'Esta é a história dos céus e da terra quando foram criados, no dia em que Jeová Deus fez terra e céu.',
      ],
    ],
  };
  const psBook = {
    schemaVersion: '1.0.0',
    translationId: tempTrId,
    bookId: 'psalms',
    title: 'Salmos',
    canonGroup: 'writings',
    language: 'pt-BR',
    versification: {
      system: 'lxx',
      mappedToMasoretic: true,
      validated: false,
      notes: 'Exemplo com numeração parcial não validada.',
    },
    text: [[null, 'Bem-aventurado o homem que não anda no conselho dos ímpios.']],
    verseStates: [
      {
        chapter: 1,
        verse: 1,
        status: 'omitted',
        note: 'Lacuna explícita simulada para teste de versificação.',
      },
    ],
  };
  const tobBook = {
    schemaVersion: '1.0.0',
    translationId: tempTrId,
    bookId: 'tobit',
    title: 'Tobias',
    canonGroup: 'deuterocanonical',
    language: 'pt-BR',
    versification: { system: 'vulgate', mappedToMasoretic: false, validated: false },
    text: [['Livro de Tobias, filho de Tobiel.']],
  };
  const matBook = {
    schemaVersion: '1.0.0',
    translationId: tempTrId,
    bookId: 'matthew',
    title: 'Mateus',
    canonGroup: 'new_testament',
    language: 'pt-BR',
    versification: { system: 'christian_standard', mappedToMasoretic: false, validated: false },
    text: [['Livro da genealogia de Jesus Cristo, filho de Davi, filho de Abraão.']],
  };

  const filesPayload = [
    { bookId: 'genesis', title: 'Gênesis', canonGroup: 'torah', order: 1, file: 'genesis.json', data: genBook, status: 'exact_masoretic', lacunae: 0 },
    { bookId: 'psalms', title: 'Salmos', canonGroup: 'writings', order: 27, file: 'psalms.json', data: psBook, status: 'mapped_validated', lacunae: 1 },
    { bookId: 'tobit', title: 'Tobias', canonGroup: 'deuterocanonical', order: 40, file: 'tobit.json', data: tobBook, status: 'native_unmapped', lacunae: 0 },
    { bookId: 'matthew', title: 'Mateus', canonGroup: 'new_testament', order: 52, file: 'matthew.json', data: matBook, status: 'native_unmapped', lacunae: 0 },
  ];

  const manifestBooks = filesPayload.map((fp) => {
    const rawJson = JSON.stringify(fp.data, null, 2);
    const full = path.join(tempTrDir, fp.file);
    fs.writeFileSync(full, rawJson, 'utf-8');
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    return {
      bookId: fp.bookId,
      title: fp.title,
      canonGroup: fp.canonGroup,
      order: fp.order,
      file: fp.file,
      chapters: fp.data.text.length,
      verses: fp.data.text.reduce((acc, ch) => acc + ch.length, 0),
      sha256,
      versificationStatus: fp.status,
      lacunaeCount: fp.lacunae,
    };
  });

  fs.writeFileSync(
    path.join(tempTrDir, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: '1.0.0',
        id: tempTrId,
        name: 'Tradução Sintética de Teste',
        sigla: 'TST',
        language: 'pt-BR',
        edition: 'Teste Automatizado',
        revision: '1.0',
        origin: { sourceLabel: 'Teste automatizado YA-WE' },
        copyright: { license: 'Teste interno', restrictedDistribution: true },
        canon: 'catholic_73',
        versification: {
          system: 'mixed',
          mappedToMasoretic: true,
          validationStatus: 'partial',
        },
        validation: { status: 'partial' },
        books: manifestBooks,
      },
      null,
      2,
    ),
    'utf-8',
  );

  const refreshResult = translations.refresh();
  assert.ok(refreshResult.valid >= 2, 'TranslationRegistry deve descobrir a tradução temporária + ACF.');

  const catalog = translations.getUnifiedBookCatalog();
  const tobCatalog = catalog.find((b) => b.bookId === 'tobit');
  const matCatalog = catalog.find((b) => b.bookId === 'matthew');
  assert.ok(tobCatalog && tobCatalog.hasMasoreticOriginal === false, 'Tobias deve aparecer sem fabricar original massorético.');
  assert.ok(matCatalog && matCatalog.hasMasoreticOriginal === false, 'Mateus deve aparecer sem fabricar original massorético.');

  const psLacuna = translations.getVerse(tempTrId, 'psalms', 1, 1);
  assert.equal(psLacuna?.text, null, 'Lacuna explícita em Salmos 1:1 deve retornar texto null.');
  assert.equal(psLacuna?.state?.status, 'omitted', 'Estado omitted deve ser preservado.');
  assert.ok(psLacuna?.unmappedWarning, 'Versificação não validada deve emitir aviso explícito.');

  const cmp = translations.compareTranslationsForVerse(['acf', tempTrId], 'genesis', 2, 4);
  assert.equal(cmp.deterministicDiffs.divineNameDivergence, true, 'Comparador deve detectar divergência entre SENHOR e Jeová em Gn 2:4.');

  // Métricas massoréticas imutáveis mesmo após adicionar NT/Deuterocanônicos
  assert.equal(corpus.books.length, 39, 'Corpus hebraico deve permanecer com exatos 39 livros.');
  assert.equal(corpus.manifest.totals.letters, 1196840, 'Total consonantal não pode ser alterado por traduções externas.');
  console.log('[OK] Autodescoberta multicânon, lacunas, divergência de nome divino e imutabilidade do corpus verificadas.');
} finally {
  fs.rmSync(tempTrDir, { recursive: true, force: true });
  translations.refresh();
}

// 4) Fonética ponderada, backtracking exato e busca contínua fonética
console.log('\n=== TESTES DE FONÉTICA E BACKTRACKING ===');
const bt = weightedPhoneticDistance('אבג', 'אג', new Set());
assert.equal(bt.cost, 1, 'Custo de remoção de 1 letra deve ser 1.');
assert.ok(bt.transformations.includes('rem:ב'), `Backtracking deve registrar 'rem:ב' (obtido: ${bt.transformations.join(', ')})`);

const vav1N = weightedPhoneticDistance('דוד', 'דוויד', new Set(['vav_double', 'mater_yod_elision']));
assert.ok(vav1N.cost < 1, `Regra 1:N vav_double + mater_yod deve reduzir custo (obtido: ${vav1N.cost}).`);

const phonCont = experimentalPhoneticSearch(corpus, {
  term: 'אניהוא',
  mode: 'continuous',
  division: 'Torah',
  bookSlug: 'deuteronomy',
  activeRuleIds: ['ayin_alef', 'vav_yod'],
  maxCost: 0.6,
  limit: 20,
});
assert.ok(phonCont.continuousTotalCandidates >= 1, 'Busca contínua fonética deve localizar aproximações em Deuteronômio.');
console.log(`[OK] Backtracking weightedPhoneticDistance, regra 1:N e busca contínua fonética verificados (${phonCont.continuousTotalCandidates} candidatos).`);

// 5) Laboratório Massorético (Tetragrama e combinação de sinais)
console.log('\n=== TESTE DO LABORATÓRIO MASSORÉTICO ===');
const masoretic = analyzeMasoreticFeatures(corpus, {
  division: 'Torah',
  selectedSigns: ['holam', 'maqaf'],
  matchMode: 'word_all',
  pageSize: 10,
});
assert.ok(masoretic.tetragrammaton.distinctVocalizedFormsCount >= 2, 'Deve listar múltiplas formas vocalizadas atestadas de יהוה na Torá.');
assert.ok(masoretic.signSearch.totalMatchedVerses > 0, 'Busca combinada de holam + maqaf por palavra deve retornar ocorrências.');
console.log(`[OK] ${masoretic.tetragrammaton.distinctVocalizedFormsCount} formas do Tetragrama auditadas na Torá; ${masoretic.signSearch.totalMatchedVerses} versículos com holam+maqaf.`);

// 6) Suffix Array cobertura exaustiva vs parcial
console.log('\n=== TESTE DE SUFFIX ARRAY + COBERTURA ===');
const saGenesis = discoverRecurringPhrasesSuffixArray(corpus, {
  bookSlug: 'genesis',
  minLength: 12,
  minFrequency: 5,
  limit: 10,
});
assert.equal(saGenesis.isExhaustive, true, 'Varredura em Gênesis deve ser exaustiva.');
assert.equal(saGenesis.coveragePercent, 100, 'Cobertura em Gênesis deve ser 100%.');

const saCapped = discoverRecurringPhrasesSuffixArray(corpus, {
  division: 'Torah',
  minLength: 12,
  minFrequency: 5,
  limit: 10,
  maxLettersCap: 50000,
});
assert.equal(saCapped.isExhaustive, false, 'Varredura limitada a 50.000 letras na Torá não pode se declarar exaustiva.');
assert.ok(saCapped.coveragePercent < 100, 'Cobertura limitada na Torá deve ser menor que 100%.');
console.log(`[OK] Gênesis: ${saGenesis.coveragePercent}% (exaustiva); Torá c/ teto 50k: ${saCapped.coveragePercent}% (parcial explícita).`);

// 7) Regra multi-versículo: involvedVerses em ocorrências cross_verse
console.log('\n=== TESTE DE OCORRÊNCIA MULTI-VERSÍCULO ===');
const crossVerse = searchContinuousStream(corpus, {
  query: 'יהוה',
  boundaryFilter: 'cross_verse',
  pageSize: 10,
});
assert.ok(crossVerse.totalCount >= 1, 'Deve existir ao menos 1 ocorrência de יהוה cruzando fronteira de versículo.');
const firstCross = crossVerse.occurrences[0];
assert.ok(
  Array.isArray(firstCross.involvedVerses) && firstCross.involvedVerses.length >= 2,
  'Ocorrência cross_verse deve expor todos os involvedVerses com tradução individual.',
);
console.log(`[OK] Ocorrência multi-versículo verificada: ${firstCross.reference} (${firstCross.involvedVerses.length} versículos envolvidos).`);

// 8) Preservação dos testes legados adicionais
const reps = findConsecutiveRepetitions(corpus, { mode: 'words', minRepeats: 3 });
assert.ok(reps.totalCount > 0, 'Repetições >= 3x devem continuar funcionando.');

const inv = analyzeInversionsAndPermutations(corpus, { term: 'פשר', includePermutations: true });
assert.ok((inv.permutations?.attested.length ?? 0) > 0, 'Permutações atestadas de פשר devem continuar funcionando.');

const els = searchELS(corpus, { query: 'תורה', bookSlug: 'genesis', minSkip: 49, maxSkip: 50 });
assert.ok(els.totalHits > 0, 'ELS תורה em Gênesis deve continuar funcionando.');

const dash = buildDashboardSummary(corpus);
assert.ok(dash.keyDiscoveries.length >= 6 && dash.corpusTotals.letters === 1196840, 'Dashboard determinístico íntegro.');
const yhwhDash = dash.keyDiscoveries.find((d) => d.id === 'yhwh_total');
assert.ok(
  yhwhDash && typeof yhwhDash.exactWordsCount === 'number' && typeof yhwhDash.nonWordStreamCount === 'number',
  'Dashboard deve separar ocorrências de palavra exata vs ressegmentadas/stream.',
);

console.log('\nTODOS OS TESTES DETERMINÍSTICOS PASSARAM COM SUCESSO.');
