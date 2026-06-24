export interface DstStat {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  size: number;
  mtimeMs: number;
}

export class DstError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "DstError";
  }
}

export interface ExecOptions {
  timeout?: number;
  cwd?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface DstOperation {
  kind: string;
  path?: string;
  args?: unknown[];
  timestamp: number;
  result?: unknown;
}

export interface DstIO {
  readFile(path: string): string;
  readFileBuffer(path: string): Uint8Array;
  writeFile(path: string, content: string): void;
  writeFileBuffer(path: string, data: Uint8Array): void;
  exists(path: string): boolean;
  mkdir(path: string, recursive?: boolean): void;
  readdir(path: string): string[];
  stat(path: string): DstStat;
  lstat(path: string): DstStat;
  unlink(path: string): void;
  copyFile(src: string, dest: string): void;
  rm(path: string, options?: { recursive?: boolean }): void;
  watch(path: string, callback: (event: string, filename: string) => void): { close(): void };
  fetch(url: string, options?: RequestInit): Promise<Response>;
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
  now(): number;
  timestamp(): string;
  random(): number;
  randomId(): string;
  hash(algorithm: string, data: string): string;
  getEnv(key: string): string | undefined;
}
