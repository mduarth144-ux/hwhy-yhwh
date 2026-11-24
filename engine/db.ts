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
  algorithm_version: string;
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
    `);
  }

  public listNotebookEntries(): NotebookEntry[] {
    const stmt = this.db.prepare(
      'SELECT id, title, reference, hebrew_snippet, evidence_tier, hypothesis, parameters_json, algorithm_version, created_at FROM notebook_entries ORDER BY id DESC LIMIT 250',
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
    algorithm_version?: string;
  }): NotebookEntry {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `INSERT INTO notebook_entries (title, reference, hebrew_snippet, evidence_tier, hypothesis, parameters_json, algorithm_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const info = stmt.run(
      input.title.slice(0, 200),
      input.reference.slice(0, 200),
      (input.hebrew_snippet ?? '').slice(0, 2000),
      input.evidence_tier.slice(0, 60),
      input.hypothesis.slice(0, 5000),
      (input.parameters_json ?? '{}').slice(0, 4000),
      (input.algorithm_version ?? '').slice(0, 120),
      now,
    );
    const row = this.db
      .prepare('SELECT * FROM notebook_entries WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as unknown as NotebookEntry;
    return row;
  }

  public deleteNotebookEntry(id: number): boolean {
    const info = this.db.prepare('DELETE FROM notebook_entries WHERE id = ?').run(id);
    return info.changes > 0;
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
