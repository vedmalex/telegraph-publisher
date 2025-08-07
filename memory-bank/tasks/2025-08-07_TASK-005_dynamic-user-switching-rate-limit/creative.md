# CREATIVE Design: Dynamic User Switching Architecture

**Phase:** CREATIVE
**Date:** 2025-08-07_00-49
**Based on:** VAN analysis and PLAN specifications

## 1. Архитектурные паттерны и решения

### 1.1 "Token Context Manager" Pattern

**Концепция:** Элегантное управление контекстом токенов без нарушения existing workflow

```typescript
interface TokenContext {
  originalToken: string;
  fileSpecificToken?: string;
  isTemporarySwitch: boolean;
}

class TokenContextManager {
  private currentContext: TokenContext | null = null;
  
  enterFileContext(fileToken?: string): TokenContext
  exitFileContext(): void
  getCurrentToken(): string
}
```

**Преимущества:**
- Четкое разделение between session и file-specific tokens
- Automatic restoration после операций
- Минимальное изменение existing code

### 1.2 "Resilient Publisher" Pattern  

**Концепция:** Publisher с встроенной resilience для rate-limit scenarios

```typescript
interface PublisherState {
  accountSwitchCounter: number;
  lastSwitchTimestamp: number;
  switchHistory: UserSwitchEvent[];
}

interface UserSwitchEvent {
  timestamp: string;
  originalToken: string;
  newToken: string;
  triggerFile: string;
  reason: 'FLOOD_WAIT' | 'TOKEN_EXPIRED';
}
```

**Особенности:**
- State tracking для debugging и analytics
- Historical context для optimization
- Clear audit trail для troubleshooting

### 1.3 "Graceful Degradation" Strategy

**Концепция:** Fallback mechanisms при критических ошибках

```typescript
enum FallbackStrategy {
  ABORT_ON_CREATE_FAILURE = 'abort',
  RETRY_WITH_DELAY = 'retry',
  USE_ORIGINAL_TOKEN = 'fallback'
}

interface ErrorRecoveryOptions {
  strategy: FallbackStrategy;
  maxRetries: number;
  retryDelayMs: number;
}
```

## 2. Data Architecture Design

### 2.1 Enhanced FileMetadata Structure

**Эволюционный дизайн:** Minimal footprint expansion

```typescript
// BEFORE
interface FileMetadata {
  telegraphUrl: string;
  editPath: string;
  username: string;
  publishedAt: string;
  originalFilename: string;
  title?: string;
  description?: string;
  contentHash?: string;
}

// AFTER (Creative Enhancement)
interface FileMetadata {
  telegraphUrl: string;
  editPath: string;
  username: string;
  publishedAt: string;
  originalFilename: string;
  title?: string;
  description?: string;
  contentHash?: string;
  accessToken?: string;           // NEW: Primary enhancement
  publishedWith?: {               // NEW: Optional enhanced context
    accountName?: string;         // For UI/debugging
    switchGeneration?: number;    // Track if this was from user switch
  };
}
```

**Design Decision:** Optional enrichment без breaking changes

### 2.2 "Smart Token Resolution" Logic

**Приоритетная схема разрешения токенов:**

```typescript
class TokenResolver {
  resolveTokenForOperation(
    operationType: 'publish' | 'edit',
    fileMetadata?: FileMetadata,
    sessionToken?: string
  ): string {
    // 1. Edit operations: ALWAYS use file token if available
    if (operationType === 'edit' && fileMetadata?.accessToken) {
      return fileMetadata.accessToken;
    }
    
    // 2. New publications: use session token (may be switched)
    if (operationType === 'publish' && sessionToken) {
      return sessionToken;
    }
    
    // 3. Fallback to config token
    return this.configToken;
  }
}
```

## 3. Error Handling Architecture

### 3.1 "Cascading Error Recovery" Pattern

**Multi-layer error handling strategy:**

```typescript
class ErrorRecoveryChain {
  async handlePublicationError(
    error: Error, 
    context: PublicationContext
  ): Promise<RecoveryResult> {
    
    // Layer 1: FLOOD_WAIT detection
    if (this.isFloodWaitError(error)) {
      return await this.handleFloodWait(context);
    }
    
    // Layer 2: Token expiration
    if (this.isTokenExpiredError(error)) {
      return await this.handleTokenExpiration(context);
    }
    
    // Layer 3: Network issues
    if (this.isNetworkError(error)) {
      return await this.handleNetworkError(context);
    }
    
    // Layer 4: Unknown errors
    return this.handleUnknownError(error, context);
  }
}
```

### 3.2 "Smart FLOOD_WAIT Decision" Logic

**Intelligent switching vs waiting decision:**

```typescript
interface FloodWaitDecision {
  action: 'SWITCH_USER' | 'WAIT_AND_RETRY' | 'ABORT';
  reasoning: string;
  estimatedDelay?: number;
}

class FloodWaitAnalyzer {
  analyzeFloodWait(
    waitSeconds: number,
    operationType: 'publish' | 'edit',
    remainingFiles: number,
    userSwitchHistory: UserSwitchEvent[]
  ): FloodWaitDecision {
    
    // Rule 1: Never switch for edits
    if (operationType === 'edit') {
      return {
        action: 'WAIT_AND_RETRY',
        reasoning: 'Edit operations must preserve original author'
      };
    }
    
    // Rule 2: Switch if wait time > threshold AND we have remaining work
    const SWITCH_THRESHOLD = 30; // seconds
    if (waitSeconds > SWITCH_THRESHOLD && remainingFiles > 5) {
      return {
        action: 'SWITCH_USER',
        reasoning: `Wait time ${waitSeconds}s exceeds threshold with ${remainingFiles} files remaining`
      };
    }
    
    // Rule 3: Avoid excessive switching
    const recentSwitches = userSwitchHistory.filter(
      event => Date.now() - new Date(event.timestamp).getTime() < 300000 // 5 min
    );
    if (recentSwitches.length >= 2) {
      return {
        action: 'WAIT_AND_RETRY',
        reasoning: 'Too many recent user switches, waiting instead'
      };
    }
    
    return {
      action: 'SWITCH_USER',
      reasoning: 'Optimal conditions for user switching'
    };
  }
}
```

## 4. Integration Architecture

### 4.1 "Minimal Intrusion" Integration Strategy

**Хирургическое вмешательство в existing code:**

```typescript
// EXISTING METHOD ENHANCEMENT
async publishWithMetadata(filePath: string, username: string, options = {}) {
  try {
    // ... existing logic ...
    
    // NEW: Wrap critical section with user switching
    const publicationResult = await this.executeWithUserSwitching(
      () => this.publishNodes(title, telegraphNodes),
      { operationType: 'publish', filePath, remainingFiles: this.getRemainingFileCount() }
    );
    
    // NEW: Save actual token used
    const actualTokenUsed = this.getCurrentEffectiveToken();
    const metadata = MetadataManager.createMetadata(
      page.url, page.path, username, filePath, contentHash, metadataTitle, 
      actualTokenUsed // NEW parameter
    );
    
    // ... rest of existing logic ...
  } catch (error) {
    // Existing error handling preserved
  }
}
```

### 4.2 "Decorator Pattern" для Token Management

**Прозрачная обертка existing methods:**

```typescript
class TokenAwarePublisher {
  constructor(private basePublisher: EnhancedTelegraphPublisher) {}
  
  @WithTokenContext()
  async publishWithMetadata(...args) {
    return this.basePublisher.publishWithMetadata(...args);
  }
  
  @WithTokenContext()
  async editWithMetadata(...args) {
    return this.basePublisher.editWithMetadata(...args);
  }
}

function WithTokenContext() {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    descriptor.value = async function(...args: any[]) {
      const tokenContext = this.tokenManager.enterContext(args);
      try {
        return await method.apply(this, args);
      } finally {
        this.tokenManager.exitContext(tokenContext);
      }
    };
  };
}
```

## 5. User Experience Design

### 5.1 "Progressive Disclosure" Logging

**Умный logging в зависимости от контекста:**

```typescript
class SmartLogger {
  logUserSwitch(event: UserSwitchEvent, context: PublicationContext) {
    // Always log critical events
    console.log(`🔄 Telegraph user switched due to rate limit`);
    console.log(`   Original: ${this.maskToken(event.originalToken)}`);
    console.log(`   New: ${this.maskToken(event.newToken)}`);
    console.log(`   Trigger: ${basename(event.triggerFile)}`);
    
    // Conditional verbose logging
    if (context.debug) {
      console.log(`   Switch #${context.switchCounter} in this session`);
      console.log(`   Remaining files: ${context.remainingFiles}`);
      console.log(`   Switch reason: ${event.reason}`);
    }
    
    // Progress indicator
    if (context.remainingFiles > 10) {
      console.log(`   📊 Bulk operation in progress (${context.remainingFiles} files remaining)`);
    }
  }
}
```

### 5.2 "Recovery Guidance" System

**Intelligent user guidance при проблемах:**

```typescript
interface RecoveryGuidance {
  message: string;
  actionRequired: boolean;
  suggestedAction?: string;
  estimatedImpact?: string;
}

class RecoveryGuidanceEngine {
  generateGuidance(error: Error, context: PublicationContext): RecoveryGuidance {
    if (this.isAccountCreationFailure(error)) {
      return {
        message: '❌ Failed to create new Telegraph account for rate limit recovery',
        actionRequired: true,
        suggestedAction: 'Check network connection and try again in a few minutes',
        estimatedImpact: 'Publication will abort to prevent data loss'
      };
    }
    
    if (this.isTokenPermissionError(error)) {
      return {
        message: '🔒 Access token lacks permission for this operation',
        actionRequired: true,
        suggestedAction: 'Verify token permissions or regenerate access token',
        estimatedImpact: 'This file will be skipped'
      };
    }
    
    return {
      message: '⚠️ Unexpected error during publication',
      actionRequired: false,
      estimatedImpact: 'Will retry with standard error handling'
    };
  }
}
```

## 6. Performance & Optimization Design

### 6.1 "Lazy Token Resolution" Pattern

**Отложенное разрешение токенов для оптимизации:**

```typescript
class LazyTokenResolver {
  private tokenCache = new Map<string, { token: string; timestamp: number }>();
  
  async resolveToken(filePath: string): Promise<string> {
    // Check cache first
    const cached = this.tokenCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < 30000) { // 30s cache
      return cached.token;
    }
    
    // Lazy load from file metadata
    const metadata = await MetadataManager.getPublicationInfo(filePath);
    const resolved = metadata?.accessToken || this.getSessionToken();
    
    // Cache for future use
    this.tokenCache.set(filePath, { token: resolved, timestamp: Date.now() });
    return resolved;
  }
}
```

### 6.2 "Predictive User Switching" Algorithm

**Превентивное переключение based on patterns:**

```typescript
class PredictiveSwitcher {
  shouldPreemptiveSwitch(
    currentLoad: number,
    historicalPatterns: FloodWaitPattern[],
    timeOfDay: number
  ): boolean {
    
    // Pattern 1: High load periods
    if (currentLoad > 50 && this.isHighTrafficHour(timeOfDay)) {
      return true;
    }
    
    // Pattern 2: Historical FLOOD_WAIT frequency
    const recentPatterns = historicalPatterns
      .filter(p => p.hour === timeOfDay)
      .slice(-10); // last 10 occurrences
      
    const avgFloodWaitFreq = recentPatterns.length / 10;
    if (avgFloodWaitFreq > 0.3) { // 30% of operations hit rate limit
      return true;
    }
    
    return false;
  }
}
```

## 7. Testing & Validation Design

### 7.1 "Chaos Engineering" для Rate Limit Testing

**Симуляция различных failure scenarios:**

```typescript
class RateLimitChaos {
  async simulateFloodWait(
    duration: number, 
    pattern: 'random' | 'progressive' | 'burst'
  ): Promise<void> {
    
    switch (pattern) {
      case 'random':
        if (Math.random() < 0.3) throw new Error(`FLOOD_WAIT_${duration}`);
        break;
        
      case 'progressive':
        const progressiveDuration = duration * this.getProgressiveMultiplier();
        throw new Error(`FLOOD_WAIT_${progressiveDuration}`);
        
      case 'burst':
        if (this.isBurstWindow()) throw new Error(`FLOOD_WAIT_${duration * 2}`);
        break;
    }
  }
}
```

### 7.2 "Golden Path Testing" Strategy

**Comprehensive scenario coverage:**

```typescript
interface TestScenario {
  name: string;
  setup: () => Promise<void>;
  execute: () => Promise<any>;
  validate: (result: any) => void;
  cleanup: () => Promise<void>;
}

const goldenPathScenarios: TestScenario[] = [
  {
    name: 'New file publication with user switch',
    setup: async () => { /* Setup fresh Telegraph account */ },
    execute: async () => { /* Trigger FLOOD_WAIT, verify switch */ },
    validate: (result) => { /* Verify new token in metadata */ },
    cleanup: async () => { /* Clean test accounts */ }
  },
  {
    name: 'Edit existing file preserves author',
    setup: async () => { /* Setup file with different token */ },
    execute: async () => { /* Trigger FLOOD_WAIT on edit */ },
    validate: (result) => { /* Verify no user switch occurred */ },
    cleanup: async () => { /* Restore original state */ }
  }
];
```

## Заключение

Архитектурное решение основано на **"Progressive Enhancement"** принципе - минимальные изменения с максимальной функциональностью. Ключевые creative decisions:

### 🎨 Creative Innovations:
1. **Token Context Manager** - элегантное управление token lifecycle
2. **Smart FLOOD_WAIT Decision** - intelligent switching vs waiting logic  
3. **Cascading Error Recovery** - multi-layer resilience strategy
4. **Predictive User Switching** - превентивная optimization
5. **Progressive Disclosure Logging** - adaptive user experience

### 🔧 Technical Elegance:
- Minimal intrusion в existing codebase
- Decorator pattern для прозрачной интеграции
- Lazy resolution для performance optimization
- Chaos engineering для robust testing

### 🛡️ Safety First:
- Fail-safe defaults (abort on unknown errors)
- Clear audit trail для troubleshooting  
- Backward compatibility preservation
- Graceful degradation при критических ошибках

Решение готово для technical implementation в IMPLEMENT фазе. 