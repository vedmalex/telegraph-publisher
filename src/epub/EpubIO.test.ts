import { describe, expect, test } from "bun:test";
import { checkEpubAbort } from "./EpubIO";
import { EpubBuildError } from "./EpubTypes";
import { MockEpubIO } from "./MockEpubIO";
import { RealEpubIO } from "./RealEpubIO";

describe("EpubIO", () => {
	test("checkEpubAbort throws E_ABORTED when signal is aborted", () => {
		const controller = new AbortController();
		controller.abort();
		expect(() => checkEpubAbort(controller.signal)).toThrow(EpubBuildError);
		try {
			checkEpubAbort(controller.signal);
		} catch (error) {
			expect(error).toBeInstanceOf(EpubBuildError);
			expect((error as EpubBuildError).code).toBe("E_ABORTED");
		}
	});

	test("checkEpubAbort does not throw when signal is not aborted or undefined", () => {
		expect(() => checkEpubAbort(undefined)).not.toThrow();
		const controller = new AbortController();
		expect(() => checkEpubAbort(controller.signal)).not.toThrow();
	});

	test("both RealEpubIO and MockEpubIO fulfill the EpubIO interface", () => {
		const real = new RealEpubIO();
		const mock = new MockEpubIO();

		expect(typeof real.readChunks).toBe("function");
		expect(typeof real.openWriter).toBe("function");
		expect(typeof real.mkdtemp).toBe("function");
		expect(typeof real.renameReplace).toBe("function");
		expect(typeof real.readRange).toBe("function");
		expect(typeof real.stat).toBe("function");
		expect(real.base).toBeDefined();

		expect(typeof mock.readChunks).toBe("function");
		expect(typeof mock.openWriter).toBe("function");
		expect(typeof mock.mkdtemp).toBe("function");
		expect(typeof mock.renameReplace).toBe("function");
		expect(typeof mock.readRange).toBe("function");
		expect(typeof mock.stat).toBe("function");
		expect(mock.base).toBeDefined();
	});
});
