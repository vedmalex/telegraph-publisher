interface GitHubGistFile {
  filename: string;
}

interface GitHubGistResponse {
  id: string;
  html_url: string;
  description?: string;
  public: boolean;
  files: Record<string, GitHubGistFile>;
}

interface GitHubErrorResponse {
  message?: string;
  errors?: Array<{ message?: string }>;
}

export interface CreateGistOptions {
  filename: string;
  content: string;
  description?: string;
  isPublic?: boolean;
}

export interface UpdateGistOptions {
  gistId: string;
  filename: string;
  content: string;
  description?: string;
}

/**
 * Minimal GitHub Gist API client for create/update operations.
 */
export class GitHubGistPublisher {
  private readonly apiBase = "https://api.github.com";
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  async createGist(options: CreateGistOptions): Promise<GitHubGistResponse> {
    return this.request<GitHubGistResponse>("/gists", {
      method: "POST",
      body: JSON.stringify({
        description: options.description,
        public: options.isPublic ?? false,
        files: {
          [options.filename]: {
            content: options.content,
          },
        },
      }),
    });
  }

  async updateGist(options: UpdateGistOptions): Promise<GitHubGistResponse> {
    const existing = await this.getGist(options.gistId);
    const filesPayload: Record<string, { content: string } | null> = {
      [options.filename]: {
        content: options.content,
      },
    };

    for (const existingFilename of Object.keys(existing.files)) {
      if (existingFilename !== options.filename) {
        // GitHub API removes files when value is null.
        filesPayload[existingFilename] = null;
      }
    }

    return this.request<GitHubGistResponse>(`/gists/${options.gistId}`, {
      method: "PATCH",
      body: JSON.stringify({
        description: options.description ?? existing.description ?? "",
        files: filesPayload,
      }),
    });
  }

  async getGist(gistId: string): Promise<GitHubGistResponse> {
    return this.request<GitHubGistResponse>(`/gists/${gistId}`, {
      method: "GET",
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.apiBase}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "telegraph-publisher-cli",
      },
    });

    if (!response.ok) {
      let errorMessage = `GitHub API error (${response.status})`;

      try {
        const errorBody = (await response.json()) as GitHubErrorResponse;
        if (errorBody.message) {
          errorMessage = `${errorMessage}: ${errorBody.message}`;
        }

        if (errorBody.errors?.length) {
          const details = errorBody.errors
            .map((item) => item.message)
            .filter(Boolean)
            .join("; ");
          if (details) {
            errorMessage = `${errorMessage} - ${details}`;
          }
        }
      } catch {
        // Keep default error message if body is not JSON.
      }

      throw new Error(errorMessage);
    }

    return (await response.json()) as T;
  }
}
