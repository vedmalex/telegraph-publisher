import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { checkEpubAbort, type EpubIO, type EpubWriter } from "./EpubIO";
import { EpubBuildError, type EpubDiagnostic } from "./EpubTypes";

export type EpubSessionState =
	| "new"
	| "scanning"
	| "planning"
	| "rendering"
	| "packaging"
	| "committing"
	| "done"
	| "disposing"
	| "failed"
	| "aborted";

export class EpubBuildSession {
	state: EpubSessionState = "new";
	outputCommitted = false;
	readonly diagnostics: EpubDiagnostic[] = [];
	private disposed = false;
	private committing = false;
	private readonly writers = new Set<EpubWriter>();

	private constructor(
		readonly outputPath: string,
		readonly directory: string,
		readonly io: EpubIO,
		readonly debug: boolean,
		readonly modified: string,
		readonly signal?: AbortSignal,
	) {}

	static async create(
		outputPath: string,
		io: EpubIO,
		options: { debug: boolean; signal?: AbortSignal },
	): Promise<EpubBuildSession> {
		checkEpubAbort(options.signal);
		const epoch = io.base.getEnv("SOURCE_DATE_EPOCH");
		let milliseconds: number;
		if (epoch !== undefined) {
			if (
				!/^(0|[1-9]\d*)$/.test(epoch) ||
				!Number.isSafeInteger(Number(epoch)) ||
				Number(epoch) * 1000 > 8640000000000000
			) {
				throw new EpubBuildError(
					"SOURCE_DATE_EPOCH must be nonnegative integer seconds in the supported date range",
					"E_OPTION",
				);
			}
			milliseconds = Number(epoch) * 1000;
		} else {
			milliseconds = io.base.now();
		}

		if (
			!Number.isFinite(milliseconds) ||
			Math.abs(milliseconds) > 8640000000000000
		) {
			throw new EpubBuildError("Invalid build clock", "E_OPTION");
		}

		const output = resolve(outputPath);
		const directory = await io.mkdtemp(dirname(output), ".epub-session-");
		const session = new EpubBuildSession(
			output,
			resolve(directory),
			io,
			options.debug,
			new Date(milliseconds).toISOString(),
			options.signal,
		);

		try {
			checkEpubAbort(options.signal);
			return session;
		} catch (error) {
			await session.dispose("abort").catch(() => undefined);
			throw error;
		}
	}

	ownedPath(name: string): string {
		const path = resolve(this.directory, name);
		if (path === this.directory || !this.owns(path)) {
			throw new EpubBuildError(
				`Path is outside EPUB session: ${name}`,
				"E_STATE",
			);
		}
		return path;
	}

	private owns(path: string): boolean {
		const rel = relative(this.directory, resolve(path));
		return (
			rel !== "" &&
			rel !== ".." &&
			!rel.startsWith(`..${sep}`) &&
			!isAbsolute(rel)
		);
	}

	transition(next: EpubSessionState): void {
		const stages: EpubSessionState[] = [
			"new",
			"scanning",
			"planning",
			"rendering",
			"packaging",
			"committing",
			"done",
		];
		const from = stages.indexOf(this.state);
		const to = stages.indexOf(next);
		if (this.disposed || from < 0 || to !== from + 1) {
			throw new EpubBuildError(
				`Invalid EPUB state transition: ${this.state} → ${next}`,
				"E_STATE",
			);
		}
		checkEpubAbort(this.signal);
		this.state = next;
	}

	trackWriter(writer: EpubWriter): EpubWriter {
		if (this.disposed || this.outputCommitted) {
			throw new EpubBuildError("EPUB session is terminal", "E_STATE");
		}
		const tracked: EpubWriter = {
			write: async (bytes) => {
				if (this.disposed || this.outputCommitted) {
					throw new EpubBuildError("EPUB session is terminal", "E_STATE");
				}
				return writer.write(bytes);
			},
			close: async () => {
				try {
					await writer.close();
				} finally {
					this.writers.delete(tracked);
				}
			},
			abort: async () => {
				try {
					await writer.abort();
				} finally {
					this.writers.delete(tracked);
				}
			},
		};
		this.writers.add(tracked);
		return tracked;
	}

	async openWriter(name: string, exclusive = true): Promise<EpubWriter> {
		checkEpubAbort(this.signal);
		if (this.disposed || this.outputCommitted) {
			throw new EpubBuildError("EPUB session is terminal", "E_STATE");
		}
		return this.trackWriter(
			await this.io.openWriter(this.ownedPath(name), { exclusive }),
		);
	}

	async finish(stagedZip: string): Promise<void> {
		if (this.outputCommitted) return;
		if (this.committing) {
			throw new EpubBuildError(
				"EPUB session finish already in progress",
				"E_STATE",
			);
		}
		if (
			this.disposed ||
			this.state !== "packaging" ||
			!this.owns(stagedZip) ||
			this.writers.size > 0
		) {
			throw new EpubBuildError(
				"Invalid EPUB commit state, active writers, or staging path",
				"E_STATE",
			);
		}
		checkEpubAbort(this.signal);
		this.committing = true;
		this.state = "committing";
		try {
			// This is the last abort checkpoint. An already completed rename is never reported as rolled back.
			await this.io.renameReplace(resolve(stagedZip), this.outputPath);
			this.outputCommitted = true;
			this.state = "done";
		} finally {
			this.committing = false;
		}
	}

	async dispose(
		reason: "success" | "failure" | "abort",
		primaryError?: unknown,
	): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const failedAt = this.state;
		this.state = "disposing";
		const errors: unknown[] = [];

		for (const writer of Array.from(this.writers)) {
			try {
				await writer.abort();
			} catch (error) {
				errors.push(error);
			}
		}
		this.writers.clear();

		try {
			if (this.debug) {
				this.io.base.writeFile(
					this.ownedPath("session-manifest.json"),
					JSON.stringify(
						{
							state: failedAt,
							reason,
							outputCommitted: this.outputCommitted,
							modified: this.modified,
						},
						null,
						2,
					),
				);
			} else {
				this.io.base.rm(this.directory, { recursive: true });
			}
		} catch (error) {
			errors.push(error);
		}

		this.state =
			this.outputCommitted || reason === "success"
				? "done"
				: reason === "abort"
					? "aborted"
					: "failed";

		if (errors.length) {
			const diagnostic: EpubDiagnostic = {
				code: "E_CLEANUP",
				severity: "error",
				message: `EPUB cleanup failed; leftover path: ${this.directory}`,
			};
			this.diagnostics.push(diagnostic);
			if (primaryError) {
				throw primaryError;
			}
			throw new EpubBuildError(diagnostic.message, diagnostic.code, [
				diagnostic,
			]);
		}
	}
}
