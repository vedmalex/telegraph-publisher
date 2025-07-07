import { expect, test } from "bun:test";
import type { TelegraphNode } from "./telegraphPublisher";
import { TelegraphPublisher } from "./telegraphPublisher";

test("should create a Telegraph account", async () => {
	const publisher = new TelegraphPublisher();
	const account = await publisher.createAccount(
		"Test Author",
		"Test Author Name",
	);

	expect(account).toBeDefined();
	expect(account.short_name).toBe("Test Author");
	expect(account.author_name).toBe("Test Author Name");
	expect(account.access_token).toBeDefined();
});

test("should publish HTML content to Telegraph", async () => {
	const publisher = new TelegraphPublisher();
	await publisher.createAccount("Test Author", "Test Author Name");

	const htmlContent = "<h1>Test Title</h1><p>Test content</p>";
	const result = await publisher.publishHtml("Test Article", htmlContent);

	expect(result).toBeDefined();
	expect(result.title).toBe("Test Article");
	expect(result.url).toBeDefined();
	expect(result.path).toBeDefined();
});

test("should publish markdown content to Telegraph", async () => {
	const publisher = new TelegraphPublisher();
	await publisher.createAccount("Test Author", "Test Author Name");

	const markdownContent = "# Test Title\n\nTest content with **bold** text.";
	const result = await publisher.publishMarkdown(
		"Test Markdown Article",
		markdownContent,
	);

	expect(result).toBeDefined();
	expect(result.title).toBe("Test Markdown Article");
	expect(result.url).toBeDefined();
	expect(result.path).toBeDefined();
});

test("should throw an error if content size exceeds 64KB", () => {
	const publisher = new TelegraphPublisher();
	// Create a large array of nodes that will exceed 64KB when stringified
	const largeContentNodes: TelegraphNode[] = [];
	const singleNode = { tag: "p", children: ["a".repeat(1000)] }; // ~1KB per node
	for (let i = 0; i < 70; i++) {
		// 70 nodes should be > 64KB
		largeContentNodes.push(singleNode);
	}

	expect(() => publisher.checkContentSize(largeContentNodes)).toThrow(
		/Content size \(\d+\.\d{2} KB\) exceeds the Telegra.ph limit of 64 KB\. Please reduce the content size\./,
	);
});

test("should not throw an error if content size is within 64KB", () => {
	const publisher = new TelegraphPublisher();
	// Create a small array of nodes that will be within 64KB when stringified
	const smallContentNodes: TelegraphNode[] = [];
	const singleNode = { tag: "p", children: ["a".repeat(100)] }; // ~0.1KB per node
	for (let i = 0; i < 50; i++) {
		// 50 nodes should be < 64KB
		smallContentNodes.push(singleNode);
	}

	expect(() => publisher.checkContentSize(smallContentNodes)).not.toThrow();
});

test("should retrieve a list of pages", async () => {
	const mockAccessToken = "mock_access_token";
	const mockPageList = {
		ok: true,
		result: {
			total_count: 2,
			pages: [
				{
					path: "test-page-1",
					url: "http://telegra.ph/test-page-1",
					title: "Test Page 1",
					description: "Description for test page 1",
					author_name: "Test Author",
					author_url: "http://example.com/author",
				},
				{
					path: "test-page-2",
					url: "http://telegra.ph/test-page-2",
					title: "Test Page 2",
					description: "Description for test page 2",
					author_name: "Test Author",
					author_url: "http://example.com/author",
				},
			],
		},
	};

	// Mock the global fetch function
	const originalFetch = global.fetch;
	global.fetch = Object.assign(
		async (
			url: Parameters<typeof fetch>[0],
			init?: Parameters<typeof fetch>[1],
		) => {
			if (typeof url === "string" && url.includes("/getPageList")) {
				return new Response(JSON.stringify(mockPageList), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return originalFetch(url, init);
		},
		originalFetch,
	);

	const publisher = new TelegraphPublisher();
	publisher.setAccessToken(mockAccessToken);
	const result = await publisher.listPages();

	expect(result).toBeDefined();
	expect(result.total_count).toBe(2);
	expect(result.pages).toHaveLength(2);
	expect(result.pages[0]?.title).toBe("Test Page 1");
	expect(result.pages[1]?.url).toBe("http://telegra.ph/test-page-2");

	// Restore the original fetch function
	global.fetch = originalFetch;
});

test("should edit an existing page", async () => {
	const mockAccessToken = "mock_access_token";
	const mockPath = "test-page-to-edit";
	const newTitle = "Edited Test Page Title";
	const newContentNodes: TelegraphNode[] = [
		{ tag: "p", children: ["This is the edited content."] },
	];
	const newAuthorName = "Edited Author";
	const newAuthorUrl = "http://example.com/edited-author";

	const mockEditedPage = {
		ok: true,
		result: {
			path: mockPath,
			url: `http://telegra.ph/${mockPath}`,
			title: newTitle,
			description: "",
			author_name: newAuthorName,
			author_url: newAuthorUrl,
			views: 0,
			can_edit: true,
		},
	};

	// Mock the global fetch function
	const originalFetch = global.fetch;
	global.fetch = Object.assign(
		async (
			url: Parameters<typeof fetch>[0],
			init?: Parameters<typeof fetch>[1],
		) => {
			if (typeof url === "string" && url.includes(`/editPage/${mockPath}`)) {
				// Optionally, you can assert on the request body here
				const requestBody = JSON.parse(init?.body as string);
				expect(requestBody.title).toBe(newTitle);
				expect(requestBody.content).toBe(JSON.stringify(newContentNodes));
				expect(requestBody.author_name).toBe(newAuthorName);
				expect(requestBody.author_url).toBe(newAuthorUrl);
				return new Response(JSON.stringify(mockEditedPage), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			return originalFetch(url, init);
		},
		originalFetch,
	);

	const publisher = new TelegraphPublisher();
	publisher.setAccessToken(mockAccessToken);
	const editedPage = await publisher.editPage(
		mockPath,
		newTitle,
		newContentNodes,
		newAuthorName,
		newAuthorUrl,
	);

	expect(editedPage).toBeDefined();
	expect(editedPage.title).toBe(newTitle);
	expect(editedPage.path).toBe(mockPath);
	expect(editedPage.author_name).toBe(newAuthorName);
	expect(editedPage.url).toBe(`http://telegra.ph/${mockPath}`);

	// Restore the original fetch function
	global.fetch = originalFetch;
});
