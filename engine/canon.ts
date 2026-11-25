export type CanonGroup =
  | 'torah'
  | 'prophets'
  | 'writings'
  | 'deuterocanonical'
  | 'new_testament'
  | 'apocrypha_addition';

export interface CanonicalBookEntry {
  order: number;
  bookId: string;
  englishTitle: string;
  ptTitle: string;
  heTitle?: string;
  canonGroup: CanonGroup;
  hasMasoreticOriginal: boolean;
}

export const CANONICAL_BOOK_CATALOG: CanonicalBookEntry[] = [
  // Torá (1-5)
  { order: 1, bookId: 'genesis', englishTitle: 'Genesis', ptTitle: 'Gênesis', heTitle: 'בראשית', canonGroup: 'torah', hasMasoreticOriginal: true },
  { order: 2, bookId: 'exodus', englishTitle: 'Exodus', ptTitle: 'Êxodo', heTitle: 'שמות', canonGroup: 'torah', hasMasoreticOriginal: true },
  { order: 3, bookId: 'leviticus', englishTitle: 'Leviticus', ptTitle: 'Levítico', heTitle: 'ויקרא', canonGroup: 'torah', hasMasoreticOriginal: true },
  { order: 4, bookId: 'numbers', englishTitle: 'Numbers', ptTitle: 'Números', heTitle: 'במדבר', canonGroup: 'torah', hasMasoreticOriginal: true },
  { order: 5, bookId: 'deuteronomy', englishTitle: 'Deuteronomy', ptTitle: 'Deuteronômio', heTitle: 'דברים', canonGroup: 'torah', hasMasoreticOriginal: true },

  // Profetas / Nevi'im (6-26)
  { order: 6, bookId: 'joshua', englishTitle: 'Joshua', ptTitle: 'Josué', heTitle: 'יהושע', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 7, bookId: 'judges', englishTitle: 'Judges', ptTitle: 'Juízes', heTitle: 'שופטים', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 8, bookId: 'i_samuel', englishTitle: 'I Samuel', ptTitle: 'I Samuel', heTitle: 'שמואל א', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 9, bookId: 'ii_samuel', englishTitle: 'II Samuel', ptTitle: 'II Samuel', heTitle: 'שמואל ב', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 10, bookId: 'i_kings', englishTitle: 'I Kings', ptTitle: 'I Reis', heTitle: 'מלכים א', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 11, bookId: 'ii_kings', englishTitle: 'II Kings', ptTitle: 'II Reis', heTitle: 'מלכים ב', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 12, bookId: 'isaiah', englishTitle: 'Isaiah', ptTitle: 'Isaías', heTitle: 'ישעיהו', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 13, bookId: 'jeremiah', englishTitle: 'Jeremiah', ptTitle: 'Jeremias', heTitle: 'ירמיהו', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 14, bookId: 'ezekiel', englishTitle: 'Ezekiel', ptTitle: 'Ezequiel', heTitle: 'יחזקאל', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 15, bookId: 'hosea', englishTitle: 'Hosea', ptTitle: 'Oseias', heTitle: 'הושע', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 16, bookId: 'joel', englishTitle: 'Joel', ptTitle: 'Joel', heTitle: 'יואל', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 17, bookId: 'amos', englishTitle: 'Amos', ptTitle: 'Amós', heTitle: 'עמוס', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 18, bookId: 'obadiah', englishTitle: 'Obadiah', ptTitle: 'Obadias', heTitle: 'עובדיה', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 19, bookId: 'jonah', englishTitle: 'Jonah', ptTitle: 'Jonas', heTitle: 'יונה', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 20, bookId: 'micah', englishTitle: 'Micah', ptTitle: 'Miqueias', heTitle: 'מיכה', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 21, bookId: 'nahum', englishTitle: 'Nahum', ptTitle: 'Naum', heTitle: 'נחום', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 22, bookId: 'habakkuk', englishTitle: 'Habakkuk', ptTitle: 'Habacuque', heTitle: 'חבקוק', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 23, bookId: 'zephaniah', englishTitle: 'Zephaniah', ptTitle: 'Sofonias', heTitle: 'צפניה', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 24, bookId: 'haggai', englishTitle: 'Haggai', ptTitle: 'Ageu', heTitle: 'חגי', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 25, bookId: 'zechariah', englishTitle: 'Zechariah', ptTitle: 'Zacarias', heTitle: 'זכריה', canonGroup: 'prophets', hasMasoreticOriginal: true },
  { order: 26, bookId: 'malachi', englishTitle: 'Malachi', ptTitle: 'Malaquias', heTitle: 'מלאכי', canonGroup: 'prophets', hasMasoreticOriginal: true },

  // Escritos / Ketuvim (27-39)
  { order: 27, bookId: 'psalms', englishTitle: 'Psalms', ptTitle: 'Salmos', heTitle: 'תהלים', canonGroup: 'writings', hasMasoreticOriginal: true },
  { order: 28, bookId: 'proverbs', englishTitle: 'Proverbs', ptTitle: 'Provérbios', heTitle: 'משלי', canonGroup: 'writings', hasMasoreticOriginal: true },
  { order: 29, bookId: 'job', englishTitle: 'Job', ptTitle: 'Jó', heTitle: 'איוב', canonGroup: 'writings', hasMasoreticOriginal: true },
  { order: 30, bookId: 'song_of_songs', englishTitle: 'Song of Songs', ptTitle: 'Cântico dos Cânticos', heTitle: 'שיר השירים', canonGroup: 'writings', hasMasoreticOriginal: true },
  { order: 31, bookId: 'ruth', englishTitle: 'Ruth', ptTitle: 'Rute', heTitle: 'רות', canonGroup: 'writings', hasMasoreticOriginal: true },
  { order: 32, bookId: 'lamentations', englishTitle: 'Lamentations', ptTitle: 'Lamentações', heTitle: 'איכה', canonGroup: 'writings', hasMasoreticOriginal: true },
  { order: 33, bookId: 'ecclesiastes', englishTitle: 'Ecclesiastes', ptTitle: 'Eclesiastes', heTitle: 'קהלת', canonGroup: 'writings', hasMasoreticOriginal: true },
  { order: 34, bookId: 'esther', englishTitle: 'Esther', ptTitle: 'Ester', heTitle: 'אסתר', canonGroup: 'writings', hasMasoreticOriginal: true },
  { order: 35, bookId: 'daniel', englishTitle: 'Daniel', ptTitle: 'Daniel', heTitle: 'דניאל', canonGroup: 'writings', hasMasoreticOriginal: true },
  { order: 36, bookId: 'ezra', englishTitle: 'Ezra', ptTitle: 'Esdras', heTitle: 'עזרא', canonGroup: 'writings', hasMasoreticOriginal: true },
  { order: 37, bookId: 'nehemiah', englishTitle: 'Nehemiah', ptTitle: 'Neemias', heTitle: 'נחמיה', canonGroup: 'writings', hasMasoreticOriginal: true },
  { order: 38, bookId: 'i_chronicles', englishTitle: 'I Chronicles', ptTitle: 'I Crônicas', heTitle: 'דברי הימים א', canonGroup: 'writings', hasMasoreticOriginal: true },
  { order: 39, bookId: 'ii_chronicles', englishTitle: 'II Chronicles', ptTitle: 'II Crônicas', heTitle: 'דברי הימים ב', canonGroup: 'writings', hasMasoreticOriginal: true },

  // Deuterocanonicos e Adicoes LXX/Vulgata (40-51)
  { order: 40, bookId: 'tobit', englishTitle: 'Tobit', ptTitle: 'Tobias', canonGroup: 'deuterocanonical', hasMasoreticOriginal: false },
  { order: 41, bookId: 'judith', englishTitle: 'Judith', ptTitle: 'Judite', canonGroup: 'deuterocanonical', hasMasoreticOriginal: false },
  { order: 42, bookId: 'esther_greek', englishTitle: 'Greek Esther', ptTitle: 'Ester (Adições Gregas)', canonGroup: 'apocrypha_addition', hasMasoreticOriginal: false },
  { order: 43, bookId: 'wisdom', englishTitle: 'Wisdom', ptTitle: 'Sabedoria de Salomão', canonGroup: 'deuterocanonical', hasMasoreticOriginal: false },
  { order: 44, bookId: 'sirach', englishTitle: 'Sirach', ptTitle: 'Eclesiástico (Ben Sira)', canonGroup: 'deuterocanonical', hasMasoreticOriginal: false },
  { order: 45, bookId: 'baruch', englishTitle: 'Baruch', ptTitle: 'Baruc', canonGroup: 'deuterocanonical', hasMasoreticOriginal: false },
  { order: 46, bookId: 'letter_of_jeremiah', englishTitle: 'Letter of Jeremiah', ptTitle: 'Carta de Jeremias', canonGroup: 'apocrypha_addition', hasMasoreticOriginal: false },
  { order: 47, bookId: 'prayer_of_azariah', englishTitle: 'Prayer of Azariah', ptTitle: 'Oração de Azarias (Daniel Gr.)', canonGroup: 'apocrypha_addition', hasMasoreticOriginal: false },
  { order: 48, bookId: 'susanna', englishTitle: 'Susanna', ptTitle: 'Susana (Daniel Gr.)', canonGroup: 'apocrypha_addition', hasMasoreticOriginal: false },
  { order: 49, bookId: 'bel_and_the_dragon', englishTitle: 'Bel and the Dragon', ptTitle: 'Bel e o Dragão (Daniel Gr.)', canonGroup: 'apocrypha_addition', hasMasoreticOriginal: false },
  { order: 50, bookId: 'i_maccabees', englishTitle: 'I Maccabees', ptTitle: 'I Macabeus', canonGroup: 'deuterocanonical', hasMasoreticOriginal: false },
  { order: 51, bookId: 'ii_maccabees', englishTitle: 'II Maccabees', ptTitle: 'II Macabeus', canonGroup: 'deuterocanonical', hasMasoreticOriginal: false },

  // Novo Testamento (52-78)
  { order: 52, bookId: 'matthew', englishTitle: 'Matthew', ptTitle: 'Mateus', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 53, bookId: 'mark', englishTitle: 'Mark', ptTitle: 'Marcos', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 54, bookId: 'luke', englishTitle: 'Luke', ptTitle: 'Lucas', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 55, bookId: 'john', englishTitle: 'John', ptTitle: 'João', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 56, bookId: 'acts', englishTitle: 'Acts', ptTitle: 'Atos dos Apóstolos', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 57, bookId: 'romans', englishTitle: 'Romans', ptTitle: 'Romanos', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 58, bookId: 'i_corinthians', englishTitle: 'I Corinthians', ptTitle: 'I Coríntios', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 59, bookId: 'ii_corinthians', englishTitle: 'II Corinthians', ptTitle: 'II Coríntios', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 60, bookId: 'galatians', englishTitle: 'Galatians', ptTitle: 'Gálatas', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 61, bookId: 'ephesians', englishTitle: 'Ephesians', ptTitle: 'Efésios', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 62, bookId: 'philippians', englishTitle: 'Philippians', ptTitle: 'Filipenses', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 63, bookId: 'colossians', englishTitle: 'Colossians', ptTitle: 'Colossenses', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 64, bookId: 'i_thessalonians', englishTitle: 'I Thessalonians', ptTitle: 'I Tessalonicenses', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 65, bookId: 'ii_thessalonians', englishTitle: 'II Thessalonians', ptTitle: 'II Tessalonicenses', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 66, bookId: 'i_timothy', englishTitle: 'I Timothy', ptTitle: 'I Timóteo', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 67, bookId: 'ii_timothy', englishTitle: 'II Timothy', ptTitle: 'II Timóteo', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 68, bookId: 'titus', englishTitle: 'Titus', ptTitle: 'Tito', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 69, bookId: 'philemon', englishTitle: 'Philemon', ptTitle: 'Filemom', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 70, bookId: 'hebrews', englishTitle: 'Hebrews', ptTitle: 'Hebreus', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 71, bookId: 'james', englishTitle: 'James', ptTitle: 'Tiago', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 72, bookId: 'i_peter', englishTitle: 'I Peter', ptTitle: 'I Pedro', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 73, bookId: 'ii_peter', englishTitle: 'II Peter', ptTitle: 'II Pedro', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 74, bookId: 'i_john', englishTitle: 'I John', ptTitle: 'I João', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 75, bookId: 'ii_john', englishTitle: 'II John', ptTitle: 'II João', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 76, bookId: 'iii_john', englishTitle: 'III John', ptTitle: 'III João', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 77, bookId: 'jude', englishTitle: 'Jude', ptTitle: 'Judas', canonGroup: 'new_testament', hasMasoreticOriginal: false },
  { order: 78, bookId: 'revelation', englishTitle: 'Revelation', ptTitle: 'Apocalipse', canonGroup: 'new_testament', hasMasoreticOriginal: false },
];

export const CANONICAL_BOOK_BY_ID = new Map<string, CanonicalBookEntry>(
  CANONICAL_BOOK_CATALOG.map((b) => [b.bookId, b]),
);

export const CANON_GROUP_LABELS: Record<CanonGroup, string> = {
  torah: 'Torá (Pentateuco)',
  prophets: 'Profetas (Nevi’im)',
  writings: 'Escritos (Ketuvim)',
  deuterocanonical: 'Deuterocanônicos',
  apocrypha_addition: 'Adições Gregas (LXX / Vulgata)',
  new_testament: 'Novo Testamento',
};
