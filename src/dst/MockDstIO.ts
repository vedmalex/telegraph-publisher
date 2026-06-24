import { TextDecoder, TextEncoder } from "node:util";
import { createHash } from "node:crypto";
import type { DstIO, DstOperation, DstStat, ExecOptions, ExecResult } from "./DstIO";
import { DstError } from "./DstIO";

function rotl(x: bigint, k: bigint): bigint {
  return (x << k) | (x >> (32n - k));
}

export class MockDstIO implements DstIO {
  private files: Map<string, Uint8Array> = new Map();
  private symlinks: Map<string, string> = new Map();
  private httpHandlers: Map<string, (req: Request) => Response> = new Map();
  private execHandlers: Map<string, (args: string[], options?: ExecOptions) => Promise<ExecResult>> = new Map();
  private watchCallbacks: Map<string, Set<(event: string, filename: string) => void>> = new Map();
  private envStore: Map<string, string> = new Map();
  private opsLog: DstOperation[] = [];
  private clockValue: number = 0;
  private prngState: [bigint, bigint, bigint, bigint];
  private readonly seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
    this.prngState = this.initPrng(seed);
  }

  get ops(): readonly DstOperation[] {
    return this.opsLog;
  }

  addFile(path: string, content: string | Uint8Array): void {
    const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
    this.files.set(normalize(path), data);
  }

  addSymlink(path: string, target: string): void {
    this.symlinks.set(normalize(path), target);
  }

  addHttpHandler(pattern: string, handler: (req: Request) => Response): void {
    this.httpHandlers.set(pattern, handler);
  }

  addExecHandler(command: string, handler: (args: string[], options?: ExecOptions) => Promise<ExecResult>): void {
    this.execHandlers.set(command, handler);
  }

  triggerWatch(path: string, event: string, filename: string): void {
    const cbs = this.watchCallbacks.get(normalize(path));
    if (cbs) {
      for (const cb of cbs) {
        cb(event, filename);
      }
    }
  }

  setEnv(key: string, value: string): void {
    this.envStore.set(key, value);
  }

  reset(): void {
    this.files.clear();
    this.symlinks.clear();
    this.httpHandlers.clear();
    this.execHandlers.clear();
    this.watchCallbacks.clear();
    this.envStore.clear();
    this.opsLog = [];
    this.clockValue = 0;
    this.prngState = this.initPrng(this.seed);
  }

  tick(ms: number = 1): void {
    this.clockValue += ms;
  }

  readFile(path: string): string {
    this.logOp("readFile", path);
    const norm = normalize(path);
    const data = this.files.get(norm);
    if (!data) {
      throw new DstError(`ENOENT: no such file or directory, open '${path}'`, "ENOENT");
    }
    return new TextDecoder().decode(data);
  }

  readFileBuffer(path: string): Uint8Array {
    this.logOp("readFileBuffer", path);
    const norm = normalize(path);
    const data = this.files.get(norm);
    if (!data) {
      throw new DstError(`ENOENT: no such file or directory, open '${path}'`, "ENOENT");
    }
    return data;
  }

  writeFile(path: string, content: string): void {
    this.logOp("writeFile", path);
    this.files.set(normalize(path), new TextEncoder().encode(content));
  }

  writeFileBuffer(path: string, data: Uint8Array): void {
    this.logOp("writeFileBuffer", path);
    this.files.set(normalize(path), data);
  }

  exists(path: string): boolean {
    const norm = normalize(path);
    return this.files.has(norm) || this.symlinks.has(norm);
  }

  mkdir(_path: string, _recursive?: boolean): void {
    // no-op for flat virtual FS
  }

  readdir(path: string): string[] {
    const prefix = normalize(path);
    const entries = new Set<string>();
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix + "/")) {
        const rest = key.slice(prefix.length + 1);
        const first = rest.split("/")[0];
        if (first) entries.add(first);
      }
    }
    return [...entries].sort();
  }

  stat(path: string): DstStat {
    return this.statImpl(path, false);
  }

  lstat(path: string): DstStat {
    return this.statImpl(path, true);
  }

  private statImpl(path: string, isLstat: boolean): DstStat {
    const norm = normalize(path);

    if (isLstat && this.symlinks.has(norm)) {
      return {
        isFile: () => false,
        isDirectory: () => false,
        isSymbolicLink: () => true,
        size: 0,
        mtimeMs: this.clockValue,
      };
    }

    const data = this.files.get(norm);
    if (data) {
      return {
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: data.length,
        mtimeMs: this.clockValue,
      };
    }

    throw new DstError(`ENOENT: no such file or directory, stat '${path}'`, "ENOENT");
  }

  unlink(path: string): void {
    this.logOp("unlink", path);
    const norm = normalize(path);
    if (!this.files.has(norm)) {
      throw new DstError(`ENOENT: no such file or directory, unlink '${path}'`, "ENOENT");
    }
    this.files.delete(norm);
    this.symlinks.delete(norm);
  }

  copyFile(src: string, dest: string): void {
    this.logOp("copyFile", src);
    const srcNorm = normalize(src);
    const data = this.files.get(srcNorm);
    if (!data) {
      throw new DstError(`ENOENT: no such file or directory, copyFile '${src}'`, "ENOENT");
    }
    this.files.set(normalize(dest), new Uint8Array(data));
  }

  rm(path: string, options?: { recursive?: boolean }): void {
    this.logOp("rm", path);
    const norm = normalize(path);
    if (options?.recursive) {
      for (const key of this.files.keys()) {
        if (key === norm || key.startsWith(norm + "/")) {
          this.files.delete(key);
        }
      }
      for (const key of this.symlinks.keys()) {
        if (key === norm || key.startsWith(norm + "/")) {
          this.symlinks.delete(key);
        }
      }
    } else {
      if (!this.files.has(norm)) {
        throw new DstError(`ENOENT: no such file or directory, rm '${path}'`, "ENOENT");
      }
      this.files.delete(norm);
    }
  }

  watch(path: string, callback: (event: string, filename: string) => void): { close(): void } {
    const norm = normalize(path);
    if (!this.watchCallbacks.has(norm)) {
      this.watchCallbacks.set(norm, new Set());
    }
    this.watchCallbacks.get(norm)!.add(callback);
    return {
      close: () => {
        this.watchCallbacks.get(norm)?.delete(callback);
      },
    };
  }

  async fetch(url: string, _options?: RequestInit): Promise<Response> {
    this.logOp("fetch", undefined, [url]);
    for (const [pattern, handler] of this.httpHandlers) {
      if (url.includes(pattern)) {
        return handler(new Request(url));
      }
    }
    throw new DstError(`ENETDOWN: no handler registered for '${url}'`, "ENETDOWN");
  }

  async exec(command: string, args: string[], _options?: ExecOptions): Promise<ExecResult> {
    this.logOp("exec", undefined, [command, ...args]);
    const handler = this.execHandlers.get(command);
    if (!handler) {
      throw new DstError(`ENOENT: no exec handler for '${command}'`, "ENOENT");
    }
    return handler(args, _options);
  }

  now(): number {
    return this.clockValue;
  }

  timestamp(): string {
    return new Date(this.clockValue).toISOString();
  }

  random(): number {
    return this.nextPrng();
  }

  randomId(): string {
    const bytes = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
      bytes[i] = Math.floor(this.nextPrng() * 0x100000000);
    }
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(8, "0"))
      .join("");
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(
      (parseInt(hex.slice(16, 17), 16) & 0x3) |
      0x8
    )
      .toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    return uuid;
  }

  hash(algorithm: string, data: string): string {
    return createHash(algorithm).update(data).digest("hex");
  }

  getEnv(key: string): string | undefined {
    return this.envStore.has(key) ? this.envStore.get(key) : process.env[key];
  }

  private initPrng(seed: number): [bigint, bigint, bigint, bigint] {
    let s = BigInt(seed);
    const state: bigint[] = [];
    for (let i = 0; i < 4; i++) {
      s = (s + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
      let z = s;
      z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n & 0xffffffffffffffffn;
      z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn & 0xffffffffffffffffn;
      z = z ^ (z >> 31n);
      state.push(z & 0xffffffffn);
    }
    return [state[0]!, state[1]!, state[2]!, state[3]!];
  }

  private nextPrng(): number {
    let [s0, s1, s2, s3] = this.prngState;
    const result = rotl(s1 * 5n, 7n) * 9n;
    const t = s1 << 9n;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11n);
    this.prngState = [s0, s1, s2, s3];
    return Number(result & 0x7fffffffn) / 0x80000000;
  }

  private logOp(kind: string, path?: string, args?: unknown[]): void {
    this.opsLog.push({ kind, path, args, timestamp: this.clockValue });
  }
}

function normalize(p: string): string {
  return p.replace(/\/$/, "").replace(/\/\.\//g, "/").replace(/\/\.$/, "");
}
