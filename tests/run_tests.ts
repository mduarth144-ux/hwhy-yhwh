import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeInversionsAndPermutations,
  buildDashboardSummary,
  discoverRecurringPhrasesSuffixArray,
  experimentalPhoneticSearch,
  findConsecutiveRepetitions,
  runValidationSuite,
  searchContinuousStream,
  searchELS,
} from '../engine/algorithms.ts';
import { TanakhCorpus } from '../engine/corpus.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');

console.log('Carregando corpus YA-WE...');
const corpus = new TanakhCorpus(dataDir);
const suite = runValidationSuite(corpus);

console.log('\n=== TESTES DE ACEITAÇÃO (SEÇÃO 13) ===');
for (const t of suite.acceptanceTests) {
  console.log(`[${t.passed ? 'OK' : 'FALHA'}] ${t.name} -> ${t.details}`);
}

console.log('\n=== CASOS DE VALIDAÇÃO (SEÇÃO 14) ===');
for (const c of suite.validationCases) {
  console.log(`[${c.passed ? 'OK' : 'FALHA'}] ${c.label} (${c.reference})`);
}

// Testes adicionais de algoritmos
const reps = findConsecutiveRepetitions(corpus, { mode: 'words', minRepeats: 3 });
console.log(`\nRepetições consecutivas >= 3x encontradas: ${reps.totalCount}`);

const sa = discoverRecurringPhrasesSuffixArray(corpus, { bookSlug: 'genesis', minLength: 12, minFrequency: 5, limit: 10 });
console.log(`Suffix Array (Gênesis): ${sa.totalDiscovered} frases descobertas automaticamente`);

const inv = analyzeInversionsAndPermutations(corpus, { term: 'פשר', includePermutations: true });
console.log(`Permutações atestadas de פשר: ${inv.permutations?.attested.map((a) => a.form).join(', ')}`);

const phon = experimentalPhoneticSearch(corpus, { term: 'רז', activeRuleIds: ['resh_dalet', 'ayin_alef'], maxCost: 0.7 });
console.log(`Candidatos fonéticos experimentais para רז: ${phon.totalLexiconCandidates}`);

const resseg = searchContinuousStream(corpus, { query: 'יהוה', boundaryFilter: 'resegmented' });
console.log(`Ocorrências ressegmentadas (entre fronteiras) de יהוה: ${resseg.totalCount}`);

const els = searchELS(corpus, { query: 'תורה', bookSlug: 'genesis', minSkip: 49, maxSkip: 50 });
console.log(`ELS 'תורה' em Gênesis (d=49..50): ${els.totalHits} ocorrências (esperado ao acaso: ${els.expectedRandomHits})`);

const dash = buildDashboardSummary(corpus);
console.log('\n=== DASHBOARD DETERMINÍSTICO ===');
for (const d of dash.keyDiscoveries) {
  console.log(`- ${d.id} (${d.query}): ${d.totalCount} ocorrências`);
}
if (dash.keyDiscoveries.length < 6 || dash.corpusTotals.letters !== 1196840) {
  console.error('\nERRO: Dashboard determinístico inconsistente.');
  process.exit(1);
}

if (!suite.allPassed) {
  console.error('\nERRO: Nem todos os testes passaram.');
  process.exit(1);
}
console.log('\nTODOS OS TESTES DETERMINÍSTICOS PASSARAM.');
