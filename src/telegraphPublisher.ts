import { convertMarkdownToHtml } from "./markdownConverter";

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

  async createAccount(shortName: string, authorName?: string, authorUrl?: string): Promise<TelegraphAccount> {
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
      throw new Error(`Failed to create account: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as ApiResponse<TelegraphAccount>;

    if (!data.ok) {
      throw new Error(`Telegraph API error: ${data.error}`);
    }

    const account: TelegraphAccount = data.result!;
    this.accessToken = account.access_token;
    this.authorName = account.author_name;
    this.authorUrl = account.author_url;

    return account;
  }

  async publishHtml(title: string, htmlContent: string): Promise<TelegraphPage> {
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
      throw new Error(`Failed to create page: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as ApiResponse<TelegraphPage>;

    if (!data.ok) {
      throw new Error(`Telegraph API error: ${data.error}`);
    }

    return data.result! as TelegraphPage;
  }

  async publishMarkdown(title: string, markdownContent: string): Promise<TelegraphPage> {
    const htmlContent = convertMarkdownToHtml(markdownContent);
    return this.publishHtml(title, htmlContent);
  }

  private htmlToNodes(html: string): TelegraphNode[] {
    // Simple HTML to Telegraph Node conversion
    // This is a basic implementation that handles common HTML tags
    const nodes: TelegraphNode[] = [];

    // Remove HTML comments and clean up
    const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '').trim();

    if (!cleanHtml) {
      return [{ tag: "p", children: [""] }];
    }

    // For now, let's implement a simple approach:
    // Split by common block elements and convert each
    const blockElements = cleanHtml.split(/(<\/?(?:h[1-6]|p|div|br)\s*\/?>)/i);

    for (const element of blockElements) {
      const trimmed = element.trim();
      if (!trimmed) continue;

      // Handle heading tags
      const headingMatch = trimmed.match(/^<(h[1-6])>(.*?)<\/h[1-6]>$/i);
      if (headingMatch && headingMatch[1] && headingMatch[2]) {
        const tag = headingMatch[1].toLowerCase();
        const content = this.stripHtmlTags(headingMatch[2]);
        if (content) {
          nodes.push({ tag, children: [content] });
        }
        continue;
      }

      // Handle paragraph tags
      const pMatch = trimmed.match(/^<p>(.*?)<\/p>$/i);
      if (pMatch && pMatch[1]) {
        const content = this.processInlineElements(pMatch[1]);
        if (content.length > 0) {
          nodes.push({ tag: "p", children: content });
        }
        continue;
      }

      // Handle plain text or other content
      if (!trimmed.match(/^<\/?[^>]+>$/)) {
        const content = this.processInlineElements(trimmed);
        if (content.length > 0) {
          nodes.push({ tag: "p", children: content });
        }
      }
    }

    // If no nodes were created, create a simple paragraph
    if (nodes.length === 0) {
      const content = this.stripHtmlTags(cleanHtml);
      if (content) {
        nodes.push({ tag: "p", children: [content] });
      }
    }

    return nodes;
  }

  private processInlineElements(text: string): (string | TelegraphNode)[] {
    const result: (string | TelegraphNode)[] = [];
    let currentText = text;

    // Handle bold text
    currentText = currentText.replace(/<strong>(.*?)<\/strong>/gi, (match, content) => {
      const placeholder = `__STRONG_${result.length}__`;
      result.push({ tag: "strong", children: [content] });
      return placeholder;
    });

    // Handle links
    currentText = currentText.replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (match, href, content) => {
      const placeholder = `__LINK_${result.length}__`;
      result.push({ tag: "a", attrs: { href }, children: [content] });
      return placeholder;
    });

    // Split by placeholders and reconstruct
    const parts = currentText.split(/(__(?:STRONG|LINK)_\d+__)/);
    const finalResult: (string | TelegraphNode)[] = [];

    for (const part of parts) {
      const strongMatch = part.match(/^__STRONG_(\d+)__$/);
      const linkMatch = part.match(/^__LINK_(\d+)__$/);

      if (strongMatch && strongMatch[1]) {
        const node = result[parseInt(strongMatch[1])];
        if (node !== undefined) {
          finalResult.push(node);
        }
      } else if (linkMatch && linkMatch[1]) {
        const node = result[parseInt(linkMatch[1])];
        if (node !== undefined) {
          finalResult.push(node);
        }
      } else if (part.trim()) {
        finalResult.push(this.stripHtmlTags(part));
      }
    }

    return finalResult.filter(item =>
      typeof item === 'string' ? item.trim() !== '' : true
    );
  }

  private stripHtmlTags(text: string): string {
    return text.replace(/<[^>]*>/g, '').trim();
  }
}