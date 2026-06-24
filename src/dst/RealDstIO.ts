import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import { dirname } from "node:path";
import type { DstIO, DstStat, ExecOptions, ExecResult } from "./DstIO";
import { DstError } from "./DstIO";

export class RealDstIO implements DstIO {
  readFile(path: string): string {
    try {
      return fs.readFileSync(path, "utf-8");
    } catch (e) {
      throw rethrow(e);
    }
  }

  readFileBuffer(path: string): Uint8Array {
    try {
      return fs.readFileSync(path);
    } catch (e) {
      throw rethrow(e);
    }
  }

  writeFile(path: string, content: string): void {
    try {
      fs.mkdirSync(dirname(path), { recursive: true });
      fs.writeFileSync(path, content, "utf-8");
    } catch (e) {
      throw rethrow(e);
    }
  }

  writeFileBuffer(path: string, data: Uint8Array): void {
    try {
      fs.mkdirSync(dirname(path), { recursive: true });
      fs.writeFileSync(path, data);
    } catch (e) {
      throw rethrow(e);
    }
  }

  exists(path: string): boolean {
    return fs.existsSync(path);
  }

  mkdir(path: string, recursive?: boolean): void {
    try {
      fs.mkdirSync(path, { recursive: recursive ?? false });
    } catch (e) {
      throw rethrow(e);
    }
  }

  readdir(path: string): string[] {
    try {
      return fs.readdirSync(path);
    } catch (e) {
      throw rethrow(e);
    }
  }

  stat(path: string): DstStat {
    try {
      return adaptStat(fs.statSync(path), path);
    } catch (e) {
      throw rethrow(e);
    }
  }

  lstat(path: string): DstStat {
    try {
      return adaptStat(fs.lstatSync(path), path);
    } catch (e) {
      throw rethrow(e);
    }
  }

  unlink(path: string): void {
    try {
      fs.unlinkSync(path);
    } catch (e) {
      throw rethrow(e);
    }
  }

  copyFile(src: string, dest: string): void {
    try {
      fs.mkdirSync(dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    } catch (e) {
      throw rethrow(e);
    }
  }

  rm(path: string, options?: { recursive?: boolean }): void {
    try {
      fs.rmSync(path, options);
    } catch (e) {
      throw rethrow(e);
    }
  }

  watch(path: string, callback: (event: string, filename: string) => void): { close(): void } {
    const watcher = fs.watch(path, (event, filename) => callback(event, filename ?? ""));
    return { close: () => watcher.close() };
  }

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    return globalThis.fetch(url, options);
  }

  async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
    return new Promise((resolve) => {
      execFile(command, args, { timeout: options?.timeout, cwd: options?.cwd }, (error, stdout, stderr) => {
        let exitCode = 0;
        if (error) {
          exitCode = (error as NodeJS.ErrnoException).code === "ENOENT" ? 127 : 1;
        }
        resolve({ stdout: stdout ?? "", stderr: stderr ?? "", exitCode });
      });
    });
  }

  now(): number {
    return Date.now();
  }

  timestamp(): string {
    return new Date().toISOString();
  }

  random(): number {
    return Math.random();
  }

  randomId(): string {
    return randomUUID();
  }

  hash(algorithm: string, data: string): string {
    return createHash(algorithm).update(data).digest("hex");
  }

  getEnv(key: string): string | undefined {
    return process.env[key];
  }
}

function adaptStat(stats: fs.Stats, _path: string): DstStat {
  return {
    isFile: () => stats.isFile(),
    isDirectory: () => stats.isDirectory(),
    isSymbolicLink: () => stats.isSymbolicLink(),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
  };
}

function rethrow(e: unknown): never {
  if (e && typeof e === "object" && "code" in e) {
    throw new DstError((e as Error).message, (e as { code: string }).code);
  }
  throw e;
}
