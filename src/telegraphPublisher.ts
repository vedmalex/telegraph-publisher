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
    const nodes = convertMarkdownToTelegraphNodes(markdownContent);
    return this.publishNodes(title, nodes);
  }

  async publishNodes(title: string, nodes: TelegraphNode[]): Promise<TelegraphPage> {
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

    const data = await response.json() as ApiResponse<TelegraphPage>;
    if (!data.ok) {
      throw new Error(`Telegraph API error: ${data.error}`);
    }

    if (!data.result) {
      throw new Error('Telegraph API returned empty result');
    }

    return data.result;
  }

  private htmlToNodes(html: string): TelegraphNode[] {
    const nodes: TelegraphNode[] = [];
    let cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '').trim();

    if (!cleanHtml) {
      return [{ tag: "p", children: [""] }];
    }

    // Regex to capture block-level elements or plain text segments
    // Captures: <tag>content</tag> OR <br/> OR plain_text
    const blockRegex = /(<h[1-6]>([\s\S]*?)<\/h[1-6]>|<p>([\s\S]*?)<\/p>|<ul>([\s\S]*?)<\/ul>|<ol>([\s\S]*?)<\/ol>|<li>([\s\S]*?)<\/li>|<blockquote>([\s\S]*?)<\/blockquote>|<br\s*\/?>)|([^<]+)/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(cleanHtml)) !== null) {
      // Handle text before the current match
      if (match.index > lastIndex) {
        const textSegment = cleanHtml.substring(lastIndex, match.index).trim();
        if (textSegment) {
          nodes.push({ tag: "p", children: this.processInlineElements(textSegment) });
        }
      }

      const fullTagMatch = match[1]; // The entire matched HTML tag block (e.g., <p>...</p>)
      const plainText = match[8]; // Text not inside any recognized tag

      if (fullTagMatch) {
        // Determine the tag name and content
        const tagContentMatch = fullTagMatch.match(/^<(h[1-6]|p|ul|ol|li|blockquote|br)(?:[^>]*)?>(?:([\s\S]*?)<\/\1>)?|<(br\s*\/?)>$/i);

        if (tagContentMatch) {
          const tagName = tagContentMatch[1] ? tagContentMatch[1].toLowerCase() : '';
          let content = tagContentMatch[2] !== undefined ? tagContentMatch[2] : '';
          const isSelfClosingBr = !!tagContentMatch[3];

          if (isSelfClosingBr) {
            nodes.push({ tag: "br" });
          } else if (tagName) {
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote'].includes(tagName)) {
              nodes.push({ tag: tagName, children: this.processInlineElements(content) });
            } else if (['ul', 'ol'].includes(tagName)) {
              const listItems = content.match(/<li>([\s\S]*?)<\/li>/gi);
              if (listItems) {
                const listItemNodes: (string | TelegraphNode)[] = listItems.map(item => {
                  const liContent = item.replace(/<\/?li>/gi, '').trim();
                  return { tag: "li", children: this.processInlineElements(liContent) };
                });
                nodes.push({ tag: tagName, children: listItemNodes });
              }
            } else if (tagName === 'li') { // Direct li tag, should ideally be inside ul/ol, but handle for robustness
              nodes.push({ tag: "li", children: this.processInlineElements(content) });
            }
          }
        }
      } else if (plainText) {
        // Handle plain text segments not captured by any specific tag
        if (plainText.trim()) {
          nodes.push({ tag: "p", children: this.processInlineElements(plainText) });
        }
      }
      lastIndex = blockRegex.lastIndex;
    }

    // Handle any remaining text at the end of the string
    if (lastIndex < cleanHtml.length) {
      const remainingText = cleanHtml.substring(lastIndex).trim();
      if (remainingText) {
        nodes.push({ tag: "p", children: this.processInlineElements(remainingText) });
      }
    }

    // Fallback: If no nodes were created but there was content
    if (nodes.length === 0 && cleanHtml.trim()) {
      nodes.push({ tag: "p", children: this.processInlineElements(cleanHtml) });
    }

    return nodes;
  }

  private processInlineElements(text: string): (string | TelegraphNode)[] {
    const result: (string | TelegraphNode)[] = [];
    // Regex to match inline tags: strong, em, a, code, or any plain text not containing '<' or '>'
    const inlineRegex = /(<strong>([\s\S]*?)<\/strong>|<em>([\s\S]*?)<\/em>|<a\s+href="([^"]*)">([\s\S]*?)<\/a>|<code>([\s\S]*?)<\/code>)|([^<>]+)/gi;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = inlineRegex.exec(text)) !== null) {
      // Add any plain text before the current match
      if (match.index > lastIndex) {
        const plainText = text.substring(lastIndex, match.index);
        if (plainText.trim()) {
          result.push(this.decodeHtmlEntities(plainText));
        }
      }

      const fullInlineTagMatch = match[1]; // Full matched inline tag (e.g., <strong>...) or undefined
      const plainTextContent = match[7]; // Plain text content outside of tags or undefined

      if (fullInlineTagMatch) {
        // Process matched inline tag
        if (match[2] !== undefined) { // strong tag content
          result.push({ tag: "strong", children: this.processInlineElements(match[2]) });
        } else if (match[3] !== undefined) { // em tag content
          result.push({ tag: "em", children: this.processInlineElements(match[3]) });
        } else if (match[4] !== undefined && match[5] !== undefined) { // a tag content
          const href = match[4];
          const content = match[5];
          result.push({ tag: "a", attrs: { href }, children: this.processInlineElements(content) });
        } else if (match[6] !== undefined) { // code tag content
          result.push({ tag: "code", children: [this.decodeHtmlEntities(match[6])] });
        }
      } else if (plainTextContent) {
        // Handle plain text content
        if (plainTextContent.trim()) {
          result.push(this.decodeHtmlEntities(plainTextContent));
        }
      }

      lastIndex = inlineRegex.lastIndex;
    }

    // Add any remaining plain text after the last match
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      if (remainingText.trim()) {
        result.push(this.decodeHtmlEntities(remainingText));
      }
    }

    return result.filter(item => typeof item === 'string' ? item.trim() !== '' : true);
  }

  private decodeHtmlEntities(text: string): string {
    const entities: { [key: string]: string } = {
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"'
      // Add more as needed
    };
    let decodedText = text;
    for (const entity in entities) {
      decodedText = decodedText.replace(new RegExp(entity, 'g'), entities[entity] || '');
    }
    return decodedText;
  }

  private stripHtmlTags(text: string): string {
    return text.replace(/<[^>]*>/g, '').trim();
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
        `Content size (${(byteSize / 1024).toFixed(2)} KB) exceeds the Telegra.ph limit of ${(maxBytes / 1024).toFixed(0)} KB. Please reduce the content size.`
      );
    }
  }
}