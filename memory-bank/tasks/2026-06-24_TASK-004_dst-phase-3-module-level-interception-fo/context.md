# Context — TASK-004

## Preamble

Updated: 2026-06-26

## Scope

Phase 3: Module-level interception for links, cache, publisher.

Create vi.mock-based interception layer for `node:fs`, `node:crypto`, `fetch`, `child_process`, `Date` so that existing modules (LinkVerifier, PagesCacheManager, EnhancedTelegraphPublisher, EpubGenerator, etc.) can be tested with MockDstIO without full DI refactoring.

## Assumptions

- Existing code continues to use direct `import { ... } from 'node:fs'` — no refactoring
- Interception works at Vitest module mock level (`vi.mock('node:fs', ...)`)
- Dynamic `await import('fs')` calls bypass vi.mock — handled separately

## Constraints

- Backward compatible — zero changes to production code
- Only test infrastructure changes