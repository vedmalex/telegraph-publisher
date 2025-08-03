/**
 * Public API for the link verification system
 */

export { AutoRepairer } from './AutoRepairer';
export { InteractiveRepairer } from './InteractiveRepairer';
export { LinkResolver } from './LinkResolver';
// Core components
export { LinkScanner } from './LinkScanner';
export { LinkVerifier } from './LinkVerifier';
export { ReportGenerator } from './ReportGenerator';

// Types and interfaces
export type {
  BrokenLink,
  CheckLinksOptions,
  FileScanResult,
  FixResult,
  LinkStatistics,
  MarkdownLink,
  ProgressCallback,
  RepairSummary,
  ScanConfig,
  ScanResult,
  UserAction
} from './types';

// Error types
export {
  LinkVerificationError,
  LinkVerificationException
} from './types';