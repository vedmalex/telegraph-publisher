# Technical Specification: Lightweight cache-based link refresh for --no-with-dependencies

## 1) Objective
Enable link updates in --no-with-dependencies without traversing or publishing dependencies by refreshing link mappings solely from PagesCacheManager for already-published dependencies.

## 2) Scope and Constraints
- In scope:
  - publishWithMetadata and editWithMetadata behavior when withDependencies=false
  - Refresh link mappings from cache for current file’s local links
  - Replace links using refreshed mappings
  - Update metadata.publishedDependencies accordingly
  - Change detection in editWithMetadata considers refreshed mappings
- Out of scope:
  - Publishing dependencies
  - Building dependency tree
  - External API calls besides standard page edit/publish for the current file
- Constraints:
  - Preserve unified pipeline rule: link replacement controlled by config.replaceLinksinContent
  - Validation must allow unresolved links when !withDependencies
  - No recursion; do not call publishDependencies in this mode

## 3) Current Behavior Summary (verified)
- publishWithMetadata:
  - If withDependencies=false: publishedDependencies is preserved from metadata; no dependency processing; replacement runs based on config, using empty linkMappings and fallback to cache inside replaceLinksWithTelegraphUrls.
- editWithMetadata:
  - If withDependencies=false: currentLinkMappings initialized from existing metadata; change detection compares against itself (no change), then timestamp/hash checks; replacement uses currentLinkMappings.

Limitation: No new mapping refresh occurs; new links won’t be updated unless the dependency URL is already in cache; metadata does not reflect refreshed mappings.

## 4) Target Behavior
When withDependencies=false:
- Build refreshed mappings for current file’s local links using cache only.
- Replace links using refreshed mappings.
- Update metadata.publishedDependencies to the refreshed mappings.
- In editWithMetadata, compare refreshed mappings vs stored publishedDependencies; if changed, proceed with edit (skip timestamp/hash gating). If equal, apply timestamp/hash checks.

## 5) Detailed Implementation Plan
### 5.1 New helper
- Signature:
  - buildLinkMappingsFromCache(processed: ProcessedContent, cacheManager?: PagesCacheManager): Record<string, string>
- Logic:
  - If no cacheManager, return {}
  - For each processed.localLinks:
    - const url = cacheManager.getTelegraphUrl(link.resolvedPath)
    - If url, map[link.originalPath] = url
  - Return map

### 5.2 publishWithMetadata changes
- After processed = ContentProcessor.processFile(filePath):
  - If withDependencies=false:
    - const cacheMappings = buildLinkMappingsFromCache(processed, this.cacheManager)
    - publishedDependencies = { ...originalDependencies, ...cacheMappings }
- Replacement (unified pipeline preserved):
  - if this.config.replaceLinksinContent && processed.localLinks.length > 0:
    - if withDependencies=false:
      - processedWithLinks = await replaceLinksWithTelegraphUrls(processed, publishedDependencies, this.cacheManager)
    - else: existing call path unchanged
- Validation: keep allowUnpublishedDependencies: isDepthOne || !withDependencies
- Metadata: ensure MetadataManager.createMetadata receives publishedDependencies variable

### 5.3 editWithMetadata changes
- Initialize currentLinkMappings to existingMetadata.publishedDependencies || {}
- If withDependencies=false:
  - After processed = ContentProcessor.processFile(filePath):
    - const cacheMappings = buildLinkMappingsFromCache(processed, this.cacheManager)
    - currentLinkMappings = { ...(existingMetadata.publishedDependencies || {}), ...cacheMappings }
- Change detection:
  - const dependenciesChanged = !this._areDependencyMapsEqual(currentLinkMappings, existingMetadata.publishedDependencies)
  - If dependenciesChanged: log and proceed to publication path (skip timestamp/hash early exits)
  - Else: perform existing timestamp/hash checks
- Replacement:
  - if this.config.replaceLinksinContent && processed.localLinks.length > 0:
    - processedWithLinks = await replaceLinksWithTelegraphUrls(processed, currentLinkMappings, this.cacheManager)
- Metadata update:
  - updatedMetadata.publishedDependencies = currentLinkMappings

### 5.4 Validation rules
- Already implemented:
  - allowUnpublishedDependencies: isDepthOne || !withDependencies

### 5.5 Performance considerations
- O(N) map build per file; in-memory cache lookups
- No recursion or additional API calls; minimal overhead

## 6) Acceptance Criteria
- AC1: With withDependencies=false, for dependencies present in cache, links are replaced with Telegraph URLs, and metadata.publishedDependencies includes those mappings.
- AC2: With withDependencies=false, dependencies not present in cache remain as local links; validation still passes; no dependency publication occurs.
- AC3: editWithMetadata with withDependencies=false triggers publication when refreshed cache-based mappings differ from stored publishedDependencies.
- AC4: Link replacement occurs only if replaceLinksinContent is true and there are local links.
- AC5: publishDependencies is never called when withDependencies=false.
- AC6: Behavior with withDependencies=true unchanged; unified-pipeline tests remain passing.

## 7) Test Plan (Vitest)
### 7.1 Unit tests for helper
- buildLinkMappingsFromCache returns {} when cacheManager undefined
- Maps originalPath -> URL for links with cache entries
- Ignores links without cache entries

### 7.2 Integration: publishWithMetadata in no-deps mode
- Two local links; cache has URL for one dependency; withDependencies=false; replaceLinksinContent=true
  - Expect: publishDependencies not called; replacement called; content has URL for the cached link; metadata.publishedDependencies includes only that mapping

### 7.3 Integration: editWithMetadata change detection
- Existing publishedDependencies = {}; cache now has URL for ./dep.md; withDependencies=false
  - Expect: dependenciesChanged=true path triggers update; metadata updated with mapping; link replaced
- Negative case: refreshed mappings equal to existing
  - Expect: timestamp/hash checks apply; may skip editing if unchanged

### 7.4 Regression
- Ensure EnhancedTelegraphPublisher.unified-pipeline.test.ts remains green
- Validation tolerates unresolved links when !withDependencies
- Performance: skip link replacement when no local links

## 8) Risks and Mitigations
- Partial mapping may confuse users
  - Mitigation: ProgressIndicator messages like “Using cache-based mappings for X links; Y links unresolved.”
- Overwriting publishedDependencies with partial map
  - Mitigation: Merge strategy in publishWithMetadata; in editWithMetadata, updatedMetadata reflects current known published state - as spec
- Unexpected change detection edits triggered by cache changes
  - Mitigation: Intended behavior; reflects current published URLs

## 9) Traceability Matrix
- Requirement “link updates in --no-with-dependencies” → Design buildLinkMappingsFromCache → Code in publishWithMetadata/editWithMetadata branches → Tests 7.2/7.3
- Constraint “no dependency publication” → Guard on withDependencies=false, no publishDependencies call
- Unified pipeline rule → Replacement condition remains config.replaceLinksinContent && processed.localLinks.length > 0

## 10) Developer Implementation Notes
- Use link.originalPath as mapping key to satisfy ContentProcessor.replaceLinksInContent
- Logs:
  - “Cache refresh: X/Y links resolved from cache for filename.md”
  - “No cache manager available; skipping cache-based mapping refresh”
- Do not modify dependency traversal code for withDependencies=true

## 11) Quality Targets
- 100% coverage for new helper and modified branches; ≥85% overall coverage
- 100% test pass rate
- No regressions in unified pipeline logic