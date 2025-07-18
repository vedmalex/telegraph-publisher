import { convertMarkdownToTelegraphNodes } from "./markdownConverter";

interface ApiResponse<T> {
	ok: boolean;
	result?: T;
	error?: string;
}

export interface TelegraphAccount {
	short_name: string;
	author_name: string;
	author_url?: string;
	access_token: string;
	auth_url?: string;
	page_count?: number;
}

export interface TelegraphPage {
	path: string;
	url: string;
	title: string;
	description?: string;
	author_name?: string;
	author_url?: string;
	image_url?: string;
	views?: number;
	can_edit?: boolean;
}

export interface TelegraphPageList {
	total_count: number;
	pages: TelegraphPage[];
}

export interface TelegraphNode {
	tag?: string;
	attrs?: Record<string, string>;
	children?: (string | TelegraphNode)[];
}

export class TelegraphPublisher {
	private accessToken?: string;
	private authorName?: string;
	private authorUrl?: string;
	private readonly apiBase = "https://api.telegra.ph";

	setAccessToken(token: string) {
		this.accessToken = token;
	}

	async createAccount(
		shortName: string,
		authorName?: string,
		authorUrl?: string,
	): Promise<TelegraphAccount> {
		const params = new URLSearchParams({
			short_name: shortName,
		});

		if (authorName) {
			params.append("author_name", authorName);
		}

		if (authorUrl) {
			params.append("author_url", authorUrl);
		}

		const response = await fetch(`${this.apiBase}/createAccount`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: params,
		});

		if (!response.ok) {
			throw new Error(
				`Failed to create account: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as ApiResponse<TelegraphAccount>;

		if (!data.ok) {
			throw new Error(`Telegraph API error: ${data.error}`);
		}

		const account: TelegraphAccount = data.result as TelegraphAccount;
		this.accessToken = account.access_token;
		this.authorName = account.author_name;
		this.authorUrl = account.author_url;

		return account;
	}

	async getAccountInfo(accessToken: string): Promise<TelegraphAccount> {
		const params = new URLSearchParams({
			access_token: accessToken,
			fields: JSON.stringify([
				"short_name",
				"author_name",
				"author_url",
				"page_count",
			]),
		});

		const response = await fetch(
			`${this.apiBase}/getAccountInfo?${params.toString()}`,
		);

		if (!response.ok) {
			throw new Error(
				`Failed to get account info: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as ApiResponse<TelegraphAccount>;

		if (!data.ok) {
			throw new Error(`Telegraph API error: ${data.error}`);
		}

		return data.result as TelegraphAccount;
	}

	async listPages(
		offset: number = 0,
		limit: number = 50,
	): Promise<TelegraphPageList> {
		if (!this.accessToken) {
			throw new Error("Access token is not set for listPages.");
		}
		const params = new URLSearchParams({
			access_token: this.accessToken,
			offset: offset.toString(),
			limit: limit.toString(),
		});

		const response = await fetch(
			`${this.apiBase}/getPageList?${params.toString()}`,
		);

		if (!response.ok) {
			throw new Error(
				`Failed to list pages: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as ApiResponse<TelegraphPageList>;

		if (!data.ok) {
			throw new Error(`Telegraph API error: ${data.error}`);
		}

		return data.result as TelegraphPageList;
	}

	async publishHtml(
		title: string,
		htmlContent: string,
	): Promise<TelegraphPage> {
		// Store parameters for potential retry
		const originalTitle: string = title;
		const originalHtmlContent: string = htmlContent;

		if (!this.accessToken) {
			throw new Error("No access token. Please create an account first.");
		}

		const content = this.htmlToNodes(htmlContent);

		const params = new URLSearchParams({
			access_token: this.accessToken,
			title: title,
			content: JSON.stringify(content),
			return_content: "false",
		});

		if (this.authorName) {
			params.append("author_name", this.authorName);
		}

		if (this.authorUrl) {
			params.append("author_url", this.authorUrl);
		}

		const response = await fetch(`${this.apiBase}/createPage`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: params,
		});

		if (!response.ok) {
			throw new Error(
				`Failed to create page: ${response.status} ${response.statusText}`,
			);
		}

		const data = (await response.json()) as ApiResponse<TelegraphPage>;

		if (!data.ok) {
			// Handle FLOOD_WAIT errors
			if (data.error && data.error.startsWith('FLOOD_WAIT_')) {
				const waitSeconds = parseInt(data.error!.split('_')[2]) || 5;
				console.warn(`Rate limited by Telegraph API. Waiting ${waitSeconds} seconds...`);
				await this.sleep(waitSeconds * 1000);
				// Retry the request
				return this.publishHtml(title, htmlContent);
			}
			throw new Error(`Telegraph API error: ${data.error}`);
		}

		return data.result as TelegraphPage;
	}

	async publishMarkdown(
		title: string,
		markdownContent: string,
	): Promise<TelegraphPage> {
		const nodes = convertMarkdownToTelegraphNodes(markdownContent);
		return this.publishNodes(title, nodes);
	}

	async publishNodes(
		title: string,
		nodes: TelegraphNode[],
	): Promise<TelegraphPage> {
		if (!this.accessToken) {
			throw new Error("Access token is not set for publishNodes.");
		}
		const payload = {
			access_token: this.accessToken,
			title,
			content: JSON.stringify(nodes),
		};

		const response = await fetch(`${this.apiBase}/createPage`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = (await response.json()) as ApiResponse<TelegraphPage>;
		if (!data.ok) {
			throw new Error(`Telegraph API error: ${data.error}`);
		}

		if (!data.result) {
			throw new Error("Telegraph API returned empty result");
		}

		return data.result;
	}

	async editPage(
		path: string,
		title: string,
		nodes: TelegraphNode[],
		authorName?: string,
		authorUrl?: string,
	): Promise<TelegraphPage> {
		// Store parameters for potential retry
		const originalPath = path;
		const originalTitle = title;
		const originalNodes = nodes;
		const originalAuthorName = authorName;
		const originalAuthorUrl = authorUrl;

		if (!this.accessToken) {
			throw new Error("Access token is not set for editPage.");
		}
		const payload: Record<string, unknown> = {
			access_token: this.accessToken,
			path: path,
			title: title,
			content: JSON.stringify(nodes),
			return_content: false,
		};

		if (authorName) {
			payload.author_name = authorName;
		}
		if (authorUrl) {
			payload.author_url = authorUrl;
		}

		const response = await fetch(`${this.apiBase}/editPage/${path}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = (await response.json()) as ApiResponse<TelegraphPage>;
		if (!data.ok) {
			// Handle FLOOD_WAIT errors
			if (data.error && data.error.startsWith('FLOOD_WAIT_')) {
				const waitSeconds = parseInt(data.error!.split('_')[2]) || 5;
				console.warn(`Rate limited by Telegraph API. Waiting ${waitSeconds} seconds...`);
				await this.sleep(waitSeconds * 1000);
				// Retry the request with original parameters
				return this.editPage(path, title, nodes, authorName, authorUrl);
			}
			throw new Error(`Telegraph API error: ${data.error}`);
		}

		if (!data.result) {
			throw new Error("Telegraph API returned empty result");
		}

		return data.result;
	}

	private htmlToNodes(html: string): TelegraphNode[] {
		const nodes: TelegraphNode[] = [];
		const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, "").trim();

		if (!cleanHtml) {
			return [{ tag: "p", children: [""] }];
		}

		// Regex to capture block-level elements or plain text segments
		// Captures: <tag>content</tag> OR <br/> OR plain_text
		const blockRegex =
			/(<h[1-6]>([\s\S]*?)<\/h[1-6]>|<p>([\s\S]*?)<\/p>|<ul>([\s\S]*?)<\/ul>|<ol>([\s\S]*?)<\/ol>|<li>([\s\S]*?)<\/li>|<blockquote>([\s\S]*?)<\/blockquote>|<br\s*\/?>)|([^<]+)/gi;
		let lastIndex = 0;
		let match: RegExpExecArray | null = null;

		match = blockRegex.exec(cleanHtml);
		while (match !== null) {
			// Handle text before the current match
			if (match.index > lastIndex) {
				const textSegment = cleanHtml.substring(lastIndex, match.index).trim();
				if (textSegment) {
					nodes.push({
						tag: "p",
						children: this.processInlineElements(textSegment),
					});
				}
			}

			const fullTagMatch = match[1]; // The entire matched HTML tag block (e.g., <p>...</p>)
			const plainText = match[8]; // Text not inside any recognized tag

			if (fullTagMatch) {
				// Determine the tag name and content
				const tagContentMatch = fullTagMatch.match(
					/^<(h[1-6]|p|ul|ol|li|blockquote|br)(?:[^>]*)?>(?:([\s\S]*?)<\/\1>)?|<(br\s*\/?)>$/i,
				);

				if (tagContentMatch) {
					const tagName = tagContentMatch[1]
						? tagContentMatch[1].toLowerCase()
						: "";
					const content =
						tagContentMatch[2] !== undefined ? tagContentMatch[2] : "";
					const isSelfClosingBr = !!tagContentMatch[3];

					if (isSelfClosingBr) {
						nodes.push({ tag: "br" });
					} else if (tagName) {
						if (
							["h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote"].includes(
								tagName,
							)
						) {
							nodes.push({
								tag: tagName,
								children: this.processInlineElements(content),
							});
						} else if (["ul", "ol"].includes(tagName)) {
							const listItems: TelegraphNode[] = [];
							// Extract list items using regex
							const listItemRegex = /<li>([\s\S]*?)<\/li>/gi;
							let listItemMatch: RegExpExecArray | null = null;
							listItemMatch = listItemRegex.exec(content);
							while (listItemMatch !== null) {
								if (listItemMatch[1]) {
									listItems.push({
										tag: "li",
										children: this.processInlineElements(listItemMatch[1]),
									});
								}
								listItemMatch = listItemRegex.exec(content);
							}
							nodes.push({ tag: tagName, children: listItems });
						} else if (tagName === "li") {
							// In htmlToNodes, li should be part of ul/ol processing, so this might be redundant based on blockRegex
							nodes.push({
								tag: tagName,
								children: this.processInlineElements(content),
							});
						}
					}
				}
			} else if (plainText) {
				nodes.push({
					tag: "p",
					children: this.processInlineElements(plainText.trim()),
				});
			}
			lastIndex = blockRegex.lastIndex;
			match = blockRegex.exec(cleanHtml);
		}

		// Handle any remaining text after the last match
		if (lastIndex < cleanHtml.length) {
			const remainingText = cleanHtml.substring(lastIndex).trim();
			if (remainingText) {
				nodes.push({
					tag: "p",
					children: this.processInlineElements(remainingText),
				});
			}
		}

		return nodes.filter((node) => {
			if (
				typeof node === "object" &&
				node.tag === "p" &&
				node.children &&
				node.children.length === 1 &&
				node.children[0] === ""
			) {
				return false; // Filter out empty paragraphs
			}
			return true;
		});
	}

	private processInlineElements(text: string): (string | TelegraphNode)[] {
		const result: (string | TelegraphNode)[] = [];
		let currentIndex = 0;

		const patterns = [
			{ regex: /\*\*(.*?)\*\*/g, tag: "strong" },
			{ regex: /__(.*?)__/g, tag: "strong" },
			{ regex: /\*(.*?)\*/g, tag: "em" },
			{ regex: /_(.*?)_/g, tag: "em" },
			{ regex: /`(.*?)`/g, tag: "code" },
			{ regex: /\[(.*?)\]\((.*?)\)/g, tag: "a", isLink: true },
		];

		const matches: Array<{
			index: number;
			length: number;
			tag: string;
			content: string;
			href?: string;
		}> = [];

		for (const pattern of patterns) {
			pattern.regex.lastIndex = 0; // Reset regex
			let match: RegExpExecArray | null = null;
			match = pattern.regex.exec(text);
			while (match !== null) {
				if (match.index !== undefined) {
					if (pattern.isLink) {
						matches.push({
							index: match.index,
							length: match[0].length,
							tag: pattern.tag,
							content: match[1] || "",
							href: match[2] || "",
						});
					} else {
						matches.push({
							index: match.index,
							length: match[0].length,
							tag: pattern.tag,
							content: match[1] || "",
						});
					}
				}
				match = pattern.regex.exec(text);
			}
		}

		matches.sort((a, b) => a.index - b.index);

		for (const match of matches) {
			if (match.index > currentIndex) {
				const plainText = text.substring(currentIndex, match.index);
				if (plainText) {
					result.push(plainText);
				}
			}

			if (match.index < currentIndex) {
				continue;
			}

			if (match.tag === "a" && match.href !== undefined) {
				result.push({
					tag: "a",
					attrs: { href: match.href },
					children: [match.content],
				});
			} else {
				result.push({
					tag: match.tag,
					children: [match.content],
				});
			}

			currentIndex = match.index + match.length;
		}

		if (currentIndex < text.length) {
			const remainingText = text.substring(currentIndex);
			if (remainingText) {
				result.push(remainingText);
			}
		}

		if (result.length === 0) {
			return [text];
		}

		return result;
	}

	private decodeHtmlEntities(text: string): string {
		const entities: { [key: string]: string } = {
			"&amp;": "&",
			"&lt;": "<",
			"&gt;": ">",
			"&quot;": '"',
			// Add more as needed
		};
		let decodedText = text;
		for (const entity in entities) {
			decodedText = decodedText.replace(
				new RegExp(entity, "g"),
				entities[entity] || "",
			);
		}
		return decodedText;
	}

	private stripHtmlTags(text: string): string {
		return text.replace(/<[^>]*>/g, "").trim();
	}

	/**
	 * Checks if the given array of Telegraph nodes exceeds the Telegra.ph content size limit (64 KB).
	 * @param nodes The array of TelegraphNode objects.
	 * @throws Error if the content size exceeds 64 KB.
	 */
	checkContentSize(nodes: TelegraphNode[]): void {
		const contentJson = JSON.stringify(nodes);
		const byteSize = new TextEncoder().encode(contentJson).length;
		const maxBytes = 64 * 1024; // 64 KB

		if (byteSize > maxBytes) {
			throw new Error(
				`Content size (${(byteSize / 1024).toFixed(2)} KB) exceeds the Telegra.ph limit of ${(maxBytes / 1024).toFixed(0)} KB. Please reduce the content size.`,
			);
		}
	}

	/**
	 * Sleep for specified number of milliseconds
	 * @param ms Milliseconds to sleep
	 */
	private async sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
