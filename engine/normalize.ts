export const FINAL_TO_MEDIAL: Record<string, string> = {
  '\u05DA': '\u05DB', // ך -> כ
  '\u05DD': '\u05DE', // ם -> מ
  '\u05DF': '\u05E0', // ן -> נ
  '\u05E3': '\u05E4', // ף -> פ
  '\u05E5': '\u05E6', // ץ -> צ
};

export const MEDIAL_TO_FINAL: Record<string, string> = {
  '\u05DB': '\u05DA', // כ -> ך
  '\u05DE': '\u05DD', // מ -> ם
  '\u05E0': '\u05DF', // נ -> ן
  '\u05E4': '\u05E3', // פ -> ף
  '\u05E6': '\u05E5', // צ -> ץ
};

export const HEBREW_CONSONANTS_ONLY_RE = /[^\u05D0-\u05EA]/g;

export function normalizeConsonantal(input: string): string {
  return input.normalize('NFKD').replace(HEBREW_CONSONANTS_ONLY_RE, '');
}

export function normalizeFinalLetters(consonantal: string): string {
  let out = '';
  for (let i = 0; i < consonantal.length; i++) {
    const ch = consonantal[i];
    out += FINAL_TO_MEDIAL[ch] ?? ch;
  }
  return out;
}

export function applyHebrewFinalForm(consonantal: string): string {
  if (!consonantal) return '';
  const chars = [...consonantal];
  for (let i = 0; i < chars.length; i++) {
    if (i < chars.length - 1) {
      chars[i] = FINAL_TO_MEDIAL[chars[i]] ?? chars[i];
    } else {
      chars[i] = MEDIAL_TO_FINAL[chars[i]] ?? chars[i];
    }
  }
  return chars.join('');
}

export function reverseLogical(consonantal: string, normalizeFinals = false): string {
  const base = normalizeFinals ? normalizeFinalLetters(consonantal) : consonantal;
  const reversed = [...base].reverse().join('');
  return normalizeFinals ? reversed : applyHebrewFinalForm(reversed);
}

export function generateUniquePermutations(
  consonantal: string,
  maxLength = 7,
  maxResults = 720,
): { permutations: string[]; truncated: boolean; totalTheoretical: number } {
  const clean = normalizeConsonantal(consonantal);
  if (!clean) {
    return { permutations: [], truncated: false, totalTheoretical: 0 };
  }
  const chars = [...clean];
  if (chars.length > maxLength) {
    return {
      permutations: [],
      truncated: true,
      totalTheoretical: factorial(chars.length),
    };
  }
  chars.sort();
  const used = new Array<boolean>(chars.length).fill(false);
  const current: string[] = [];
  const results: string[] = [];
  let truncated = false;

  const backtrack = () => {
    if (results.length >= maxResults) {
      truncated = true;
      return;
    }
    if (current.length === chars.length) {
      results.push(current.join(''));
      return;
    }
    for (let i = 0; i < chars.length; i++) {
      if (used[i]) continue;
      if (i > 0 && chars[i] === chars[i - 1] && !used[i - 1]) continue;
      used[i] = true;
      current.push(chars[i]);
      backtrack();
      current.pop();
      used[i] = false;
      if (truncated) return;
    }
  };

  backtrack();
  return {
    permutations: results,
    truncated,
    totalTheoretical: countMultisetPermutations(chars),
  };
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function countMultisetPermutations(chars: string[]): number {
  const counts = new Map<string, number>();
  for (const ch of chars) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let denom = 1;
  for (const c of counts.values()) denom *= factorial(c);
  return Math.round(factorial(chars.length) / denom);
}

export interface PhoneticRule {
  id: string;
  pair: [string, string];
  label: string;
  category: string;
  cost: number;
}

export const PHONETIC_RULES: PhoneticRule[] = [
  { id: 'ayin_alef', pair: ['ע', 'א'], label: 'ע ↔ א (guturais)', category: 'Guturais', cost: 0.4 },
  { id: 'het_he', pair: ['ח', 'ה'], label: 'ח ↔ ה (guturais)', category: 'Guturais', cost: 0.45 },
  { id: 'kaf_het', pair: ['כ', 'ח'], label: 'כ ↔ ח (fricativa/gutural)', category: 'Velares/Guturais', cost: 0.5 },
  { id: 'qof_kaf', pair: ['ק', 'כ'], label: 'ק ↔ כ (enfática/velar)', category: 'Velares', cost: 0.35 },
  { id: 'tav_tet', pair: ['ת', 'ט'], label: 'ת ↔ ט (dental/enfática)', category: 'Dentais', cost: 0.35 },
  { id: 'shin_samekh', pair: ['ש', 'ס'], label: 'ש ↔ ס (sibilantes)', category: 'Sibilantes', cost: 0.35 },
  { id: 'resh_dalet', pair: ['ר', 'ד'], label: 'ר ↔ ד (proximidade gráfica/fonética)', category: 'Coronais', cost: 0.6 },
  { id: 'vav_yod', pair: ['ו', 'י'], label: 'ו ↔ י (matres lectionis / semivogais)', category: 'Semivogais', cost: 0.4 },
  { id: 'alef_yod', pair: ['א', 'י'], label: 'א ↔ י (glotal/palatal)', category: 'Semivogais', cost: 0.5 },
];

export function getPhoneticCost(a: string, b: string, activeRuleIds: Set<string>): { cost: number; ruleLabel: string | null } {
  const na = FINAL_TO_MEDIAL[a] ?? a;
  const nb = FINAL_TO_MEDIAL[b] ?? b;
  if (na === nb) {
    return { cost: 0, ruleLabel: a === b ? null : `${a}≡${b} (final)` };
  }
  for (const rule of PHONETIC_RULES) {
    if (!activeRuleIds.has(rule.id)) continue;
    const [r1, r2] = rule.pair;
    if ((na === r1 && nb === r2) || (na === r2 && nb === r1)) {
      return { cost: rule.cost, ruleLabel: `${a}→${b} [${rule.label}]` };
    }
  }
  return { cost: 1, ruleLabel: null };
}

export function levenshteinLetters(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a[i - 1];
    for (let j = 1; j <= n; j++) {
      const cost = ca === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

export function weightedPhoneticDistance(
  query: string,
  candidate: string,
  activeRuleIds: Set<string>,
): { cost: number; editDistance: number; transformations: string[] } {
  const m = query.length;
  const n = candidate.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  const ops: (string | null)[][] = Array.from({ length: m + 1 }, () => new Array<string | null>(n + 1).fill(null));

  for (let i = 1; i <= m; i++) {
    dp[i][0] = i;
    ops[i][0] = `del:${query[i - 1]}`;
  }
  for (let j = 1; j <= n; j++) {
    dp[0][j] = j;
    ops[0][j] = `ins:${candidate[j - 1]}`;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const qa = query[i - 1];
      const cb = candidate[j - 1];
      const sub = getPhoneticCost(qa, cb, activeRuleIds);
      const diagCost = dp[i - 1][j - 1] + sub.cost;
      const delCost = dp[i - 1][j] + 1;
      const insCost = dp[i][j - 1] + 1;

      if (diagCost <= delCost && diagCost <= insCost) {
        dp[i][j] = diagCost;
        ops[i][j] = sub.ruleLabel ? sub.ruleLabel : sub.cost > 0 ? `sub:${qa}→${cb}` : null;
      } else if (delCost <= insCost) {
        dp[i][j] = delCost;
        ops[i][j] = `rem:${qa}`;
      } else {
        dp[i][j] = insCost;
        ops[i][j] = `ins:${cb}`;
      }
    }
  }

  const transformations: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    const op = ops[i][j];
    if (i > 0 && j > 0 && dp[i][j] <= dp[i - 1][j] + 1 && dp[i][j] <= dp[i][j - 1] + 1) {
      if (op) transformations.push(op);
      i--;
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j] === dp[i - 1][j] + 1)) {
      if (op) transformations.push(op);
      i--;
    } else {
      if (op) transformations.push(op);
      j--;
    }
  }
  transformations.reverse();

  return {
    cost: Number(dp[m][n].toFixed(3)),
    editDistance: levenshteinLetters(normalizeFinalLetters(query), normalizeFinalLetters(candidate)),
    transformations,
  };
}

export function isAramaicVerse(bookTitle: string, chapter: number, verse: number): boolean {
  if (bookTitle === 'Daniel') {
    if (chapter === 2 && verse >= 4) return true;
    if (chapter >= 3 && chapter <= 7) return true;
  }
  if (bookTitle === 'Ezra') {
    if (chapter === 4 && verse >= 8) return true;
    if (chapter === 5) return true;
    if (chapter === 6 && verse <= 18) return true;
    if (chapter === 7 && verse >= 12 && verse <= 26) return true;
  }
  if (bookTitle === 'Jeremiah' && chapter === 10 && verse === 11) return true;
  if (bookTitle === 'Genesis' && chapter === 31 && verse === 47) return true; // יגר שהדותא
  return false;
}
