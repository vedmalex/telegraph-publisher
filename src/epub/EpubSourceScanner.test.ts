import { describe, expect, test } from "bun:test";
import { EpubBuildSession } from "./EpubBuildSession";
import { parseEpubMarkdown } from "./EpubMarkdownDocument";
import { EpubSourceScanner } from "./EpubSourceScanner";
import { EpubSpoolStore } from "./EpubSpoolStore";
import { EpubBuildError } from "./EpubTypes";
import { MockEpubIO } from "./MockEpubIO";

describe("EpubSourceScanner", () => {
	const sampleSource = `---
title: The Great Chronicle
author: Srila Vyasadeva
---

# Chapter 1: Invocation {#ch-1}

nama oṁ viṣṇu-pādāya kṛṣṇa-preṣṭhāya bhū-tale |
śrīmate bhaktivedānta-svāmin iti nāmine || 1 ||

<!-- Page 108 -->

## Section 1.1: Philosophical Background

Here is a reference to [the commentary][ref1] and [external link](https://example.com).
And an inline image: ![Lotus Flower](images/lotus.png "Sacred Lotus")

| Concept | Description |
| :------ | :---------- |
| Dharma  | Duty        |
| Jnana   | Knowledge   |

\`\`\`\`markdown
\`\`\`js
const code = "nested";
\`\`\`
\`\`\`\`

* First list item
* Second list item with [second ref][ref2]

[ref1]: https://vedabase.io/bg/1/1/ "Bhagavad Gita 1.1"
[ref2]: https://vedabase.io/sb/1/1/1/ "Srimad Bhagavatam 1.1.1"

### Subsection Final Note

Conclusive remarks.
`;

	test("Pass 1: streaming scan produces metadata identical to parseEpubMarkdown", async () => {
		const mock = new MockEpubIO();
		mock.base.writeFile("/input/book.md", sampleSource);

		const session = await EpubBuildSession.create("/out/book.epub", mock, {
			debug: false,
		});

		const scanner = new EpubSourceScanner({ chunkSize: 64 });
		const scanned = await scanner.scan("/input/book.md", 1, session);

		const parsed = parseEpubMarkdown(sampleSource, "/input/book.md", {
			pageBreaks: true,
		});

		// SHA-256 and descriptor parity
		expect(scanned.descriptor.sha256).toBe(parsed.descriptor.sha256);
		expect(scanned.descriptor.originalBytes).toBe(
			parsed.descriptor.originalBytes,
		);
		expect(scanned.descriptor.title).toBe("The Great Chronicle");
		expect(scanned.descriptor.metadata.author).toBe("Srila Vyasadeva");

		// Anchors parity
		expect(scanned.anchors).toEqual(parsed.anchors);

		// Outline parity
		expect(scanned.outline).toEqual(parsed.outline);

		// Definitions parity
		expect(scanned.definitions).toEqual(parsed.definitions);

		// Links parity
		expect(scanned.links).toEqual(parsed.links);

		// Pages parity
		expect(scanned.pages).toEqual(parsed.pages);

		// Images parity
		expect(scanned.images).toEqual(parsed.images);

		// Coverage parity
		expect(scanned.coverage).toEqual(parsed.coverage);
		expect(scanned.coverage.coveredBytes).toBe(scanned.coverage.totalBytes);

		await session.dispose("success");
	});

	test("Pass 1: spool file matches source content byte-for-byte", async () => {
		const mock = new MockEpubIO();
		mock.base.writeFile("/input/book.md", sampleSource);

		const session = await EpubBuildSession.create("/out/book.epub", mock, {
			debug: false,
		});

		const scanner = new EpubSourceScanner();
		const scanned = await scanner.scan("/input/book.md", 2, session);

		expect(mock.base.exists(scanned.sourceSpoolPath)).toBe(true);
		const spooledBytes = mock.base.readFileBuffer(scanned.sourceSpoolPath);
		const originalBytes = mock.base.readFileBuffer("/input/book.md");

		expect(spooledBytes).toEqual(originalBytes);

		await session.dispose("success");
	});

	test("Pass 2: units() streams atomic units, stores payloads in EpubSpoolStore, and allows retrieval", async () => {
		const mock = new MockEpubIO();
		mock.base.writeFile("/input/book.md", sampleSource);

		const session = await EpubBuildSession.create("/out/book.epub", mock, {
			debug: false,
		});

		const store = new EpubSpoolStore(session);
		const scanner = new EpubSourceScanner({ chunkSize: 32 });
		const scanned = await scanner.scan("/input/book.md", 1, session);

		const parsed = parseEpubMarkdown(sampleSource, "/input/book.md", {
			pageBreaks: true,
		});

		const units: Array<ReturnType<typeof parsed.units.slice>[0]> = [];
		for await (const unit of scanner.units(scanned, session, store)) {
			units.push(unit);
		}

		expect(units.length).toBe(parsed.units.length);

		// Compare units structure with parseEpubMarkdown units
		for (let i = 0; i < units.length; i++) {
			const scannedUnit = units[i];
			const parsedUnit = parsed.units[i];
			expect(scannedUnit).toBeDefined();
			expect(parsedUnit).toBeDefined();
			if (!scannedUnit || !parsedUnit) continue;

			expect(scannedUnit.id).toBe(parsedUnit.id);
			expect(scannedUnit.kind).toBe(parsedUnit.kind);
			expect(scannedUnit.range).toEqual(parsedUnit.range);
			expect(scannedUnit.heading).toEqual(parsedUnit.heading);
			expect(scannedUnit.keepWithNext).toBe(parsedUnit.keepWithNext);
			expect(scannedUnit.anchorIds).toEqual(parsedUnit.anchorIds);

			// Test payload retrieval from store
			const payload = await store.get(scannedUnit.payloadRef);
			expect(payload).toBeDefined();
			expect(payload.tokens[0]?.type).toBe(
				parsed.payloadStore.get(parsedUnit.payloadRef)?.tokens[0]?.type,
			);
			expect(payload.links.length).toBe(
				parsed.payloadStore.get(parsedUnit.payloadRef)?.links.length ?? 0,
			);
			expect(payload.images.length).toBe(
				parsed.payloadStore.get(parsedUnit.payloadRef)?.images.length ?? 0,
			);
		}

		// Trailing heading must have keepWithNext = false
		const lastUnit = units[units.length - 1];
		expect(lastUnit?.keepWithNext).toBe(false);

		await store.dispose();
		await session.dispose("success");
	});

	test("Cancellation via session.signal cleanly aborts scan", async () => {
		const mock = new MockEpubIO();
		mock.base.writeFile("/input/book.md", sampleSource);

		const controller = new AbortController();
		controller.abort();

		const session = await EpubBuildSession.create("/out/book.epub", mock, {
			debug: false,
			signal: controller.signal,
		}).catch((err) => err);

		// If session creation aborted, that verifies abort checking.
		// Also test scanner with aborted signal.
		const freshSession = await EpubBuildSession.create("/out/book.epub", mock, {
			debug: false,
		});

		const abortController = new AbortController();
		const scanner = new EpubSourceScanner();

		abortController.abort();
		(freshSession as { signal?: AbortSignal }).signal = abortController.signal;

		expect(
			scanner.scan("/input/book.md", 1, freshSession),
		).rejects.toThrow(EpubBuildError);

		try {
			await scanner.scan("/input/book.md", 1, freshSession);
		} catch (e) {
			expect((e as EpubBuildError).code).toBe("E_ABORTED");
		}

		await freshSession.dispose("abort");
	});

	test("Duplicate explicit anchors in source trigger E_ANCHOR_DUPLICATE error", async () => {
		const duplicateAnchorSource = `# Heading One {#duplicate-id}

Some text.

# Heading Two {#duplicate-id}
`;
		const mock = new MockEpubIO();
		mock.base.writeFile("/input/duplicate.md", duplicateAnchorSource);

		const session = await EpubBuildSession.create("/out/duplicate.epub", mock, {
			debug: false,
		});

		const scanner = new EpubSourceScanner();
		expect(
			scanner.scan("/input/duplicate.md", 1, session),
		).rejects.toThrow(EpubBuildError);

		try {
			await scanner.scan("/input/duplicate.md", 1, session);
		} catch (e) {
			expect((e as EpubBuildError).code).toBe("E_ANCHOR_DUPLICATE");
		}

		await session.dispose("failure");
	});
});
