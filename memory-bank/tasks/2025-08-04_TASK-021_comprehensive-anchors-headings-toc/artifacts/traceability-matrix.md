# Traceability Matrix - TASK-021

## Specification to Implementation Mapping

| Spec ID | Requirement | VAN Reference | Plan Item | Creative Decision | Implementation | Test Coverage | Status |
|---------|-------------|---------------|-----------|-------------------|----------------|---------------|---------|
| **FEAT-ANCHOR-REFACTOR-001** |
| AR-001 | Replace only spaces with hyphens in slug generation | analysis.md#current-slug-analysis | plan.md#2.1.1 | creative.md#pure-function-pattern | src/links/LinkVerifier.ts#generateSlug | LinkVerifier.test.ts#slug-generation | 🟡 CREATIVE Complete |
| AR-002 | Preserve original case in anchor generation | analysis.md#case-preservation | plan.md#2.1.1 | creative.md#pure-function-pattern | src/links/LinkVerifier.ts#generateSlug | LinkVerifier.test.ts#case-preservation | 🟡 CREATIVE Complete |
| AR-003 | Keep special characters (№, etc.) in anchors | analysis.md#special-chars | plan.md#2.1.1 | creative.md#pure-function-pattern | src/links/LinkVerifier.ts#generateSlug | LinkVerifier.test.ts#special-chars | 🟡 CREATIVE Complete |
| AR-004 | "Мой якорь" → "Мой-якорь" conversion | analysis.md#cyrillic-test | plan.md#2.2.1 | creative.md#pure-function-pattern | src/links/LinkVerifier.ts#generateSlug | LinkVerifier.test.ts#cyrillic-anchors | 🟡 CREATIVE Complete |
| AR-005 | "Section Title" → "Section-Title" conversion | analysis.md#latin-test | plan.md#2.2.1 | creative.md#pure-function-pattern | src/links/LinkVerifier.ts#generateSlug | LinkVerifier.test.ts#latin-anchors | 🟡 CREATIVE Complete |
| **FEAT-HEADING-STRATEGY-001** |
| HS-001 | Convert H5 to h4 tag with "»" prefix | analysis.md#h5-analysis | plan.md#3.1.1 | creative.md#strategy-pattern | src/markdownConverter.ts#heading-logic | markdownConverter.test.ts#h5-conversion | 🟡 CREATIVE Complete |
| HS-002 | Convert H6 to h4 tag with "»»" prefix | analysis.md#h6-analysis | plan.md#3.1.1 | creative.md#strategy-pattern | src/markdownConverter.ts#heading-logic | markdownConverter.test.ts#h6-conversion | 🟡 CREATIVE Complete |
| HS-003 | Preserve H1-H3 → h3 mapping | analysis.md#h1-h3-compat | plan.md#3.2.1 | creative.md#backwards-compatibility | src/markdownConverter.ts#heading-logic | markdownConverter.test.ts#h1-h3-compat | 🟡 CREATIVE Complete |
| HS-004 | Preserve H4 → h4 mapping | analysis.md#h4-compat | plan.md#3.2.1 | creative.md#backwards-compatibility | src/markdownConverter.ts#heading-logic | markdownConverter.test.ts#h4-compat | 🟡 CREATIVE Complete |
| HS-005 | All headings generate anchors on Telegraph side | analysis.md#anchor-capability | plan.md#3.3.1 | creative.md#strategy-pattern | src/markdownConverter.ts#heading-logic | markdownConverter.test.ts#anchor-generation | 🟡 CREATIVE Complete |
| **FEAT-ASIDE-TOC-GENERATION-001** |
| TOC-001 | Generate aside block when 2+ headings exist | analysis.md#toc-trigger | plan.md#4.1.1 | creative.md#functional-pipeline | src/markdownConverter.ts#generateTocAside | markdownConverter.test.ts#toc-generation | 🟡 CREATIVE Complete |
| TOC-002 | Do not generate aside when <2 headings | analysis.md#toc-skip | plan.md#4.1.1 | creative.md#functional-pipeline | src/markdownConverter.ts#generateTocAside | markdownConverter.test.ts#toc-skip | 🟡 CREATIVE Complete |
| TOC-003 | Use correct anchor algorithm from AR-001 | analysis.md#toc-anchors | plan.md#4.1.1 | creative.md#shared-utility-pattern | src/markdownConverter.ts#generateTocAside | markdownConverter.test.ts#toc-anchors | 🟡 CREATIVE Complete |
| TOC-004 | Include H5/H6 prefixes in ToC links | analysis.md#toc-prefixes | plan.md#4.1.1 | creative.md#functional-pipeline | src/markdownConverter.ts#generateTocAside | markdownConverter.test.ts#toc-prefixes | 🟡 CREATIVE Complete |
| TOC-005 | Generate ul > li > a structure in aside | analysis.md#toc-structure | plan.md#4.1.1 | creative.md#functional-pipeline | src/markdownConverter.ts#generateTocAside | markdownConverter.test.ts#toc-structure | 🟡 CREATIVE Complete |
| TOC-006 | Insert ToC at beginning of page nodes | analysis.md#toc-placement | plan.md#4.2.1 | creative.md#graceful-degradation | src/markdownConverter.ts#convertMarkdownToTelegraphNodes | markdownConverter.test.ts#toc-placement | 🟡 CREATIVE Complete |

## Phase Decision Cross-References

### VAN Analysis → Implementation Mapping
- [Current generateSlug Analysis] → [AR-001: Correct slug implementation]
- [H5/H6 Conversion Analysis] → [HS-001, HS-002: New heading strategy]
- [Telegraph API Constraints] → [TOC-005: Aside structure requirements]
- [Performance Impact Assessment] → [TOC-001: Efficient ToC generation]

### User Requirements → Phase Integration
- [User Spec: "только замена пробелов на дефисы"] → [VAN Analysis] → [AR-001 Implementation]
- [User Spec: "H5/H6 теги с префиксами"] → [VAN Analysis] → [HS-001, HS-002 Implementation]
- [User Spec: "автоматическое оглавление aside"] → [VAN Analysis] → [TOC-001-006 Implementation]

## Implementation Dependencies

### Sequential Requirements:
```
FEAT-ANCHOR-REFACTOR-001 (AR-001-005)
    ↓ provides correct anchor generation
FEAT-HEADING-STRATEGY-001 (HS-001-005)  
    ↓ provides linkable headings with prefixes
FEAT-ASIDE-TOC-GENERATION-001 (TOC-001-006)
    ↓ uses both anchor generation and heading strategy
```

### Cross-Specification Dependencies:
- **TOC-003** depends on **AR-001**: ToC must use same anchor algorithm
- **TOC-004** depends on **HS-001, HS-002**: ToC must include heading prefixes
- **HS-005** depends on **AR-001**: All headings must generate valid anchors

## Testing Strategy Mapping

### Unit Test Categories:
- **Anchor Generation Tests**: AR-001 through AR-005
- **Heading Conversion Tests**: HS-001 through HS-005  
- **ToC Generation Tests**: TOC-001 through TOC-006

### Integration Test Categories:
- **End-to-End Workflow**: Full markdown → Telegraph nodes with ToC
- **Cross-Specification**: Verify ToC links work with new anchor algorithm
- **Backwards Compatibility**: Existing markdown files still work correctly

### Edge Case Coverage:
- Empty headings, special characters, single heading, multiple identical headings
- Complex markdown with mixed heading levels
- Performance with large documents (many headings)

## Quality Metrics Tracking

### Coverage Requirements:
- **Code Coverage**: 85% minimum for all modified files
- **Specification Coverage**: 100% of requirements tested
- **Edge Case Coverage**: All identified edge cases tested

### Success Criteria Per Specification:
- **FEAT-ANCHOR-REFACTOR-001**: All AR- requirements pass
- **FEAT-HEADING-STRATEGY-001**: All HS- requirements pass  
- **FEAT-ASIDE-TOC-GENERATION-001**: All TOC- requirements pass

## Status Legend:
- 🔴 Not Started
- 🟡 In Progress  
- 🟢 Completed
- 🔵 Blocked
- ✅ Tested & Validated