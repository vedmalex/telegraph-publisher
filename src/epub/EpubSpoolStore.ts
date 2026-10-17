import type { EpubBuildSession } from "./EpubBuildSession";
import { checkEpubAbort } from "./EpubIO";
import { EpubBuildError, type EpubUnitPayload, type UnitId } from "./EpubTypes";

/** Immutable per-unit records permit rerendering without retaining the book's token bodies. */
export class EpubSpoolStore {
	private readonly records = new Set<string>();
	private active?: { ref: string; payload: EpubUnitPayload };
	private disposed = false;

	constructor(readonly session: EpubBuildSession) {}

	async put(unitId: UnitId, payload: EpubUnitPayload): Promise<string> {
		this.check();
		const name = `payload-${this.session.io.base.hash("sha256", unitId)}.json`;
		const ref = this.session.ownedPath(name);
		if (this.records.has(ref)) {
			throw new EpubBuildError(`Duplicate spool unit: ${unitId}`, "E_STATE");
		}
		const writer = await this.session.openWriter(name);
		try {
			await writer.write(new TextEncoder().encode(JSON.stringify(payload)));
			await writer.close();
			this.records.add(ref);
			return ref;
		} catch (error) {
			await writer.abort().catch(() => undefined);
			throw error;
		}
	}

	async get(ref: string): Promise<EpubUnitPayload> {
		this.check();
		if (!this.records.has(ref)) {
			throw new EpubBuildError(`Unknown spool record: ${ref}`, "E_STATE");
		}
		if (this.active?.ref === ref) {
			return this.active.payload;
		}
		this.active = undefined;

		const info = await this.session.io.stat(ref);
		const bytes = await this.session.io.readRange(ref, 0, info.size);
		if (bytes.length !== info.size) {
			throw new EpubBuildError(`Truncated spool record: ${ref}`, "E_IO");
		}

		let payload: EpubUnitPayload;
		try {
			const value: unknown = JSON.parse(
				new TextDecoder("utf-8", { fatal: true }).decode(bytes),
			);
			if (
				value === null ||
				typeof value !== "object" ||
				!("tokens" in value) ||
				!Array.isArray(value.tokens) ||
				!("links" in value) ||
				!Array.isArray(value.links) ||
				!("images" in value) ||
				!Array.isArray(value.images)
			) {
				throw new Error("Invalid payload record");
			}
			payload = value as EpubUnitPayload;
		} catch {
			throw new EpubBuildError(`Invalid spool record: ${ref}`, "E_PARSE");
		}

		this.active = { ref, payload };
		return payload;
	}

	async release(ref: string): Promise<void> {
		if (this.active?.ref === ref) {
			this.active = undefined;
		}
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.active = undefined;
		const errors: unknown[] = [];

		for (const ref of this.records) {
			try {
				if (!this.session.debug && this.session.io.base.exists(ref)) {
					this.session.io.base.unlink(ref);
				}
			} catch (error) {
				errors.push(error);
			}
		}
		this.records.clear();

		if (errors.length) {
			throw new EpubBuildError(
				`Spool cleanup failed: ${this.session.directory}`,
				"E_CLEANUP",
			);
		}
	}

	private check(): void {
		if (this.disposed) {
			throw new EpubBuildError("Spool store is disposed", "E_STATE");
		}
		checkEpubAbort(this.session.signal);
	}
}
