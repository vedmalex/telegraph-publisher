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