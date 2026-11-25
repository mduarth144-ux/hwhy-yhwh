# Contrato de Integração de Traduções — YA-WE | Pattern Engine (`TRANSLATION_FORMAT`)

**Versão do Contrato (`schemaVersion`):** `1.0.0`  
**Consumidor:** `YA-WE | Pattern Engine` (`TranslationRegistry` em `engine/translations.ts`)  
**Produtor Externo Previsto:** `yawe-bible-importer` (e importadores locais compatíveis)

Este documento especifica integralmente o formato de arquivos, identificadores canônicos, regras de versificação, tratamento de lacunas e fluxo de instalação para que traduções adicionais sejam carregadas pelo YA-WE **sem alterar nem reconstruir os índices hebraicos/aramaicos massoréticos** (`data/original/`, `data/search/`, `data/maps/`).

---

## 1. Princípios Arquiteturais

1. **Desacoplamento Absoluto**: O corpus massorético (39 livros do Tanakh, *Miqra according to the Masorah*) nunca incorpora traduções em seus streams ou mapas. Toda resolução de texto traduzido ocorre em tempo de execução via `TranslationRegistry` (`(translationId, bookId, chapter, verse)`).
2. **Proveniência e Licenciamento**: Traduções com distribuição restrita (ex.: *TNM 1986*, *Matos Soares*) podem ser instaladas localmente em `data/translations/<id>/`, devendo ser marcadas com `"restrictedDistribution": true` e **não** devem ser publicadas no Git sem autorização (regras reservadas em `.gitignore`).
3. **Nenhuma Confusão entre Vazio e Lacuna**: Uma string vazia `""` nunca deve ser usada silenciosamente para indicar omissão ou diferença de versificação. Versículos ausentes, omitidos, combinados ou sobrescritos utilizam `null` em `text` e/ou registro explícito em `verseStates`.
4. **Sem Fabricação de Original**: Livros do Novo Testamento ou Deuterocanônicos podem estar presentes em traduções instaladas e serem lidos normalmente no Explorador/Comparador, porém são identificados como **sem original massorético indexado** nos motores de busca consonantal hebraica.

---

## 2. Estrutura de Diretórios Esperada

```text
data/
  translations/
    manifest.json                # Índice global opcional / auto-gerado (schema global-translations-manifest.v1)
    acf/                         # Tradução aberta migrada e validada (PT-BR)
      manifest.json              # Manifesto da tradução ACF (schema translation-manifest.v1)
      genesis.json               # Livro individual (schema translation-book.v1)
      exodus.json
      ...
      ii_chronicles.json
    <translation_id>/            # Nova tradução instalada pelo yawe-bible-importer
      manifest.json              # OBRIGATÓRIO para descoberta automática
      genesis.json
      ...
      tobit.json                 # Deuterocanônicos quando existentes na edição
      matthew.json               # Novo Testamento quando existente na edição
```

### Schemas JSON Versionados
- `docs/schemas/global-translations-manifest.v1.schema.json`
- `docs/schemas/translation-manifest.v1.schema.json`
- `docs/schemas/translation-book.v1.schema.json`

Exemplos mínimos válidos estão disponíveis em `docs/examples/`.

---

## 3. Manifesto Individual (`data/translations/<id>/manifest.json`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `schemaVersion` | `"1.0.0"` | Sim | Versão do contrato estrutural. |
| `id` | `string` | Sim | Slug único (`^[a-z0-9][a-z0-9_-]{1,47}$`), igual ao nome da pasta (ex.: `acf`, `tnm1986`, `matos-soares`). |
| `name` | `string` | Sim | Nome completo da tradução/edição. |
| `sigla` | `string` | Sim | Sigla curta para comparação (ex.: `ACF`, `TNM`, `MS`). |
| `language` | `string` | Sim | Tag BCP-47 (ex.: `pt-BR`, `pt-PT`, `es`, `la`). |
| `edition` | `string` | Sim | Identificação editorial/ano. |
| `revision` | `string` | Sim | Revisão do texto ou da importação. |
| `origin` | `object` | Sim | `{ sourceLabel, sourceUrl?, importer?, importedAtUtc? }`. |
| `copyright` | `object` | Sim | `{ license, restrictedDistribution, holder?, notice? }`. |
| `canon` | `enum` | Sim | `tanakh`, `protestant_66`, `catholic_73`, `lxx` ou `custom`. |
| `versification` | `object` | Sim | `{ system, mappedToMasoretic, validationStatus, notes? }`. |
| `validation` | `object` | Sim | `{ status: 'validated'|'partial'|'unvalidated'|'draft', validatedAtUtc?, validator?, notes? }`. |
| `books` | `array` | Sim | Lista de livros disponíveis com `bookId`, `title`, `canonGroup`, `order`, `file`, `chapters`, `verses`, `sha256`, `versificationStatus`, `lacunaeCount?`. |

> **Nota sobre `sha256`**: Hash SHA-256 em hexadecimal minúsculo (64 caracteres) dos bytes UTF-8 exatos do arquivo `<bookId>.json`. O `TranslationRegistry` valida integridade básica na carga e sinaliza desvios ou arquivos incompletos sem abortar o servidor.

---

## 4. Arquivo de Livro (`data/translations/<id>/<bookId>.json`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `schemaVersion` | `"1.0.0"` | Sim | Versão do contrato. |
| `translationId` | `string` | Sim | Deve coincidir com `manifest.json -> id`. |
| `bookId` | `string` | Sim | Slug oficial canônico (Seção 5). |
| `title` | `string` | Sim | Título do livro na língua da tradução. |
| `nativeTitle` | `string` | Não | Nome alternativo na capa editorial. |
| `canonGroup` | `enum` | Sim | `torah`, `prophets`, `writings`, `deuterocanonical`, `new_testament`, `apocrypha_addition`. |
| `language` | `string` | Sim | Tag BCP-47. |
| `versification` | `object` | Sim | `{ system, mappedToMasoretic, validated, sourceNumberingPreserved?, notes? }`. |
| `text` | `(string\|null)[][]` | Sim | Matriz `[capítulo_0_based][versículo_0_based]`. HTML editorial deve ser limpo ou neutralizado. |
| `verseStates` | `array` | Não | Estados explícitos para lacunas, omissões, fusões e divisões. |
| `versificationMap` | `array` | Não | Tabela explícita de mapeamento (`1:1`, `1:N`, `N:1`, `unmapped`). |

---

## 5. IDs Oficiais de Livros (`bookId` / `slug`)

### 5.1 Tanakh — Corpus Canônico Hebraico/Aramaico Indexado (39 livros)
- **Torá (`torah`)**: `genesis` (1), `exodus` (2), `leviticus` (3), `numbers` (4), `deuteronomy` (5)
- **Profetas (`prophets`)**: `joshua` (6), `judges` (7), `i_samuel` (8), `ii_samuel` (9), `i_kings` (10), `ii_kings` (11), `isaiah` (12), `jeremiah` (13), `ezekiel` (14), `hosea` (15), `joel` (16), `amos` (17), `obadiah` (18), `jonah` (19), `micah` (20), `nahum` (21), `habakkuk` (22), `zephaniah` (23), `haggai` (24), `zechariah` (25), `malachi` (26)
- **Escritos (`writings`)**: `psalms` (27), `proverbs` (28), `job` (29), `song_of_songs` (30), `ruth` (31), `lamentations` (32), `ecclesiastes` (33), `esther` (34), `daniel` (35), `ezra` (36), `nehemiah` (37), `i_chronicles` (38), `ii_chronicles` (39)

### 5.2 Deuterocanônicos e Adições Gregas (`deuterocanonical` / `apocrypha_addition`)
- `tobit` (Tobias), `judith` (Judite), `wisdom` (Sabedoria de Salomão), `sirach` (Eclesiástico / Ben Sira), `baruch` (Baruc), `letter_of_jeremiah` (Carta de Jeremias), `i_maccabees` (I Macabeus), `ii_maccabees` (II Macabeus)
- `esther_greek` (Adições Gregas a Ester), `prayer_of_azariah` (Oração de Azarias / Cântico dos Três Jovens), `susanna` (Susana), `bel_and_the_dragon` (Bel e o Dragão)

### 5.3 Novo Testamento (`new_testament`)
- `matthew`, `mark`, `luke`, `john`, `acts`
- `romans`, `i_corinthians`, `ii_corinthians`, `galatians`, `ephesians`, `philippians`, `colossians`, `i_thessalonians`, `ii_thessalonians`, `i_timothy`, `ii_timothy`, `titus`, `philemon`, `hebrews`
- `james`, `i_peter`, `ii_peter`, `i_john`, `ii_john`, `iii_john`, `jude`, `revelation`

---

## 6. Versificação, Mapeamentos e Representação de Lacunas

### 6.1 Princípios de Alinhamento
- Cada tradução deve **preservar sua numeração original** quando desejar integridade editorial (`sourceNumberingPreserved: true`) e, ao mesmo tempo, informar o relacionamento com a numeração massorética no Tanakh:
  - **`1:1`**: mesmo versículo, eventualmente deslocado (ex.: Salmos `3:1` cristão ↔ `3:2` massorético devido ao sobrescrito).
  - **`1:N`**: um versículo na tradução desdobra-se em múltiplos versículos massoréticos (ex.: 1Cr 12:4 cristão → 12:4–5 massorético).
  - **`N:1`**: múltiplos versículos na tradução equivalem a um único no texto massorético (ex.: Êx 20:13–16 cristão → Êx 20:13 massorético; Is 63:19b/64:1).
  - **`unmapped`**: passagem adicional ou não alinhada automaticamente (ex.: adições de Ester/Daniel, Deuterocanônicos, NT, ou capítulos ainda não auditados).
- Todo item possui `validated: boolean`. O YA-WE exibe um indicador claro sempre que uma equivalência ainda não estiver validada ou estiver marcada como `unmapped`.

### 6.2 Lacunas, Omissões, Fusões e Versículos Não Convencionais (`verseStates`)
Sempre que uma posição em `text[cIdx][vIdx]` não contiver texto direto convencional, o importador deve registrar um item em `verseStates` com:
- `status`:
  - `"omitted"`: versículo ausente em manuscritos-base ou nesta tradução (ex.: Mt 17:21, At 8:37 em edições críticas). Use `null` em `text`.
  - `"combined"`: texto fundido no versículo anterior/vizinho (preencher `combinedWith`, ex.: `"3:19-20"`).
  - `"split"`: trecho subdividido entre referências.
  - `"non_conventional"`: título, colofão ou sobrescrito salmódico (ex.: Sl 3:1 hebraico).
  - `"lacuna"`: lacuna física/editorial na edição de referência (ex.: Josué 21:36–37 em *Miqra according to the Masorah*).

---

## 7. Descoberta Automática e Procedimento de Instalação (`yawe-bible-importer`)

1. O importador externo gera os arquivos `<bookId>.json`, calcula o `sha256` de cada arquivo gerado e escreve `manifest.json` dentro de uma pasta própria (ex.: `data/translations/minha_traducao/`).
2. Copie essa pasta para `data/translations/<id>/` dentro do projeto YA-WE.
   - **Importante**: Nunca substitua nem remova `data/translations/acf/`, nem modifique `data/maps/`, `data/search/` ou `data/original/`.
3. Opcionalmente atualize `data/translations/manifest.json` ou acione **`POST /api/translations/refresh`** (ou o botão **"Atualizar Catálogo"** na tela *Biblioteca de Traduções* da interface).
4. O `TranslationRegistry`:
   - Lê `data/translations/manifest.json` (se presente) e varre todas as subpastas `data/translations/*/manifest.json`;
   - Valida campos obrigatórios, `schemaVersion`, consistência de `books` e existência dos arquivos JSON;
   - Ignora ou marca com alerta arquivos incompletos/corrompidos sem comprometer o restante do catálogo ou os índices hebraicos;
   - Disponibiliza imediatamente a tradução no Explorador, Dashboard, Buscas, Comparador Multitradução e Caderno.

---

## 8. Exemplos Reais (Extraídos da Migração da ACF)

Veja `data/translations/acf/manifest.json` e `data/translations/acf/psalms.json` para um exemplo completo em produção de:
- 39 livros migrados da `ACF` com hashes SHA-256 por livro;
- Sobrescritos salmódicos catalogados explicitamente em `verseStates` (`status: "non_conventional"`);
- Mapeamentos explícitos de Êxodo 20, Deuteronômio 5, Isaías 63–64, Joel, Malaquias e I Crônicas 12 em `versificationMap`.
