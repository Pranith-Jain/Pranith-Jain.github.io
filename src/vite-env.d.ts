/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DFIR_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __BUILD_DATE__: string;

declare module '*.wasm?url' {
  const url: string;
  export default url;
}

declare module 'sql.js' {
  export interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }

  export type SqlValue = number | string | Uint8Array | null;

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | ArrayBuffer | null) => {
      exec(sql: string): QueryExecResult[];
      run(sql: string): void;
      close(): void;
    };
  }

  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
