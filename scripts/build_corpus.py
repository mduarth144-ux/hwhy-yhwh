#!/usr/bin/env python3
"""
YA-WE | Pattern Engine — Script 02: Normalizador, Construtor de Streams e Validador
Le data/original/*.json e data/import_meta.json, aplica politica explicita de
ketiv/qere e elementos editoriais, gera:
  - data/search/<slug>.json   ({"book": title, "stream": "..."})
  - data/maps/<slug>.json     (offsets de versiculos, palavras, camadas e diferencas massoreticas)
  - data/manifest.json        (fontes, hashes SHA-256, politicas, metricas e testes de aceitacao)
"""

import hashlib
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from html.parser import HTMLParser

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGINAL_DIR = os.path.join(ROOT_DIR, "data", "original")
SEARCH_DIR = os.path.join(ROOT_DIR, "data", "search")
MAPS_DIR = os.path.join(ROOT_DIR, "data", "maps")
TRANSLATIONS_DIR = os.path.join(ROOT_DIR, "data", "translations")
IMPORT_META_PATH = os.path.join(ROOT_DIR, "data", "import_meta.json")
MANIFEST_PATH = os.path.join(ROOT_DIR, "data", "manifest.json")

STREAM_RE = re.compile(r"^[\u05D0-\u05EA]+$")
HEBREW_CONSONANTS_RE = re.compile(r"[^\u05D0-\u05EA]")
CANTILLATION_RE = re.compile(r"[\u0591-\u05AF\u05BD\u05C0\u05C3\u05C6]")
TOKEN_SPLIT_RE = re.compile(r"[\s\u00A0\u2009\u200B\u05BE\u05C0\u05C3]+")
ALLOWED_CLASSES = {
    "mam-spi-samekh",
    "mam-spi-pe",
    "mam-spi-invnun",
    "mam-kq",
    "mam-kq-k",
    "mam-kq-q",
    "mam-kq-trivial",
    "mam-implicit-maqaf",
    "footnote",
    "footnote-marker",
}
ALLOWED_TAGS = {"span", "b", "br", "small", "big", "sup", "i"}


class MasorahVerseParser(HTMLParser):
    """
    Parser deterministico para 'Miqra according to the Masorah'.
    Politica editorial explicita:
      - Descarta marcadores editoriais: mam-spi-pe ({פ}), mam-spi-samekh ({ס}),
        mam-spi-invnun (׆), footnote e footnote-marker.
      - Em mam-kq (Ketiv/Qere): preserva Ketiv (mam-kq-k) no fluxo consonantal
        escrito, nunca concatena duas leituras alternativas, e registra o par
        {ketiv, qere} em ketiv_qere.
      - Em mam-kq-q isolado (Qere velo Ketiv): exclui do fluxo consonantal
        escrito e registra em ketiv_qere.
      - Preserva <span class="mam-implicit-maqaf">־</span> como separador de palavra.
      - Rejeita tags ou classes inesperadas.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.skip_depth = 0
        self.in_kq_pair = False
        self.kq_k_buf = []
        self.kq_q_buf = []
        self.in_standalone_k = False
        self.in_standalone_q = False
        self.written_parts = []
        self.vocalized_parts = []
        self.ketiv_qere = []

    def _current_classes(self, attrs):
        for k, v in attrs:
            if k == "class" and v:
                return set(v.split())
        return set()

    def handle_starttag(self, tag, attrs):
        if tag not in ALLOWED_TAGS:
            raise ValueError(f"Tag HTML inesperada na fonte: <{tag}>")

        classes = self._current_classes(attrs)
        unknown_classes = classes - ALLOWED_CLASSES
        if unknown_classes:
            raise ValueError(f"Classe CSS inesperada na fonte: {unknown_classes}")

        role = "normal"
        if classes & {"mam-spi-pe", "mam-spi-samekh", "mam-spi-invnun", "footnote", "footnote-marker"}:
            role = "skip"
            self.skip_depth += 1
        elif "mam-kq" in classes:
            role = "kq-pair"
            self.in_kq_pair = True
            self.kq_k_buf = []
            self.kq_q_buf = []
        elif "mam-kq-k" in classes:
            if self.in_kq_pair:
                role = "kq-pair-k"
            else:
                role = "kq-standalone-k"
                self.in_standalone_k = True
                self.kq_k_buf = []
        elif "mam-kq-q" in classes:
            if self.in_kq_pair:
                role = "kq-pair-q"
                self.skip_depth += 1
            else:
                role = "kq-standalone-q"
                self.in_standalone_q = True
                self.kq_q_buf = []
                self.skip_depth += 1

        self.stack.append((tag, role))

    def handle_endtag(self, tag):
        if not self.stack:
            return
        _, role = self.stack.pop()
        if role == "skip":
            self.skip_depth -= 1
        elif role == "kq-pair-q":
            self.skip_depth -= 1
        elif role == "kq-standalone-q":
            self.skip_depth -= 1
            q_text = "".join(self.kq_q_buf).strip()
            self.ketiv_qere.append({"type": "qere_velo_ketiv", "ketiv": "", "qere": q_text})
            self.vocalized_parts.append(f" {q_text} ")
            self.in_standalone_q = False
        elif role == "kq-standalone-k":
            k_text = "".join(self.kq_k_buf).strip()
            self.ketiv_qere.append({"type": "ketiv_velo_qere", "ketiv": k_text, "qere": ""})
            self.in_standalone_k = False
        elif role == "kq-pair":
            k_text = "".join(self.kq_k_buf).strip()
            q_text = "".join(self.kq_q_buf).strip()
            self.ketiv_qere.append({"type": "ketiv_qere", "ketiv": k_text, "qere": q_text})
            self.in_kq_pair = False

    def handle_data(self, data):
        roles = [r for _, r in self.stack]
        if "kq-pair-k" in roles:
            self.kq_k_buf.append(data)
            self.written_parts.append(data)
            self.vocalized_parts.append(data)
            return
        if "kq-pair-q" in roles:
            self.kq_q_buf.append(data)
            return
        if "kq-standalone-k" in roles:
            self.kq_k_buf.append(data)
            self.written_parts.append(data)
            self.vocalized_parts.append(data)
            return
        if "kq-standalone-q" in roles:
            self.kq_q_buf.append(data)
            return
        if self.skip_depth > 0:
            return

        self.written_parts.append(data)
        self.vocalized_parts.append(data)


def normalize_consonants(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return HEBREW_CONSONANTS_RE.sub("", nfkd)


def strip_cantillation(text: str) -> str:
    # Mantem niqqud (vogais/dagesh/shin-sin dots) e pontuacao textual basica, remove cantilacao
    cleaned = CANTILLATION_RE.sub("", text)
    cleaned = cleaned.replace("\u2009", " ").replace("\u00A0", " ")
    return re.sub(r"\s+", " ", cleaned).strip()


def clean_translation_html(text: str) -> str:
    if not isinstance(text, str):
        return ""
    no_tags = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", no_tags).strip()


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


AUTHORIZED_MASORETIC_LACUNAE = {
    ("Joshua", 21, 36): "Versiculo ausente na tradicao massoretica de Ben Asher (marcador '—' em Miqra according to the Masorah)",
    ("Joshua", 21, 37): "Versiculo ausente na tradicao massoretica de Ben Asher (marcador '—' em Miqra according to the Masorah)",
}


def build_book(book_meta: dict) -> dict:
    slug = book_meta["slug"]
    title = book_meta["title"]
    orig_path = os.path.join(ROOT_DIR, book_meta["original_file"])
    with open(orig_path, "r", encoding="utf-8") as f:
        orig_json = json.load(f)

    chapters = orig_json.get("text")
    if not isinstance(chapters, list) or len(chapters) == 0:
        raise ValueError(f"Capitulos invalidos ou vazios em {title}")

    pt_chapters = None
    if book_meta.get("portuguese_translation") and book_meta["portuguese_translation"].get("file"):
        pt_path = os.path.join(ROOT_DIR, book_meta["portuguese_translation"]["file"])
        if os.path.exists(pt_path):
            with open(pt_path, "r", encoding="utf-8") as f:
                pt_chapters = json.load(f).get("text")

    stream_parts = []
    refs = []          # [chapter, verse, startOffset, endOffset]
    words = []         # [chapter, verse, wordIndex, startOffset, endOffset, consWord, vocWord]
    verses = []        # per-verse rich record for lossless display
    masoretic_diffs = []
    authorized_lacunae = []
    offset = 0
    expected_sum_len = 0

    for c_idx, chapter in enumerate(chapters, 1):
        if not isinstance(chapter, list) or len(chapter) == 0:
            raise ValueError(f"Capitulo {c_idx} vazio ou invalido em {title}")
        for v_idx, verse_raw in enumerate(chapter, 1):
            if not isinstance(verse_raw, str) or not verse_raw.strip():
                raise ValueError(f"Versiculo vazio em {title} {c_idx}:{v_idx}")

            parser = MasorahVerseParser()
            parser.feed(verse_raw)
            parser.close()

            written_text = "".join(parser.written_parts)
            voc_no_cant = strip_cantillation("".join(parser.vocalized_parts))

            # Tokenizacao preservando fronteiras de palavras originais (espacos e maqaf)
            raw_tokens = [t for t in TOKEN_SPLIT_RE.split(written_text) if t]
            verse_cons_tokens = []
            verse_start = offset
            word_idx = 0

            for tok in raw_tokens:
                cons_tok = normalize_consonants(tok)
                if not cons_tok:
                    continue
                word_idx += 1
                w_start = offset
                w_end = offset + len(cons_tok)
                voc_tok = strip_cantillation(tok)
                words.append([c_idx, v_idx, word_idx, w_start, w_end, cons_tok, voc_tok])
                verse_cons_tokens.append(cons_tok)
                stream_parts.append(cons_tok)
                offset = w_end

            verse_stream = "".join(verse_cons_tokens)
            expected_sum_len += len(verse_stream)
            lacuna_key = (title, c_idx, v_idx)
            if not verse_stream:
                if lacuna_key in AUTHORIZED_MASORETIC_LACUNAE:
                    authorized_lacunae.append({
                        "chapter": c_idx,
                        "verse": v_idx,
                        "raw": verse_raw,
                        "reason": AUTHORIZED_MASORETIC_LACUNAE[lacuna_key],
                    })
                else:
                    raise ValueError(f"Lacuna nao autorizada em {title} {c_idx}:{v_idx}: '{verse_raw}'")
            elif not STREAM_RE.fullmatch(verse_stream):
                raise ValueError(f"Versiculo normalizado invalido em {title} {c_idx}:{v_idx}: '{verse_stream}'")

            # Verifica invariante: soma de palavras == stream do versiculo
            if offset - verse_start != len(verse_stream):
                raise AssertionError(f"Desvio de offset em {title} {c_idx}:{v_idx}")

            refs.append([c_idx, v_idx, verse_start, offset])

            if parser.ketiv_qere:
                masoretic_diffs.append({
                    "chapter": c_idx,
                    "verse": v_idx,
                    "items": parser.ketiv_qere,
                })

            pt_text = ""
            if pt_chapters and c_idx - 1 < len(pt_chapters) and isinstance(pt_chapters[c_idx - 1], list):
                if v_idx - 1 < len(pt_chapters[c_idx - 1]):
                    pt_text = clean_translation_html(pt_chapters[c_idx - 1][v_idx - 1])

            verses.append({
                "c": c_idx,
                "v": v_idx,
                "s": verse_start,
                "e": offset,
                "orig": verse_raw,
                "voc": voc_no_cant,
                "cons": " ".join(verse_cons_tokens),
                "pt": pt_text,
            })

    stream = "".join(stream_parts)

    # Testes obrigatorios da secao 03
    assert STREAM_RE.fullmatch(stream), f"Stream de {title} falhou regex ^[\\u05D0-\\u05EA]+$"
    assert len(stream) == expected_sum_len, f"Comprimento divergente em {title}"
    prev_end = 0
    reconstructed = []
    for c, v, s, e in refs:
        is_lacuna = (title, c, v) in AUTHORIZED_MASORETIC_LACUNAE
        assert s == prev_end and (e == s if is_lacuna else e > s), f"Offsets nao monotonicos em {title} {c}:{v}"
        reconstructed.append(stream[s:e])
        prev_end = e
    assert "".join(reconstructed) == stream, f"Reconstrucao deterministica falhou em {title}"

    search_obj = {"book": title, "stream": stream}
    search_bytes = json.dumps(search_obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    search_path = os.path.join(SEARCH_DIR, f"{slug}.json")
    with open(search_path, "wb") as f:
        f.write(search_bytes)

    maps_obj = {
        "book": title,
        "slug": slug,
        "division": book_meta["division"],
        "heTitle": book_meta["heTitle"],
        "ptTitle": book_meta["ptTitle"],
        "order": book_meta["order"],
        "chapters": len(chapters),
        "verseCount": len(refs),
        "wordCount": len(words),
        "letterCount": len(stream),
        "streamSha256": sha256_bytes(stream.encode("utf-8")),
        "refs": refs,
        "words": words,
        "verses": verses,
        "masoreticDiffs": masoretic_diffs,
        "authorizedLacunae": authorized_lacunae,
    }
    maps_bytes = json.dumps(maps_obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    maps_path = os.path.join(MAPS_DIR, f"{slug}.json")
    with open(maps_path, "wb") as f:
        f.write(maps_bytes)

    return {
        "order": book_meta["order"],
        "title": title,
        "slug": slug,
        "division": book_meta["division"],
        "heTitle": book_meta["heTitle"],
        "ptTitle": book_meta["ptTitle"],
        "edition": book_meta["versionTitle"],
        "license": book_meta["license"],
        "json_url": book_meta["json_url"],
        "original_file": book_meta["original_file"],
        "original_sha256": book_meta["original_sha256"],
        "search_file": f"data/search/{slug}.json",
        "search_file_sha256": sha256_bytes(search_bytes),
        "stream_sha256": sha256_bytes(stream.encode("utf-8")),
        "maps_file": f"data/maps/{slug}.json",
        "chapters": len(chapters),
        "verses": len(refs),
        "words": len(words),
        "letters": len(stream),
        "ketiv_qere_verses": len(masoretic_diffs),
        "authorized_lacunae": authorized_lacunae,
        "portuguese_translation": book_meta.get("portuguese_translation"),
    }


def main() -> int:
    os.makedirs(SEARCH_DIR, exist_ok=True)
    os.makedirs(MAPS_DIR, exist_ok=True)

    with open(IMPORT_META_PATH, "r", encoding="utf-8") as f:
        import_meta = json.load(f)

    manifest_books = []
    total_verses = 0
    total_words = 0
    total_letters = 0

    for b in import_meta["books"]:
        summary = build_book(b)
        manifest_books.append(summary)
        total_verses += summary["verses"]
        total_words += summary["words"]
        total_letters += summary["letters"]
        print(
            f"[{summary['order']:02d}/39] {summary['title']:15s} | "
            f"{summary['chapters']:3d} cap | {summary['verses']:4d} vers | "
            f"{summary['words']:6d} pal | {summary['letters']:6d} letras | "
            f"sha256:{summary['stream_sha256'][:10]}"
        )

    manifest = {
        "engine_name": "YA-WE | Pattern Engine",
        "blueprint_version": "2.0",
        "curadoria": "Moisés Duarte",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_repository": import_meta["source_repository"],
        "books_json_url": import_meta["books_json_url"],
        "books_json_sha256": import_meta["books_json_sha256"],
        "index_commit_sha": import_meta["index_commit_sha"],
        "primary_edition": import_meta["primary_edition"],
        "canonical_books_count": len(manifest_books),
        "traditional_books_count": 24,
        "totals": {
            "chapters": sum(b["chapters"] for b in manifest_books),
            "verses": total_verses,
            "words": total_words,
            "letters": total_letters,
        },
        "normalization_policy": {
            "unicode_normalization": "NFKD",
            "consonantal_regex": "^[\\u05D0-\\u05EA]+$",
            "final_letters_preserved_in_primary_stream": True,
            "logical_unicode_order_preserved": True,
            "editorial_markers_excluded": [
                "mam-spi-pe ({פ})",
                "mam-spi-samekh ({ס})",
                "mam-spi-invnun (׆)",
                "footnote",
                "footnote-marker",
            ],
            "ketiv_qere_policy": (
                "Em marcacoes mam-kq, preserva-se o Ketiv escrito (mam-kq-k) no fluxo "
                "consonantal continuo, sem concatenar leituras alternativas, e registra-se "
                "o par Ketiv/Qere em masoreticDiffs. Ocorrencias isoladas Qere-velo-Ketiv "
                "(mam-kq-q) ficam registradas apenas nos metadados e camada vocalizada."
            ),
            "layers": [
                "original_html (fonte intacta)",
                "vocalized_no_cantillation (vogais sem te'amim)",
                "consonantal_spaced (apenas apresentacao)",
                "continuous_stream (fonte canonica de busca)",
                "experimental_final_normalized (opcional em tempo de consulta)",
            ],
        },
        "validation_tests": {
            "all_streams_match_hebrew_consonant_regex": True,
            "zero_internal_separators": True,
            "length_equals_sum_of_normalized_verses": True,
            "monotonic_offsets": True,
            "deterministic_verse_reconstruction": True,
        },
        "books": manifest_books,
    }

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(
        f"\nCORPUS VALIDADO: 39 livros | {manifest['totals']['chapters']} capitulos | "
        f"{total_verses:,} versiculos | {total_words:,} palavras | {total_letters:,} letras consonantais."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
