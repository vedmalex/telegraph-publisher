/**
 * Core data structures and interfaces for Telegraph metadata management system
 */

/**
 * Publication status enumeration
 */
export enum PublicationStatus {
  NOT_PUBLISHED = "not_published",
  PUBLISHED = "published",
  METADATA_CORRUPTED = "metadata_corrupted",
  METADATA_MISSING = "metadata_missing"
}

/**
 * Rate limiting strategy options
 */
export type BackoffStrategy = 'linear' | 'exponential';

/**
 * Rate limiting configuration for Telegraph API calls
 */
export interface RateLimitConfig {
  /** Base delay between file publications in milliseconds (default: 1500ms) */
  baseDelayMs: number;
  /** Multiplier applied to delay after FLOOD_WAIT errors (default: 2.0) */
  adaptiveMultiplier: number;
  /** Maximum delay cap in milliseconds (default: 30000ms) */
  maxDelayMs: number;
  /** Backoff strategy for repeated FLOOD_WAIT errors (default: 'linear') */
  backoffStrategy: BackoffStrategy;
  /** Maximum retry attempts for FLOOD_WAIT errors (default: 3) */
  maxRetries: number;
  /** Cooldown period after multiple FLOOD_WAITs in milliseconds (default: 60000ms) */
  cooldownPeriodMs: number;
  /** Enable adaptive throttling based on FLOOD_WAIT patterns (default: true) */
  enableAdaptiveThrottling: boolean;
}

/**
 * File metadata stored in YAML front-matter
 */
export interface FileMetadata {
  /** Telegraph page URL */
  telegraphUrl: string;
  /** Telegraph page path for editing */
  editPath: string;
  /** Username/author name */
  username: string;
  /** Publication timestamp in ISO format */
  publishedAt: string;
  /** Original filename for reference */
  originalFilename: string;
  /** Optional page title */
  title?: string;
  /** Optional description */
  description?: string;
  /** Optional content hash for change detection */
  contentHash?: string;
  /**
   * Access token used for publication/editing.
   * 
   * @optional - для backward compatibility
   * @source - может быть из metadata, cache, config, или session
   * @validation - автоматически валидируется при загрузке
   * @backfill - автоматически добавляется при первом успешном редактировании
   */
  accessToken?: string;
  
  // Creative Addition: Token metadata для enhanced diagnostics
  /** Source of the access token for diagnostic purposes */
  tokenSource?: 'metadata' | 'cache' | 'config' | 'session' | 'backfilled';
  /** ISO timestamp when token was last updated */
  tokenUpdatedAt?: string;
  
  /**
   * Map of published dependencies for this file.
   * Records the mapping between local relative paths and their published Telegraph URLs.
   * This enables intelligent dependency change detection and republication decisions.
   * 
   * @example
   * ```yaml
   * publishedDependencies:
   *   ./chapter1.md: "https://telegra.ph/Chapter-1-08-07"
   *   ../shared/glossary.md: "https://telegra.ph/Glossary-08-07"
   * ```
   * 
   * @optional - for backward compatibility with existing files
   * @format - Record<relativePath, telegraphUrl>
   * @autoManaged - automatically collected during publication
   */
  publishedDependencies?: Record<string, string>;
}

/**
 * Published page information for caching
 */
export interface PublishedPageInfo {
  /** Telegraph page URL */
  telegraphUrl: string;
  /** Telegraph page path for editing */
  editPath: string;
  /** Page title */
  title: string;
  /** Author name */
  authorName: string;
  /** Local file path if known */
  localFilePath?: string;
  /** Publication timestamp */
  publishedAt: string;
  /** Last updated timestamp */
  lastUpdated: string;
  /** Page views count */
  views?: number;
  /** Content hash for change detection (Evolutionary Interface Design pattern) */
  contentHash?: string;
  /**
   * Access token associated with this published page.
   * 
   * @persistence - сохраняется в .telegraph-pages-cache.json
   * @restoration - используется для восстановления метаданных
   * @consistency - поддерживает sync между файлом и кэшем
   */
  accessToken?: string;
  
  // Creative Addition: Enhanced cache metadata
  /** Cache version for future cache migrations */
  cacheVersion?: string;
  /** Last token validation timestamp */
  lastTokenValidation?: string;
}

/**
 * Published pages cache structure
 */
export interface PublishedPagesCache {
  /** Cache version for compatibility */
  version: string;
  /** Last update timestamp */
  lastUpdated: string;
  /** Access token hash for verification */
  accessTokenHash: string;
  /** Map of page URLs to page info */
  pages: Record<string, PublishedPageInfo>;
  /** Map of local file paths to Telegraph URLs */
  localToTelegraph: Record<string, string>;
  /** Map of Telegraph URLs to local file paths */
  telegraphToLocal: Record<string, string>;
}

/**
 * Local link information found in markdown content
 */
export interface LocalLink {
  /** Link text displayed to user */
  text: string;
  /** Original local path as written in markdown */
  originalPath: string;
  /** Resolved absolute file path */
  resolvedPath: string;
  /** Whether the linked file has been published */
  isPublished: boolean;
  /** Telegraph URL if file is published */
  telegraphUrl?: string;
  /** Full markdown link match for replacement */
  fullMatch: string;
  /** Start position in content */
  startIndex: number;
  /** End position in content */
  endIndex: number;
  /** Whether this is an internal link to our published page */
  isInternalLink?: boolean;
}

/**
 * Telegraph link information found in content
 */
export interface TelegraphLink {
  /** Link text displayed to user */
  text: string;
  /** Telegraph URL */
  telegraphUrl: string;
  /** Local file path if this is our published page */
  localFilePath?: string;
  /** Full markdown link match for replacement */
  fullMatch: string;
  /** Start position in content */
  startIndex: number;
  /** End position in content */
  endIndex: number;
  /** Whether this link should be converted to local link */
  shouldConvertToLocal: boolean;
}

/**
 * Dependency tree node for managing publication order
 */
export interface DependencyNode {
  /** File path */
  filePath: string;
  /** File metadata if published */
  metadata?: FileMetadata;
  /** Publication status */
  status: PublicationStatus;
  /** Dependencies (files this file links to) */
  dependencies: DependencyNode[];
  /** Whether this node has been processed */
  processed: boolean;
  /** Depth in dependency tree */
  depth: number;
}

/**
 * Content processing result
 */
export interface ProcessedContent {
  /** Original content */
  originalContent: string;
  /** Content without front-matter */
  contentWithoutMetadata: string;
  /** Content with Telegraph URLs (for publishing) */
  contentWithReplacedLinks: string;
  /** Content with local links (for source file) */
  contentWithLocalLinks: string;
  /** Extracted metadata if present */
  metadata?: FileMetadata;
  /** Found local links */
  localLinks: LocalLink[];
  /** Found Telegraph links */
  telegraphLinks: TelegraphLink[];
  /** Whether content was modified */
  hasChanges: boolean;
}

/**
 * Publication result information
 */
export interface PublicationResult {
  /** Whether publication was successful */
  success: boolean;
  /** Telegraph page URL */
  url?: string;
  /** Telegraph page path */
  path?: string;
  /** Error message if failed */
  error?: string;
  /** Whether this was a new publication or edit */
  isNewPublication: boolean;
  /** Metadata that was injected/updated */
  metadata?: FileMetadata;
}

/**
 * Batch publication progress information
 */
export interface PublicationProgress {
  /** Total files to process */
  totalFiles: number;
  /** Files processed so far */
  processedFiles: number;
  /** Files successfully published */
  successfulPublications: number;
  /** Files that failed to publish */
  failedPublications: number;
  /** Current file being processed */
  currentFile?: string;
  /** Overall progress percentage */
  progressPercentage: number;
}

// ============================================================================
// Creative Enhancement: Smart Validation Pattern Types
// ============================================================================

/**
 * Result of token validation with enhanced feedback
 */
export interface ValidationResult {
  /** Whether the token is valid */
  valid: boolean;
  /** Severity level of validation result */
  severity: 'info' | 'warning' | 'error';
  /** Human-readable validation message */
  message: string;
  /** Actionable suggestions for fixing issues */
  suggestions?: string[];
}

/**
 * Context information for token resolution operations
 */
export interface TokenResolutionContext {
  /** File path being processed */
  filePath: string;
  /** File name for logging */
  fileName: string;
  /** Existing metadata from file */
  metadata: FileMetadata | null;
  /** Cache information for file */
  cacheInfo: PublishedPageInfo | null;
  /** Hierarchical configuration */
  hierarchicalConfig: any; // Will be typed properly when ConfigManager is enhanced
  /** Current session token */
  sessionToken?: string;
  /** Processing timestamp */
  timestamp: string;
}

/**
 * Result of token resolution with source tracking
 */
export interface ResolvedToken {
  /** Whether resolution was successful */
  success: boolean;
  /** The resolved token (if successful) */
  token?: string;
  /** Source of the token */
  source?: 'metadata' | 'cache' | 'config' | 'session';
  /** Confidence level in the resolution */
  confidence?: 'high' | 'medium' | 'low';
  /** Human-readable message */
  message?: string;
  /** Failure reason (if unsuccessful) */
  reason?: string;
}

/**
 * Configuration options for metadata management
 */
export interface MetadataConfig {
  /** Default username for publications */
  defaultUsername?: string;
  /** Whether to auto-publish dependencies */
  autoPublishDependencies: boolean;
  /** Whether to replace links in published content */
  replaceLinksinContent: boolean;
  /** Maximum dependency depth to prevent infinite recursion */
  maxDependencyDepth: number;
  /** Whether to create backup before modifying files */
  createBackups: boolean;
  /** Whether to manage bidirectional links */
  manageBidirectionalLinks: boolean;
  /** Whether to auto-sync published pages cache */
  autoSyncCache: boolean;
  /** Rate limiting configuration for bulk operations */
  rateLimiting: RateLimitConfig;
  /** Custom metadata fields */
  customFields?: Record<string, any>;
}

// ============================================================================
// Creative Enhancement: Hierarchical Configuration Types
// ============================================================================

/**
 * Extended configuration interface including legacy and new fields
 */
export interface ExtendedMetadataConfig extends MetadataConfig {
  /** Access token for hierarchical token resolution */
  accessToken?: string;
  /** Configuration version for compatibility */
  version?: string;
  /** Timestamp when config was last modified */
  lastModified?: string;
}

/**
 * Cached configuration with metadata
 */
export interface CachedConfig {
  /** Configuration object */
  config: ExtendedMetadataConfig;
  /** File path where config was loaded from */
  filePath: string;
  /** File modification time for cache validation */
  modifiedTime: number;
  /** Cache timestamp */
  cachedAt: number;
}

/**
 * Context for deep merge operations
 */
export interface MergeContext {
  /** Current path in object hierarchy */
  path?: string;
  /** Source file path for logging */
  sourcePath?: string;
  /** Target file path for logging */
  targetPath?: string;
}

/**
 * Configuration conflict report
 */
export interface ConflictReport {
  /** Path where conflict occurred */
  path: string;
  /** Value from parent config */
  parentValue: any;
  /** Value from child config */
  childValue: any;
  /** Parent config file path */
  parentSource: string;
  /** Child config file path */
  childSource: string;
  /** Conflict resolution action taken */
  resolution: 'child_wins' | 'parent_wins' | 'merged';
}