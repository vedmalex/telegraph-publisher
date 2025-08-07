# Implementation Plan - Comprehensive Token Management System

**Plan Creation Date:** 2025-08-07_10-49
**Based on:** VAN Analysis + FULL_SPEC.md Technical Specification
**Implementation Strategy:** Multi-phase connectivity-based approach

---

## Progress Overview
- **Total Sub-Phases:** 3 (Foundation → Core Logic → Advanced Features)
- **Total Implementation Items:** 31 detailed tasks
- **Completed:** 0
- **In Progress:** 0
- **Not Started:** 31
- **Blocked:** 0

**Implementation Sequence Validated:** **2 → 6 → 3 → 1 → 4 → 5**

---

## 🏗️ Sub-Phase 1: Foundation Layer (Highly Connected)
**Target:** Модели данных и конфигурация
**Dependencies:** None (pure foundation)
**Estimated Effort:** 25% of total implementation
**Risk Level:** LOW

### 1.1 Task 2: Data Models Integration (REQ-2.x) [🔴 Not Started]

#### 1.1.1 FileMetadata Interface Extension [🔴 Not Started]
- **File:** `src/types/metadata.ts`
- **Action:** Add optional `accessToken?: string` field to FileMetadata interface
- **Implementation:**
  ```typescript
  export interface FileMetadata {
    // ... existing fields
    contentHash?: string;
    /**
     * Access token used for publication. Stored directly in the file's
     * front-matter to ensure the correct user context is always used for edits.
     * @optional
     */
    accessToken?: string;
  }
  ```
- **Validation:** Interface compilation success + backward compatibility test
- **Dependencies:** None

#### 1.1.2 PublishedPageInfo Interface Extension [🔴 Not Started]
- **File:** `src/types/metadata.ts`
- **Action:** Add optional `accessToken?: string` field to PublishedPageInfo interface
- **Implementation:**
  ```typescript
  export interface PublishedPageInfo {
    // ... existing fields
    contentHash?: string;
    /**
     * Access token associated with this page. Used for restoring metadata
     * and ensuring the correct user context during dependency publishing.
     * @optional
     */
    accessToken?: string;
  }
  ```
- **Validation:** Interface compilation success + cache compatibility test
- **Dependencies:** 1.1.1 (consistent interface design)

#### 1.1.3 MetadataManager YAML Parsing Enhancement [🔴 Not Started]
- **File:** `src/metadata/MetadataManager.ts`
- **Action:** Extend `parseYamlMetadata` method to handle `accessToken` field
- **Implementation:**
  ```typescript
  // Inside parseYamlMetadata switch statement
  case 'accessToken':
    metadata.accessToken = value;
    break;
  ```
- **Validation:** Test YAML parsing with and without accessToken field
- **Dependencies:** 1.1.1 (FileMetadata interface)

#### 1.1.4 MetadataManager YAML Serialization Enhancement [🔴 Not Started]
- **File:** `src/metadata/MetadataManager.ts`
- **Action:** Extend serialization logic to output `accessToken` field
- **Implementation:**
  ```typescript
  // Inside serializeMetadata method
  if (metadata.accessToken) {
    lines.push(`accessToken: "${metadata.accessToken}"`);
  }
  ```
- **Validation:** Test YAML generation includes accessToken when present
- **Dependencies:** 1.1.3 (parsing implementation)

#### 1.1.5 MetadataManager.createMetadata() Parameter Extension [🔴 Not Started]
- **File:** `src/metadata/MetadataManager.ts`
- **Action:** Add optional `accessToken?: string` parameter to createMetadata method
- **Implementation:**
  ```typescript
  static createMetadata(
    url: string,
    path: string,
    username: string,
    filePath: string,
    contentHash: string,
    title?: string,
    description?: string,
    accessToken?: string // <-- NEW PARAMETER
  ): FileMetadata {
    return {
      // ... existing fields
      contentHash,
      accessToken // <-- ASSIGNMENT
    };
  }
  ```
- **Validation:** Method signature compatibility + parameter handling test
- **Dependencies:** 1.1.1, 1.1.4 (interface and serialization)

#### 1.1.6 PagesCacheManager Integration Audit [🔴 Not Started]
- **File:** `src/cache/PagesCacheManager.ts`
- **Action:** Verify automatic accessToken handling in existing methods
- **Audit Points:**
  - `addPage()`: Verify full object preservation
  - `updatePage()`: Verify spread operator includes accessToken
  - `syncWithTelegraph()`: Document expected undefined behavior
- **Validation:** Unit tests for accessToken persistence in cache operations
- **Dependencies:** 1.1.2 (PublishedPageInfo interface)

#### 1.1.7 EnhancedTelegraphPublisher.addToCache() Enhancement [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Modify addToCache method to accept and use accessToken parameter
- **Implementation:**
  ```typescript
  private addToCache(
    filePath: string, url: string, path: string, title: string, 
    username: string, contentHash?: string, accessToken?: string
  ): void {
    if (this.cacheManager) {
      const pageInfo: PublishedPageInfo = {
        // ... existing fields
        contentHash: contentHash,
        accessToken: accessToken || this.currentAccessToken
      };
      this.cacheManager.addPage(pageInfo);
    }
  }
  ```
- **Validation:** Cache consistency test with accessToken
- **Dependencies:** 1.1.2, 1.1.6 (interfaces and cache manager)

### 1.2 Task 6: Hierarchical Configuration Loading (REQ-6.x) [🔴 Not Started]

#### 1.2.1 Deep Merge Utility Implementation [🔴 Not Started]
- **File:** `src/config/ConfigManager.ts`
- **Action:** Create private utility function for deep object merging
- **Implementation:**
  ```typescript
  private static deepMerge<T>(target: T, source: Partial<T>): T {
    // Recursive deep merge implementation
    // Handle nested objects like customFields, rateLimiting
  }
  ```
- **Validation:** Unit tests for nested object merging scenarios
- **Dependencies:** None

#### 1.2.2 Directory Tree Traversal Logic [🔴 Not Started]
- **File:** `src/config/ConfigManager.ts`
- **Action:** Implement directory traversal from file path to filesystem root
- **Implementation:**
  ```typescript
  private static buildDirectoryHierarchy(startPath: string): string[] {
    // Build array from root to target: ['/', '/project', '/project/docs']
    // Handle both file and directory inputs
  }
  ```
- **Validation:** Test with various path scenarios (file, directory, nested)
- **Dependencies:** None

#### 1.2.3 Configuration Caching Mechanism [🔴 Not Started]
- **File:** `src/config/ConfigManager.ts`
- **Action:** Implement cache for loaded hierarchical configurations
- **Implementation:**
  ```typescript
  private static configCache: Map<string, MetadataConfig> = new Map();
  
  private static getCachedConfig(startPath: string): MetadataConfig | null {
    // Return cached config if available and valid
  }
  ```
- **Validation:** Performance test with repeated config loading
- **Dependencies:** 1.2.1 (deep merge for cache validation)

#### 1.2.4 loadHierarchicalConfig() Main Method [🔴 Not Started]
- **File:** `src/config/ConfigManager.ts`
- **Action:** Implement core hierarchical configuration loading method
- **Implementation:**
  ```typescript
  public static loadHierarchicalConfig(startPath: string): MetadataConfig {
    // 1. Check cache
    // 2. Build directory hierarchy
    // 3. Iterate from root to target, loading configs
    // 4. Deep merge configurations
    // 5. Cache result
    // 6. Return merged config
  }
  ```
- **Validation:** Integration test with nested config scenarios
- **Dependencies:** 1.2.1, 1.2.2, 1.2.3 (all utilities)

#### 1.2.5 EnhancedCommands Integration [🔴 Not Started]
- **File:** `src/cli/EnhancedCommands.ts`
- **Action:** Replace getMetadataConfig() calls with loadHierarchicalConfig()
- **Implementation:**
  ```typescript
  // Replace existing calls:
  // const existingConfig = ConfigManager.getMetadataConfig(fileDirectory);
  
  // With hierarchical version:
  const hierarchicalConfig = ConfigManager.loadHierarchicalConfig(fileDirectory);
  ```
- **Validation:** CLI integration test with hierarchical config scenarios
- **Dependencies:** 1.2.4 (main method implementation)

#### 1.2.6 CLI Priority Preservation [🔴 Not Started]
- **File:** `src/cli/EnhancedCommands.ts`
- **Action:** Ensure CLI options maintain highest priority over hierarchical configs
- **Implementation:**
  ```typescript
  const finalConfig = {
    ...hierarchicalConfig,
    ...configUpdatesFromCli,
    customFields: {
      ...hierarchicalConfig.customFields,
      ...configUpdatesFromCli.customFields,
    }
  };
  ```
- **Validation:** Priority test with CLI overrides
- **Dependencies:** 1.2.5 (integration implementation)

---

## 🧠 Sub-Phase 2: Core Logic Layer (Medium Connected)
**Target:** Логика управления токенами
**Dependencies:** Sub-Phase 1 (foundation data structures)
**Estimated Effort:** 35% of total implementation
**Risk Level:** MEDIUM

### 2.1 Task 3: Token Context Manager (REQ-3.x) [🔴 Not Started]

#### 2.1.1 getEffectiveAccessToken() Core Method [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Implement hierarchical token resolution method
- **Implementation:**
  ```typescript
  private getEffectiveAccessToken(
    filePath: string,
    metadata: FileMetadata | null,
    cacheInfo: PublishedPageInfo | null,
    hierarchicalConfig: MetadataConfig
  ): { token: string; source: 'metadata' | 'cache' | 'config' | 'session' } {
    // Priority 1: File metadata
    if (metadata?.accessToken) return { token: metadata.accessToken, source: 'metadata' };
    
    // Priority 2: Cache info
    if (cacheInfo?.accessToken) return { token: cacheInfo.accessToken, source: 'cache' };
    
    // Priority 3: Hierarchical config
    const configToken = (hierarchicalConfig as any).accessToken;
    if (configToken) return { token: configToken, source: 'config' };
    
    // Priority 4: Current session
    if (this.currentAccessToken) return { token: this.currentAccessToken, source: 'session' };
    
    throw new Error(`No access token available for ${basename(filePath)}`);
  }
  ```
- **Validation:** Unit test all priority scenarios with token source logging
- **Dependencies:** Sub-Phase 1 complete (data models and config loading)

#### 2.1.2 Token Context Isolation Pattern [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Implement safe token context switching pattern
- **Implementation:**
  ```typescript
  // Standard pattern for all publish/edit operations:
  const originalSessionToken = this.currentAccessToken;
  try {
    const { token: effectiveToken, source: tokenSource } = this.getEffectiveAccessToken(...);
    console.log(`🔑 Using ${tokenSource} token for ${basename(filePath)}.`);
    this.setAccessToken(effectiveToken);
    
    // Perform operation...
    
  } finally {
    if (this.currentAccessToken !== originalSessionToken) {
      this.setAccessToken(originalSessionToken);
      console.log(`🔄 Restored original session token.`);
    }
  }
  ```
- **Validation:** Context isolation test with multiple file operations
- **Dependencies:** 2.1.1 (core method)

#### 2.1.3 Token Source Diagnostic Logging [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Implement informative token source logging
- **Implementation:**
  - Log token source for each operation
  - Provide clear messages about token resolution
  - Include file context in diagnostic messages
- **Validation:** Log output verification for each token source type
- **Dependencies:** 2.1.1 (token source detection)

### 2.2 Task 1: Token Backfill & Persistence (REQ-1.x) [🔴 Not Started]

#### 2.2.1 New Publication Token Saving [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Integrate token saving in publishWithMetadata()
- **Implementation:**
  ```typescript
  // After successful publishNodes() call:
  const metadata = MetadataManager.createMetadata(
    page.url, page.path, username, filePath, contentHash,
    metadataTitle, undefined, effectiveToken // <-- TOKEN PASSED
  );
  
  // File writing and cache update with token
  this.addToCache(..., effectiveToken);
  ```
- **Validation:** New file publication includes accessToken in YAML and cache
- **Dependencies:** 2.1.1 (token resolution), Sub-Phase 1 (data models)

#### 2.2.2 Legacy File Token Backfill Logic [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Implement backfill logic in editWithMetadata()
- **Implementation:**
  ```typescript
  // After successful editPage() call:
  if (existingMetadata && !existingMetadata.accessToken) {
    console.log(`🔄 Token backfill: Saving effective token to metadata for ${basename(filePath)}.`);
    
    const updatedMetadata: FileMetadata = {
      ...existingMetadata,
      publishedAt: new Date().toISOString(),
      title: metadataTitle,
      contentHash: updatedContentHash,
      accessToken: effectiveToken // <-- BACKFILL
    };
    
    // Rewrite file with complete metadata
    // Update cache with token
  }
  ```
- **Validation:** Legacy file automatically gets accessToken after edit
- **Dependencies:** 2.1.1 (token resolution), 2.2.1 (pattern established)

#### 2.2.3 publishWithMetadata() Integration [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Complete integration of token management in publishWithMetadata()
- **Implementation:**
  ```typescript
  async publishWithMetadata(filePath, username, options) {
    const originalSessionToken = this.currentAccessToken;
    try {
      // Load context
      const hierarchicalConfig = ConfigManager.loadHierarchicalConfig(filePath);
      const existingMetadata = MetadataManager.getPublicationInfo(filePath);
      const cacheInfo = this.cacheManager?.getPageByLocalPath(filePath);
      
      // Resolve token
      const { token: effectiveToken } = this.getEffectiveAccessToken(
        filePath, existingMetadata, cacheInfo, hierarchicalConfig
      );
      this.setAccessToken(effectiveToken);
      
      // Publication logic with token integration...
      
    } finally {
      if (this.currentAccessToken !== originalSessionToken) {
        this.setAccessToken(originalSessionToken);
      }
    }
  }
  ```
- **Validation:** Complete workflow test with token integration
- **Dependencies:** 2.1.1, 2.1.2, 2.2.1 (core components)

#### 2.2.4 editWithMetadata() Integration [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Complete integration of token management in editWithMetadata()
- **Implementation:** Similar to 2.2.3 but with backfill logic for legacy files
- **Validation:** Edit workflow test with backfill scenarios
- **Dependencies:** 2.1.1, 2.1.2, 2.2.2 (core components and backfill)

#### 2.2.5 Cache Consistency with Token Backfill [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Ensure cache updates include accessToken from backfill operations
- **Implementation:**
  ```typescript
  // After backfill operation:
  this.cacheManager?.updatePage(telegraphUrl, { 
    accessToken: effectiveToken,
    // ... other updates
  });
  ```
- **Validation:** Cache consistency test after backfill operations
- **Dependencies:** 2.2.2, 2.2.4 (backfill implementations)

---

## ⚡ Sub-Phase 3: Advanced Features Layer (Independent)
**Target:** Управление очередью и comprehensive integration
**Dependencies:** Sub-Phase 1 + Sub-Phase 2 (complete foundation)
**Estimated Effort:** 40% of total implementation
**Risk Level:** MEDIUM-HIGH

### 3.1 Task 4: IntelligentRateLimitQueueManager (REQ-4.x) [🔴 Not Started]

#### 3.1.1 Data Structures Definition [🔴 Not Started]
- **File:** `src/publisher/IntelligentRateLimitQueueManager.ts`
- **Action:** Define core interfaces and types
- **Implementation:**
  ```typescript
  export interface PostponedFileInfo {
    originalWaitTime: number;
    retryAfter: number;
    postponedAt: number;
    attempts: number;
  }
  
  export interface QueueDecision {
    action: 'wait' | 'postpone';
    waitSeconds?: number;
  }
  
  export interface QueueStats {
    total: number;
    processed: number;
    postponed: number;
    remaining: number;
  }
  ```
- **Validation:** Interface compilation and type checking
- **Dependencies:** None

#### 3.1.2 Core Class Structure [🔴 Not Started]
- **File:** `src/publisher/IntelligentRateLimitQueueManager.ts`
- **Action:** Implement basic class structure with constants
- **Implementation:**
  ```typescript
  export class IntelligentRateLimitQueueManager {
    private static readonly POSTPONE_THRESHOLD_SECONDS = 30;
    private static readonly MAX_RETRY_ATTEMPTS = 3;
    
    private postponedFiles: Map<string, PostponedFileInfo> = new Map();
    private processedCount = 0;
    private totalFiles = 0;
    
    public initialize(totalFiles: number): void { /* ... */ }
    // ... other method signatures
  }
  ```
- **Validation:** Class instantiation and basic method availability
- **Dependencies:** 3.1.1 (data structures)

#### 3.1.3 handleRateLimit() Decision Logic [🔴 Not Started]
- **File:** `src/publisher/IntelligentRateLimitQueueManager.ts`
- **Action:** Implement core decision-making algorithm
- **Implementation:**
  ```typescript
  public async handleRateLimit(
    filePath: string, 
    waitSeconds: number, 
    processingQueue: string[]
  ): Promise<QueueDecision> {
    const fileName = basename(filePath);
    const filesRemainingInQueue = processingQueue.length - 1;
    const attempts = this.postponedFiles.get(filePath)?.attempts || 0;
    
    const isLongWait = waitSeconds > IntelligentRateLimitQueueManager.POSTPONE_THRESHOLD_SECONDS;
    const areOtherFilesAvailable = filesRemainingInQueue > 0;
    const hasAttemptsLeft = attempts < IntelligentRateLimitQueueManager.MAX_RETRY_ATTEMPTS;
    
    if (isLongWait && areOtherFilesAvailable && hasAttemptsLeft) {
      // Postpone logic: move to end of queue
      return { action: 'postpone' };
    } else {
      // Wait logic: standard delay
      return { action: 'wait', waitSeconds };
    }
  }
  ```
- **Validation:** Decision logic test with various scenarios
- **Dependencies:** 3.1.2 (class structure)

#### 3.1.4 Queue Reordering Logic [🔴 Not Started]
- **File:** `src/publisher/IntelligentRateLimitQueueManager.ts`
- **Action:** Implement queue manipulation for postponed files
- **Implementation:**
  ```typescript
  private reorderQueue(filePath: string, processingQueue: string[]): void {
    const index = processingQueue.indexOf(filePath);
    if (index !== -1) {
      processingQueue.splice(index, 1);  // Remove from current position
      processingQueue.push(filePath);    // Add to end
    }
  }
  ```
- **Validation:** Queue manipulation test with various positions
- **Dependencies:** 3.1.3 (decision logic)

#### 3.1.5 processFinalRetries() Implementation [🔴 Not Started]
- **File:** `src/publisher/IntelligentRateLimitQueueManager.ts`
- **Action:** Implement final retry processing for postponed files
- **Implementation:**
  ```typescript
  public async processFinalRetries(
    publishFn: (filePath: string) => Promise<PublicationResult>
  ): Promise<PublicationResult[]> {
    if (this.postponedFiles.size === 0) return [];
    
    console.log(`🔄 Processing ${this.postponedFiles.size} postponed files...`);
    const results: PublicationResult[] = [];
    
    for (const [filePath, info] of this.postponedFiles.entries()) {
      // Check retry eligibility and timing
      // Execute publishFn with proper error handling
      // Collect results
    }
    
    this.postponedFiles.clear();
    return results;
  }
  ```
- **Validation:** Final retry processing with success/failure scenarios
- **Dependencies:** 3.1.3, 3.1.4 (core logic components)

#### 3.1.6 Progress Tracking and Statistics [🔴 Not Started]
- **File:** `src/publisher/IntelligentRateLimitQueueManager.ts`
- **Action:** Implement comprehensive progress tracking
- **Implementation:**
  ```typescript
  public markSuccessful(filePath: string): void { /* ... */ }
  public markFailed(filePath: string, error: string): void { /* ... */ }
  public getQueueStats(): QueueStats { /* ... */ }
  public getPostponedSummary(): string[] { /* ... */ }
  ```
- **Validation:** Statistics accuracy and progress reporting
- **Dependencies:** 3.1.2 (class structure)

#### 3.1.7 Comprehensive Unit Testing [🔴 Not Started]
- **File:** `src/publisher/IntelligentRateLimitQueueManager.test.ts`
- **Action:** Create comprehensive test suite for queue manager
- **Test Scenarios:**
  - Decision logic with various wait times
  - Queue reordering mechanics
  - Final retry processing
  - Edge cases (single file, max retries, etc.)
- **Validation:** 100% test coverage with all scenarios
- **Dependencies:** 3.1.1-3.1.6 (all implementation components)

### 3.2 Task 5: Comprehensive Publisher Integration (REQ-5.x) [🔴 Not Started]

#### 3.2.1 publishDependencies() Refactoring [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Integrate IntelligentRateLimitQueueManager into dependency publishing
- **Implementation:**
  ```typescript
  async publishDependencies(/* ... */) {
    const queueManager = new IntelligentRateLimitQueueManager();
    queueManager.initialize(analysis.publishOrder.length);
    
    const processingQueue = [...analysis.publishOrder];
    
    for (const fileToProcess of processingQueue) {
      try {
        // Token resolution and context switching
        // Force vs standard processing logic
        // Success handling
      } catch (error) {
        if (error instanceof Error && error.message.includes('FLOOD_WAIT_')) {
          const decision = await queueManager.handleRateLimit(/* ... */);
          // Handle postpone vs wait decisions
        }
        // Other error handling
      } finally {
        // Token context restoration
      }
    }
    
    // Final retry processing
    await queueManager.processFinalRetries(/* ... */);
  }
  ```
- **Validation:** Integration test with queue management scenarios
- **Dependencies:** 3.1.x (queue manager), Sub-Phase 2 (token management)

#### 3.2.2 publishNodes() FLOOD_WAIT Enhancement [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Enhance publishNodes with intelligent FLOOD_WAIT handling
- **Implementation:**
  ```typescript
  // In publishNodes catch block:
  if (error instanceof Error && error.message.includes('FLOOD_WAIT_')) {
    const waitSeconds = extractWaitSeconds(error.message);
    
    if (waitSeconds > IntelligentRateLimitQueueManager.POSTPONE_THRESHOLD_SECONDS) {
      // Create new user and switch
      await this.createNewUserAndSwitch(triggerFile);
      return super.publishNodes(...); // Retry with new user
    } else {
      // Standard wait logic
      await this.rateLimiter.handleFloodWait(waitSeconds);
      return super.publishNodes(...); // Retry with same user
    }
  }
  ```
- **Validation:** FLOOD_WAIT handling test with threshold scenarios
- **Dependencies:** 3.1.x (threshold constants), existing dynamic user switching

#### 3.2.3 editPage() PAGE_ACCESS_DENIED Diagnostics [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Implement enhanced PAGE_ACCESS_DENIED error diagnostics
- **Implementation:**
  ```typescript
  // In editPage catch block:
  if (error instanceof Error && error.message.includes('PAGE_ACCESS_DENIED')) {
    console.error(`🚫 PAGE_ACCESS_DENIED: Token mismatch detected for ${path}`);
    console.error(`💡 Probable cause: File was published with different access token`);
    console.error(`🔧 Possible solutions:`);
    console.error(`   1. Ensure correct accessToken in file metadata`);
    console.error(`   2. Check .telegraph-publisher-config.json in file directory`);
    console.error(`   3. Use --force flag for republication with current token`);
    
    throw new Error(`PAGE_ACCESS_DENIED for ${path}: Token mismatch - see diagnostic messages above`);
  }
  ```
- **Validation:** Error message clarity and actionability test
- **Dependencies:** Sub-Phase 2 (token management context)

#### 3.2.4 createNewUserAndSwitch() Implementation [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Implement intelligent user switching for long FLOOD_WAITs
- **Implementation:**
  ```typescript
  private async createNewUserAndSwitch(triggerFile: string): Promise<void> {
    // Get current account info
    const currentAccount = await this.getAccountInfo();
    
    // Generate unique username variation
    const newUsername = generateUniqueUsername(currentAccount.short_name);
    
    // Create new account with preserved author info
    const newAccount = await this.createAccount(
      newUsername,
      currentAccount.author_name,
      currentAccount.author_url
    );
    
    // Switch to new token
    this.setAccessToken(newAccount.access_token);
    
    console.log(`🔄 Created new user: ${newUsername} (avoiding rate limit for ${basename(triggerFile)})`);
  }
  ```
- **Validation:** User switching test with rate limit scenarios
- **Dependencies:** Existing account management infrastructure

#### 3.2.5 Enhanced Error Diagnostics System [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.ts`
- **Action:** Implement comprehensive error diagnostic system
- **Implementation:**
  - Context-aware error messages
  - Actionable solution suggestions
  - Token source information in errors
  - Queue state information for rate limit errors
- **Validation:** Error message quality and usefulness assessment
- **Dependencies:** Sub-Phase 2 (token context), 3.2.1-3.2.3 (error handling)

#### 3.2.6 End-to-End Integration Testing [🔴 Not Started]
- **File:** `src/publisher/EnhancedTelegraphPublisher.integration.test.ts`
- **Action:** Create comprehensive integration test suite
- **Test Scenarios:**
  - Multi-file publication with token hierarchy
  - Rate limit scenarios with queue management
  - Error recovery and diagnostics
  - Token backfill workflows
  - Hierarchical configuration scenarios
- **Validation:** Complete workflow validation with all features
- **Dependencies:** All previous implementations

---

## 📊 Quality Assurance Framework

### Testing Strategy
- **Unit Tests:** 85% minimum coverage for each component
- **Integration Tests:** End-to-end workflow validation
- **Regression Tests:** Backward compatibility verification
- **Performance Tests:** Configuration loading and queue management benchmarks

### Validation Checkpoints
- **Sub-Phase 1 Complete:** All interfaces extended, configuration loading functional
- **Sub-Phase 2 Complete:** Token hierarchy working, backfill operational
- **Sub-Phase 3 Complete:** Queue optimization functional, diagnostics enhanced

### Success Criteria Validation
- **Backward Compatibility:** Zero breaking changes verified
- **Performance:** Config loading <50ms, token resolution <10ms
- **User Experience:** Actionable error messages, seamless token management
- **System Reliability:** 100% test success rate, zero token leakage

---

## 🔄 Risk Mitigation Strategies

### Technical Risks
- **Integration Complexity:** Phased rollout with validation checkpoints
- **Performance Impact:** Caching mechanisms and benchmarking
- **Backward Compatibility:** Extensive regression testing

### Implementation Risks
- **Token Leakage:** Comprehensive context isolation testing
- **Configuration Conflicts:** Hierarchical merge validation
- **Queue Management:** Edge case scenario testing

### User Experience Risks
- **Error Confusion:** Clear diagnostic message validation
- **Workflow Disruption:** Seamless integration verification
- **Configuration Complexity:** Documentation and examples

---

**Plan Status:** ✅ COMPLETE
**Next Phase:** CREATIVE (Architectural Design Decisions)
**Implementation Readiness:** HIGH (detailed specifications + clear dependencies)

---

## Agreement Compliance Log
- **2025-08-07_10-49:** Plan created following VAN analysis conclusions ✅
- **2025-08-07_10-49:** FULL_SPEC.md technical specifications integrated ✅
- **2025-08-07_10-49:** Sub-phase decomposition strategy applied ✅
- **2025-08-07_10-49:** Implementation sequence 2→6→3→1→4→5 validated ✅ 