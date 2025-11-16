import { randomBytes } from "node:crypto";
import { TelegraphPublisher, type TelegraphAccount } from "../telegraphPublisher";
import { ProgressIndicator } from "../cli/ProgressIndicator";
import { ConfigManager } from "../config/ConfigManager";

/**
 * Auto-registration manager for automatic Telegraph account creation
 */
export class AutoRegistrationManager {
  private readonly telegraphPublisher: TelegraphPublisher;

  constructor() {
    this.telegraphPublisher = new TelegraphPublisher();
  }

  /**
   * Generate a unique short name for automatic registration
   * @param baseName Base name to use (optional)
   * @returns Unique short name
   */
  private generateUniqueShortName(baseName?: string): string {
    const timestamp = Date.now();
    const randomSuffix = randomBytes(3).toString('hex');
    const base = baseName || 'AutoUser';

    return `${base}_${timestamp}_${randomSuffix}`.slice(0, 32); // Telegraph limit is 32 chars
  }

  /**
   * Generate author name for automatic registration
   * @param username Custom username (optional)
   * @returns Author name
   */
  private generateAuthorName(username?: string): string {
    if (username) {
      return username;
    }

    // Generate a generic author name
    const adjectives = ['Digital', 'Content', 'Publishing', 'Creative', 'Smart', 'Pro'];
    const nouns = ['Author', 'Writer', 'Publisher', 'Creator', 'Editor'];

    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

    return `${randomAdj} ${randomNoun}`;
  }

  /**
   * Create a new Telegraph account automatically
   * @param options Auto-registration options
   * @returns Created account information
   */
  async createAutoAccount(options: {
    username?: string;
    authorName?: string;
    authorUrl?: string;
    baseShortName?: string;
  } = {}): Promise<TelegraphAccount> {
    try {
      ProgressIndicator.showStatus(
        "🔐 Токен не найден. Создаю новый аккаунт Telegraph...",
        "info"
      );

      const shortName = this.generateUniqueShortName(options.baseShortName);
      const authorName = this.generateAuthorName(options.username || options.authorName);

      ProgressIndicator.showStatus(
        `📝 Регистрация аккаунта: ${shortName} (${authorName})`,
        "info"
      );

      const account = await this.telegraphPublisher.createAccount(
        shortName,
        authorName,
        options.authorUrl
      );

      ProgressIndicator.showStatus(
        `✅ Аккаунт успешно создан! Токен: ${account.access_token.slice(0, 16)}...`,
        "success"
      );

      return account;

    } catch (error) {
      ProgressIndicator.showStatus(
        `❌ Ошибка при создании аккаунта: ${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
      throw error;
    }
  }

  /**
   * Try to get access token with auto-registration fallback
   * @param directory Directory to save token
   * @param options Auto-registration options
   * @returns Access token
   */
  async getOrCreateAccessToken(
    directory: string,
    options: {
      username?: string;
      authorName?: string;
      authorUrl?: string;
      baseShortName?: string;
      forceNewAccount?: boolean;
    } = {}
  ): Promise<string> {
    // Try to load existing token first
    const existingToken = ConfigManager.loadAccessToken(directory);

    if (existingToken && !options.forceNewAccount) {
      ProgressIndicator.showStatus("✅ Найден существующий токен", "success");
      return existingToken;
    }

    // Create new account if no token exists or forced
    const account = await this.createAutoAccount(options);

    // Save the token
    ConfigManager.saveAccessToken(directory, account.access_token);

    ProgressIndicator.showStatus(
      `💾 Токен сохранен в конфигурации`,
      "success"
    );

    return account.access_token;
  }

  /**
   * Validate if an access token is working
   * @param token Access token to validate
   * @returns True if token is valid
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      this.telegraphPublisher.setAccessToken(token);
      await this.telegraphPublisher.getAccountInfo(token);
      return true;
    } catch (error) {
      return false;
    }
  }
}
