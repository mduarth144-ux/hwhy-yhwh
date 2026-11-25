import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export interface NotebookEntry {
  id: number;
  title: string;
  reference: string;
  hebrew_snippet: string;
  evidence_tier: string;
  hypothesis: string;
  parameters_json: string;
  translations_snapshot_json: string;
  algorithm_version: string;
  created_at: string;
}

export interface NotebookConnection {
  id: number;
  from_entry_id: number;
  to_entry_id: number;
  relation_note: string;
  created_at: string;
}

export interface PinnedSearchItem {
  id: number;
  label: string;
  module: string;
  query_text: string;
  parameters_json: string;
  last_total_hits: number;
  created_at: string;
}

export class MetadataStore {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    const dbPath = path.join(dataDir, 'yawe_metadata.db');
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notebook_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        reference TEXT NOT NULL,
        hebrew_snippet TEXT NOT NULL DEFAULT '',
        evidence_tier TEXT NOT NULL DEFAULT 'evidencia_textual',
        hypothesis TEXT NOT NULL,
        parameters_json TEXT NOT NULL DEFAULT '{}',
        translations_snapshot_json TEXT NOT NULL DEFAULT '{}',
        algorithm_version TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module TEXT NOT NULL,
        query_summary TEXT NOT NULL,
        parameters_json TEXT NOT NULL,
        total_hits INTEGER NOT NULL,
        algorithm_version TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notebook_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entry_id INTEGER NOT NULL,
        to_entry_id INTEGER NOT NULL,
        relation_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pinned_searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        module TEXT NOT NULL,
        query_text TEXT NOT NULL,
        parameters_json TEXT NOT NULL DEFAULT '{}',
        last_total_hits INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_preferences (
        pref_key TEXT PRIMARY KEY,
        pref_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Migracao segura para bancos existentes sem translations_snapshot_json
    try {
      this.db.exec(
        "ALTER TABLE notebook_entries ADD COLUMN translations_snapshot_json TEXT NOT NULL DEFAULT '{}'",
      );
    } catch {
      // Coluna ja existe
    }
  }

  public listNotebookEntries(): NotebookEntry[] {
    const stmt = this.db.prepare(
      'SELECT id, title, reference, hebrew_snippet, evidence_tier, hypothesis, parameters_json, translations_snapshot_json, algorithm_version, created_at FROM notebook_entries ORDER BY id DESC LIMIT 250',
    );
    return stmt.all() as unknown as NotebookEntry[];
  }

  public addNotebookEntry(input: {
    title: string;
    reference: string;
    hebrew_snippet?: string;
    evidence_tier: string;
    hypothesis: string;
    parameters_json?: string;
    translations_snapshot_json?: string;
    algorithm_version?: string;
  }): NotebookEntry {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `INSERT INTO notebook_entries (title, reference, hebrew_snippet, evidence_tier, hypothesis, parameters_json, translations_snapshot_json, algorithm_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const info = stmt.run(
      input.title.slice(0, 200),
      input.reference.slice(0, 200),
      (input.hebrew_snippet ?? '').slice(0, 2000),
      input.evidence_tier.slice(0, 60),
      input.hypothesis.slice(0, 5000),
      (input.parameters_json ?? '{}').slice(0, 4000),
      (input.translations_snapshot_json ?? '{}').slice(0, 8000),
      (input.algorithm_version ?? '').slice(0, 120),
      now,
    );
    const row = this.db
      .prepare('SELECT * FROM notebook_entries WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as unknown as NotebookEntry;
    return row;
  }

  public deleteNotebookEntry(id: number): boolean {
    this.db.prepare('DELETE FROM notebook_connections WHERE from_entry_id = ? OR to_entry_id = ?').run(id, id);
    const info = this.db.prepare('DELETE FROM notebook_entries WHERE id = ?').run(id);
    return info.changes > 0;
  }

  public listNotebookConnections(): NotebookConnection[] {
    return this.db
      .prepare('SELECT id, from_entry_id, to_entry_id, relation_note, created_at FROM notebook_connections ORDER BY id DESC LIMIT 400')
      .all() as unknown as NotebookConnection[];
  }

  public addNotebookConnection(fromEntryId: number, toEntryId: number, relationNote: string): NotebookConnection {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO notebook_connections (from_entry_id, to_entry_id, relation_note, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(fromEntryId, toEntryId, relationNote.slice(0, 500), now);
    return this.db
      .prepare('SELECT * FROM notebook_connections WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as unknown as NotebookConnection;
  }

  public deleteNotebookConnection(id: number): boolean {
    const info = this.db.prepare('DELETE FROM notebook_connections WHERE id = ?').run(id);
    return info.changes > 0;
  }

  public listPinnedSearches(): PinnedSearchItem[] {
    return this.db
      .prepare('SELECT id, label, module, query_text, parameters_json, last_total_hits, created_at FROM pinned_searches ORDER BY id DESC LIMIT 100')
      .all() as unknown as PinnedSearchItem[];
  }

  public addPinnedSearch(input: {
    label: string;
    module: string;
    query_text: string;
    parameters_json?: string;
    last_total_hits?: number;
  }): PinnedSearchItem {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO pinned_searches (label, module, query_text, parameters_json, last_total_hits, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.label.slice(0, 140),
        input.module.slice(0, 60),
        input.query_text.slice(0, 200),
        (input.parameters_json ?? '{}').slice(0, 4000),
        Number(input.last_total_hits) || 0,
        now,
      );
    return this.db
      .prepare('SELECT * FROM pinned_searches WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as unknown as PinnedSearchItem;
  }

  public deletePinnedSearch(id: number): boolean {
    const info = this.db.prepare('DELETE FROM pinned_searches WHERE id = ?').run(id);
    return info.changes > 0;
  }

  public getPreference(key: string): string | null {
    const row = this.db
      .prepare('SELECT pref_value FROM app_preferences WHERE pref_key = ?')
      .get(key) as { pref_value: string } | undefined;
    return row?.pref_value ?? null;
  }

  public setPreference(key: string, value: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO app_preferences (pref_key, pref_value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(pref_key) DO UPDATE SET pref_value = excluded.pref_value, updated_at = excluded.updated_at`,
      )
      .run(key.slice(0, 100), value.slice(0, 8000), now);
  }

  public logSearch(input: {
    module: string;
    query_summary: string;
    parameters_json: string;
    total_hits: number;
    algorithm_version: string;
  }): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO search_history (module, query_summary, parameters_json, total_hits, algorithm_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.module.slice(0, 60),
        input.query_summary.slice(0, 300),
        input.parameters_json.slice(0, 4000),
        input.total_hits,
        input.algorithm_version.slice(0, 120),
        now,
      );
  }

  public listSearchHistory(limit = 40) {
    return this.db
      .prepare('SELECT * FROM search_history ORDER BY id DESC LIMIT ?')
      .all(Math.min(100, Math.max(1, limit)));
  }
}
