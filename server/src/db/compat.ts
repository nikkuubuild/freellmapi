/**
 * better-sqlite3 compatibility wrapper over sql.js (WASM SQLite).
 * Provides the same synchronous API used throughout the codebase:
 *   db.exec(), db.pragma(), db.prepare() → .run(), .get(), .all()
 *
 * sql.js keeps the DB in memory and we flush to disk on every write.
 */
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

/** Must be called once before creating any CompatDatabase instances. */
export async function initSqlJsRuntime(): Promise<void> {
  if (!SQL) {
    SQL = await initSqlJs();
  }
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Statement {
  run(...params: any[]): RunResult;
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

export class CompatDatabase {
  private _db: SqlJsDatabase;
  private _path: string | null;

  constructor(filePath: string) {
    if (!SQL) throw new Error('sql.js not initialized. Call initSqlJsRuntime() first.');

    const isMemory = filePath === ':memory:';
    this._path = isMemory ? null : filePath;

    if (!isMemory && fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      this._db = new SQL.Database(buf);
    } else {
      this._db = new SQL.Database();
    }
  }

  /** Flush in-memory DB to disk */
  private _persist(): void {
    if (this._path) {
      const dir = path.dirname(this._path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = this._db.export();
      fs.writeFileSync(this._path, Buffer.from(data));
    }
  }

  exec(sql: string): void {
    this._db.run(sql);
    this._persist();
  }

  pragma(pragmaStr: string): any {
    // better-sqlite3 style: db.pragma('journal_mode = WAL')
    // sql.js doesn't return pragma results the same way, just execute it
    try {
      const results = this._db.exec(`PRAGMA ${pragmaStr}`);
      if (results.length > 0 && results[0].values.length > 0) {
        return results[0].values[0][0];
      }
    } catch {
      // Some pragmas (like WAL) aren't supported in sql.js — ignore silently
    }
    return undefined;
  }

  prepare(sql: string): Statement {
    const db = this._db;
    const persist = () => this._persist();

    return {
      run(...params: any[]): RunResult {
        db.run(sql, params.length === 1 && Array.isArray(params[0]) ? params[0] : params);
        const changesRow = db.exec('SELECT changes() as c, last_insert_rowid() as r');
        const changes = changesRow[0]?.values[0]?.[0] as number ?? 0;
        const lastInsertRowid = changesRow[0]?.values[0]?.[1] as number ?? 0;
        persist();
        return { changes, lastInsertRowid };
      },

      get(...params: any[]): any {
        const stmt = db.prepare(sql);
        stmt.bind(params.length === 1 && Array.isArray(params[0]) ? params[0] : params);
        if (stmt.step()) {
          const columns = stmt.getColumnNames();
          const values = stmt.get();
          stmt.free();
          const row: any = {};
          for (let i = 0; i < columns.length; i++) {
            row[columns[i]] = values[i];
          }
          return row;
        }
        stmt.free();
        return undefined;
      },

      all(...params: any[]): any[] {
        const stmt = db.prepare(sql);
        stmt.bind(params.length === 1 && Array.isArray(params[0]) ? params[0] : params);
        const rows: any[] = [];
        while (stmt.step()) {
          const columns = stmt.getColumnNames();
          const values = stmt.get();
          const row: any = {};
          for (let i = 0; i < columns.length; i++) {
            row[columns[i]] = values[i];
          }
          rows.push(row);
        }
        stmt.free();
        return rows;
      },
    };
  }

  /**
   * better-sqlite3-compatible transaction wrapper.
   * Accepts a function, wraps it in BEGIN/COMMIT, rolls back on error.
   * Returns a callable that executes the transaction when invoked.
   */
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    const self = this;
    const wrapper = ((...args: any[]) => {
      self._db.run('BEGIN');
      try {
        const result = fn(...args);
        self._db.run('COMMIT');
        self._persist();
        return result;
      } catch (err) {
        self._db.run('ROLLBACK');
        throw err;
      }
    }) as unknown as T;
    return wrapper;
  }

  close(): void {
    this._persist();
    this._db.close();
  }
}
