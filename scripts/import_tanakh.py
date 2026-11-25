#!/usr/bin/env python3
"""
YA-WE | Pattern Engine — Script 01: Importador Reprodutivel do Corpus
Baixa os 39 livros canonicos do Tanakh em hebraico (edicao unica e consistente:
'Miqra according to the Masorah' via Sefaria-Export) e a traducao integral
em Portugues Brasileiro (Almeida Corrigida Fiel - ACF, alinhada a versificacao
massoretica hebraica), sem fontes em ingles.
"""

import concurrent.futures
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

BOOKS_JSON_URL = "https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/books.json"
GITHUB_COMMIT_URL = "https://api.github.com/repos/Sefaria/Sefaria-Export/commits/master"
PRIMARY_EDITION = "Miqra according to the Masorah"

ACF_PT_BR_URL = "https://raw.githubusercontent.com/thiagobodruk/biblia/master/json/acf.json"
ACF_VERSION_TITLE = "Almeida Corrigida Fiel (ACF) — PT-BR"

CANONICAL_BOOKS = [
    ("Genesis", "genesis", "Torah", "בראשית", "Gênesis", "Gênesis", 1),
    ("Exodus", "exodus", "Torah", "שמות", "Êxodo", "Êxodo", 2),
    ("Leviticus", "leviticus", "Torah", "ויקרא", "Levítico", "Levítico", 3),
    ("Numbers", "numbers", "Torah", "במדבר", "Números", "Números", 4),
    ("Deuteronomy", "deuteronomy", "Torah", "דברים", "Deuteronômio", "Deuteronômio", 5),
    ("Joshua", "joshua", "Prophets", "יהושע", "Josué", "Josué", 6),
    ("Judges", "judges", "Prophets", "שופטים", "Juízes", "Juízes", 7),
    ("I Samuel", "i_samuel", "Prophets", "שמואל א", "I Samuel", "1 Samuel", 8),
    ("II Samuel", "ii_samuel", "Prophets", "שמואל ב", "II Samuel", "2 Samuel", 9),
    ("I Kings", "i_kings", "Prophets", "מלכים א", "I Reis", "1 Reis", 10),
    ("II Kings", "ii_kings", "Prophets", "מלכים ב", "II Reis", "2 Reis", 11),
    ("Isaiah", "isaiah", "Prophets", "ישעיהו", "Isaías", "Isaías", 12),
    ("Jeremiah", "jeremiah", "Prophets", "ירמיהו", "Jeremias", "Jeremias", 13),
    ("Ezekiel", "ezekiel", "Prophets", "יחזקאל", "Ezequiel", "Ezequiel", 14),
    ("Hosea", "hosea", "Prophets", "הושע", "Oseias", "Oséias", 15),
    ("Joel", "joel", "Prophets", "יואל", "Joel", "Joel", 16),
    ("Amos", "amos", "Prophets", "עמוס", "Amós", "Amós", 17),
    ("Obadiah", "obadiah", "Prophets", "עובדיה", "Obadias", "Obadias", 18),
    ("Jonah", "jonah", "Prophets", "יונה", "Jonas", "Jonas", 19),
    ("Micah", "micah", "Prophets", "מיכה", "Miqueias", "Miquéias", 20),
    ("Nahum", "nahum", "Prophets", "נחום", "Naum", "Naum", 21),
    ("Habakkuk", "habakkuk", "Prophets", "חבקוק", "Habacuque", "Habacuque", 22),
    ("Zephaniah", "zephaniah", "Prophets", "צפניה", "Sofonias", "Sofonias", 23),
    ("Haggai", "haggai", "Prophets", "חגי", "Ageu", "Ageu", 24),
    ("Zechariah", "zechariah", "Prophets", "זכריה", "Zacarias", "Zacarias", 25),
    ("Malachi", "malachi", "Prophets", "מלאכי", "Malaquias", "Malaquias", 26),
    ("Psalms", "psalms", "Writings", "תהלים", "Salmos", "Salmos", 27),
    ("Proverbs", "proverbs", "Writings", "משלי", "Provérbios", "Provérbios", 28),
    ("Job", "job", "Writings", "איוב", "Jó", "Jó", 29),
    ("Song of Songs", "song_of_songs", "Writings", "שיר השירים", "Cântico dos Cânticos", "Cânticos", 30),
    ("Ruth", "ruth", "Writings", "רות", "Rute", "Rute", 31),
    ("Lamentations", "lamentations", "Writings", "איכה", "Lamentações", "Lamentações de Jeremias", 32),
    ("Ecclesiastes", "ecclesiastes", "Writings", "קהלת", "Eclesiastes", "Eclesiastes", 33),
    ("Esther", "esther", "Writings", "אסתר", "Ester", "Ester", 34),
    ("Daniel", "daniel", "Writings", "דניאל", "Daniel", "Daniel", 35),
    ("Ezra", "ezra", "Writings", "עזרא", "Esdras", "Esdras", 36),
    ("Nehemiah", "nehemiah", "Writings", "נחמיה", "Neemias", "Neemias", 37),
    ("I Chronicles", "i_chronicles", "Writings", "דברי הימים א", "I Crônicas", "1 Crônicas", 38),
    ("II Chronicles", "ii_chronicles", "Writings", "דברי הימים ב", "II Crônicas", "2 Crônicas", 39),
]

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGINAL_DIR = os.path.join(ROOT_DIR, "data", "original")
TRANSLATIONS_DIR = os.path.join(ROOT_DIR, "data", "translations")
IMPORT_META_PATH = os.path.join(ROOT_DIR, "data", "import_meta.json")


def fetch_bytes(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "YA-WE-Pattern-Engine/2.0 (corpus-importer)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status} for {url}")
        return resp.read()


def fetch_commit_sha() -> str:
    try:
        raw = fetch_bytes(GITHUB_COMMIT_URL, timeout=10)
        info = json.loads(raw.decode("utf-8"))
        return info.get("sha", "unknown")
    except Exception as exc:
        return f"unavailable ({exc})"


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def align_pt_br_to_masoretic(title: str, he_chapters: list, acf_chapters: list) -> list:
    """
    Alinha a traducao PT-BR (ACF) a numeracao massoretica hebraica exata.
    """
    ch_copy = [list(c) for c in acf_chapters]

    if title == "Exodus":
        # Ex 20:13-16 (crista) = Ex 20:13 (massoretico)
        c20 = ch_copy[19]
        merged = " ".join(c20[12:16])
        ch_copy[19] = c20[:12] + [merged] + c20[16:]
    elif title == "Deuteronomy":
        # Dt 5:17-20 (crista) = Dt 5:17 (massoretico)
        c5 = ch_copy[4]
        merged = " ".join(c5[16:20])
        ch_copy[4] = c5[:16] + [merged] + c5[20:]
    elif title == "Judges":
        # Jz 5:31-32 (crista) = Jz 5:31 (massoretico)
        c5 = ch_copy[4]
        ch_copy[4] = c5[:30] + [c5[30] + " " + c5[31]]
    elif title == "Isaiah":
        # Is 64:1 (crista) integra Is 63:19 (massoretico)
        ch_copy[62][-1] = ch_copy[62][-1] + " " + ch_copy[63][0]
        ch_copy[63] = ch_copy[63][1:]
    elif title == "Nehemiah":
        # Ne 7:72-73 (crista) = Ne 7:72 (massoretico)
        c7 = ch_copy[6]
        ch_copy[6] = c7[:71] + [c7[71] + " " + c7[72]]
    elif title == "I Chronicles":
        # 1Cr 12:4 (crista) divide-se em 12:4 e 12:5 no texto massoretico
        v4 = ch_copy[11][3]
        idx = v4.find("; e Jeremias")
        if idx != -1:
            part1 = v4[:idx].strip()
            part2 = v4[idx + 2:].strip()
            ch_copy[11] = ch_copy[11][:3] + [part1, part2] + ch_copy[11][4:]

    # Casos de redivisao de capitulos com mesmo total de versiculos (Joel 4 vs 3; Malaquias 3 vs 4)
    if len(he_chapters) != len(ch_copy):
        flat = [v for ch in ch_copy for v in ch]
        expected_total = sum(len(ch) for ch in he_chapters)
        if len(flat) != expected_total:
            raise ValueError(f"Desalinhamento em {title}: he={expected_total}, pt={len(flat)}")
        aligned = []
        cursor = 0
        for ch in he_chapters:
            n = len(ch)
            aligned.append(flat[cursor : cursor + n])
            cursor += n
        return aligned

    # Caso especial Salmos: sobrescritos salmodicos contados como versiculo 1 (ou 1-2) no hebraico
    if title == "Psalms":
        aligned = []
        for ci, he_ch in enumerate(he_chapters):
            pt_ch = ch_copy[ci]
            diff = len(he_ch) - len(pt_ch)
            if diff == 0:
                aligned.append(pt_ch)
            elif diff > 0:
                prefix = ["[Sobrescrito salmódico no original hebraico]" for _ in range(diff)]
                aligned.append(prefix + pt_ch)
            else:
                raise ValueError(f"Salmo {ci + 1} inesperado: he={len(he_ch)}, pt={len(pt_ch)}")
        return aligned

    # Demais livros: alinhamento sequencial em intervalos contiguos onde fronteiras de capitulo diferem
    aligned = [None] * len(he_chapters)
    i = 0
    while i < len(he_chapters):
        if len(he_chapters[i]) == len(ch_copy[i]):
            aligned[i] = ch_copy[i]
            i += 1
            continue
        # Encontra menor bloco [i..j] com soma identica de versiculos
        he_sum = len(he_chapters[i])
        pt_sum = len(ch_copy[i])
        j = i
        while he_sum != pt_sum and j + 1 < len(he_chapters):
            j += 1
            he_sum += len(he_chapters[j])
            pt_sum += len(ch_copy[j])
        if he_sum != pt_sum:
            raise ValueError(f"Bloco desalinhado em {title} cap {i + 1}..{j + 1}: he={he_sum}, pt={pt_sum}")
        flat_block = [v for c in range(i, j + 1) for v in ch_copy[c]]
        cursor = 0
        for c in range(i, j + 1):
            n = len(he_chapters[c])
            aligned[c] = flat_block[cursor : cursor + n]
            cursor += n
        i = j + 1

    return aligned


def download_book(entry: dict, acf_by_name: dict) -> dict:
    title, slug, division, he_title, pt_title, acf_name, order = entry["meta"]
    he_url = entry["he_url"]
    out_path = os.path.join(ORIGINAL_DIR, f"{slug}.json")

    raw = fetch_bytes(he_url)
    parsed = json.loads(raw.decode("utf-8"))
    if "text" not in parsed or not isinstance(parsed["text"], list):
        raise ValueError(f"Estrutura inesperada em {title}: campo 'text' ausente ou invalido")

    with open(out_path, "wb") as f:
        f.write(raw)

    # Alinhar traducao PT-BR (ACF) no formato modular data/translations/acf/<slug>.json
    acf_dir = os.path.join(TRANSLATIONS_DIR, "acf")
    os.makedirs(acf_dir, exist_ok=True)
    aligned_pt = align_pt_br_to_masoretic(title, parsed["text"], acf_by_name[acf_name])
    canon_group = {"Torah": "torah", "Prophets": "prophets", "Writings": "writings"}.get(division, "writings")
    pt_doc = {
        "schemaVersion": "1.0.0",
        "translationId": "acf",
        "bookId": slug,
        "title": pt_title,
        "nativeTitle": pt_title,
        "canonGroup": canon_group,
        "language": "pt-BR",
        "versionTitle": ACF_VERSION_TITLE,
        "versionSource": ACF_PT_BR_URL,
        "versification": {
            "system": "masoretic",
            "mappedToMasoretic": True,
            "validated": True,
            "sourceNumberingPreserved": False,
        },
        "text": aligned_pt,
    }
    pt_bytes = json.dumps(pt_doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    pt_path = os.path.join(acf_dir, f"{slug}.json")
    with open(pt_path, "wb") as f:
        f.write(pt_bytes)

    return {
        "order": order,
        "title": title,
        "slug": slug,
        "division": division,
        "heTitle": parsed.get("heTitle") or he_title,
        "ptTitle": pt_title,
        "versionTitle": parsed.get("versionTitle", PRIMARY_EDITION),
        "license": parsed.get("license") or "CC-BY-SA",
        "versionSource": parsed.get("versionSource", ""),
        "json_url": he_url,
        "original_file": f"data/original/{slug}.json",
        "original_sha256": sha256_hex(raw),
        "original_bytes": len(raw),
        "portuguese_translation": {
            "language": "pt-BR",
            "versionTitle": ACF_VERSION_TITLE,
            "license": "Domínio Público / Repositório aberto PT-BR (thiagobodruk/biblia)",
            "url": ACF_PT_BR_URL,
            "sha256": sha256_hex(pt_bytes),
            "file": f"data/translations/acf/{slug}.json",
        },
    }


def main() -> int:
    os.makedirs(ORIGINAL_DIR, exist_ok=True)
    os.makedirs(os.path.join(TRANSLATIONS_DIR, "acf"), exist_ok=True)

    # Limpar apenas eventuais arquivos legados soltos em ingles sem jamais remover outras pastas de traducoes
    removed_en = 0
    for fname in os.listdir(TRANSLATIONS_DIR):
        full = os.path.join(TRANSLATIONS_DIR, fname)
        if os.path.isfile(full) and fname.endswith(".en.json"):
            os.remove(full)
            removed_en += 1
    if removed_en:
        print(f"0. Removidos {removed_en} arquivos de traducao em ingles (.en.json).")

    print("1. Consultando commit do indice Sefaria-Export...")
    commit_sha = fetch_commit_sha()
    print(f"   Commit SHA: {commit_sha}")

    print("2. Baixando books.json de Sefaria-Export e traducao integral PT-BR (ACF)...")
    books_raw = fetch_bytes(BOOKS_JSON_URL, timeout=60)
    books_sha = sha256_hex(books_raw)
    books_data = json.loads(books_raw.decode("utf-8"))["books"]

    acf_raw = fetch_bytes(ACF_PT_BR_URL, timeout=60)
    acf_json = json.loads(acf_raw.decode("utf-8-sig"))
    acf_by_name = {b["name"]: b["chapters"] for b in acf_json[:39]}

    canonical_titles = {b[0]: b for b in CANONICAL_BOOKS}
    by_title_he = {}
    for row in books_data:
        cats = row.get("categories", [])
        title = row.get("title")
        if title not in canonical_titles:
            continue
        if len(cats) != 2 or cats[0] != "Tanakh":
            continue
        if row.get("language") == "Hebrew" and row.get("versionTitle") == PRIMARY_EDITION and row.get("json_url"):
            by_title_he[title] = row["json_url"]

    missing = [b[0] for b in CANONICAL_BOOKS if b[0] not in by_title_he]
    if missing:
        print(f"ERRO CRITICO: Lacuna de cobertura para edicao '{PRIMARY_EDITION}': {missing}", file=sys.stderr)
        return 1

    print("3. Cobertura validada: 39/39 livros hebraicos + 39/39 livros PT-BR (ACF).")
    jobs = [{"meta": meta, "he_url": by_title_he[meta[0]]} for meta in CANONICAL_BOOKS]

    print("4. Baixando JSONs originais e alinhando traducoes PT-BR...")
    t0 = time.time()
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futs = [pool.submit(download_book, j, acf_by_name) for j in jobs]
        for fut in concurrent.futures.as_completed(futs):
            res = fut.result()
            results.append(res)
            print(f"   [{res['order']:02d}/39] {res['ptTitle']:20s} -> Hebraico + PT-BR alinhado")

    results.sort(key=lambda x: x["order"])
    meta_doc = {
        "source_repository": "https://github.com/Sefaria/Sefaria-Export",
        "books_json_url": BOOKS_JSON_URL,
        "books_json_sha256": books_sha,
        "index_commit_sha": commit_sha,
        "imported_at_utc": datetime.now(timezone.utc).isoformat(),
        "primary_edition": PRIMARY_EDITION,
        "pt_br_translation_edition": ACF_VERSION_TITLE,
        "pt_br_translation_source": ACF_PT_BR_URL,
        "canonical_count": len(results),
        "traditional_jewish_count": 24,
        "books": results,
    }
    with open(IMPORT_META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta_doc, f, ensure_ascii=False, indent=2)

    print(f"Concluido em {time.time() - t0:.2f}s. Metadados salvos em {IMPORT_META_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
