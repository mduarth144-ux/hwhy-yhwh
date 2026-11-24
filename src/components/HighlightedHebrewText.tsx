import React from 'react';

export interface HighlightedOffset {
  localOffset: number;
  queryIndex: number;
  letter: string;
}

interface HighlightedHebrewTextProps {
  vocalized: string;
  consonantal?: string;
  expectedStreamLength?: number;
  highlights: HighlightedOffset[];
  className?: string;
}

const HEBREW_CONSONANT_RE = /^[\u05D0-\u05EA]$/;
// Marcas combinantes hebraicas (te'amim, niqqud, dagesh, shin/sin dot), excluindo maqaf (05BE), paseq (05C0), sof pasuq (05C3) e nun hafukha (05C6)
const HEBREW_COMBINING_MARK_RE = /^[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]$/;

interface Token {
  text: string;
  consIndex: number | null;
}

function tokenizeHebrewWithConsonantOffsets(source: string): { tokens: Token[]; consCount: number } {
  const nfkd = source.normalize('NFKD');
  const tokens: Token[] = [];
  let consCount = 0;

  for (const ch of nfkd) {
    if (HEBREW_CONSONANT_RE.test(ch)) {
      tokens.push({ text: ch, consIndex: consCount++ });
    } else if (
      HEBREW_COMBINING_MARK_RE.test(ch) &&
      tokens.length > 0 &&
      tokens[tokens.length - 1].consIndex !== null
    ) {
      tokens[tokens.length - 1].text += ch;
    } else if (tokens.length > 0 && tokens[tokens.length - 1].consIndex === null) {
      tokens[tokens.length - 1].text += ch;
    } else {
      tokens.push({ text: ch, consIndex: null });
    }
  }

  return { tokens, consCount };
}

export const HighlightedHebrewText: React.FC<HighlightedHebrewTextProps> = ({
  vocalized,
  consonantal,
  expectedStreamLength,
  highlights,
  className = 'font-hebrew text-xl leading-relaxed text-[#1f1912]',
}) => {
  const highlightMap = new Map<number, HighlightedOffset>();
  for (const hl of highlights) {
    highlightMap.set(hl.localOffset, hl);
  }

  let parsed = tokenizeHebrewWithConsonantOffsets(vocalized);
  // Caso raro de Qere velo Ketiv (9 versiculos no Tanakh): usa camada consonantal exata para manter offset 1:1 com o stream
  if (
    expectedStreamLength !== undefined &&
    parsed.consCount !== expectedStreamLength &&
    consonantal
  ) {
    parsed = tokenizeHebrewWithConsonantOffsets(consonantal);
  }

  return (
    <p className={className} dir="rtl" lang="he">
      {parsed.tokens.map((tok, idx) => {
        if (tok.consIndex === null) {
          return <React.Fragment key={idx}>{tok.text}</React.Fragment>;
        }
        const hl = highlightMap.get(tok.consIndex);
        if (!hl) {
          return <React.Fragment key={idx}>{tok.text}</React.Fragment>;
        }
        return (
          <mark
            key={idx}
            title={`Letra ${hl.queryIndex + 1} da sequência buscada (${hl.letter}) · posição consonantal ${tok.consIndex + 1} no versículo`}
            className="bg-[#fbbf24] text-[#1f1912] font-bold rounded-[2px] shadow-[0_0_0_1.5px_#0e4d64] px-[1px]"
          >
            {tok.text}
          </mark>
        );
      })}
    </p>
  );
};
