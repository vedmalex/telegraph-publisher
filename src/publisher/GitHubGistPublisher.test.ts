import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { GitHubGistPublisher } from "./GitHubGistPublisher";

describe("GitHubGistPublisher", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should create private gist by default", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;

      return new Response(
        JSON.stringify({
          id: "gist-1",
          html_url: "https://gist.github.com/user/gist-1",
          public: false,
          files: {
            "book.md": { filename: "book.md" },
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const publisher = new GitHubGistPublisher("gh-token");
    const result = await publisher.createGist({
      filename: "book.md",
      content: "# Book",
    });

    expect(capturedUrl).toBe("https://api.github.com/gists");
    expect(capturedInit?.method).toBe("POST");

    const body = JSON.parse(String(capturedInit?.body)) as any;
    expect(body.public).toBe(false);
    expect(body.files["book.md"].content).toBe("# Book");
    expect(result.html_url).toBe("https://gist.github.com/user/gist-1");
  });

  it("should update gist and remove old files to keep single markdown file", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlString = String(url);
      calls.push({ url: urlString, init });

      if (urlString.endsWith("/gists/gist-123") && init?.method === "GET") {
        return new Response(
          JSON.stringify({
            id: "gist-123",
            html_url: "https://gist.github.com/user/gist-123",
            description: "Previous",
            public: false,
            files: {
              "old.md": { filename: "old.md" },
              "legacy.md": { filename: "legacy.md" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlString.endsWith("/gists/gist-123") && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            id: "gist-123",
            html_url: "https://gist.github.com/user/gist-123",
            description: "Updated",
            public: false,
            files: {
              "new.md": { filename: "new.md" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const publisher = new GitHubGistPublisher("gh-token");
    const result = await publisher.updateGist({
      gistId: "gist-123",
      filename: "new.md",
      content: "# Updated content",
      description: "Updated",
    });

    expect(calls.length).toBe(2);
    expect(calls[0]?.init?.method).toBe("GET");
    expect(calls[1]?.init?.method).toBe("PATCH");

    const patchBody = JSON.parse(String(calls[1]?.init?.body)) as any;
    expect(patchBody.files["new.md"].content).toBe("# Updated content");
    expect(patchBody.files["old.md"]).toBeNull();
    expect(patchBody.files["legacy.md"]).toBeNull();
    expect(result.id).toBe("gist-123");
  });
});
