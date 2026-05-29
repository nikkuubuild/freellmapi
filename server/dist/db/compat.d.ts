/** Must be called once before creating any CompatDatabase instances. */
export declare function initSqlJsRuntime(): Promise<void>;
export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
}
export interface Statement {
    run(...params: any[]): RunResult;
    get(...params: any[]): any;
    all(...params: any[]): any[];
}
export declare class CompatDatabase {
    private _db;
    private _path;
    private _inTransaction;
    constructor(filePath: string);
    /** Flush in-memory DB to disk (skipped during transactions — flushed on COMMIT) */
    private _persist;
    exec(sql: string): void;
    pragma(pragmaStr: string): any;
    prepare(sql: string): Statement;
    /**
     * better-sqlite3-compatible transaction wrapper.
     * Wraps fn in BEGIN/COMMIT. Defers disk persist until COMMIT.
     */
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    close(): void;
}
//# sourceMappingURL=compat.d.ts.map