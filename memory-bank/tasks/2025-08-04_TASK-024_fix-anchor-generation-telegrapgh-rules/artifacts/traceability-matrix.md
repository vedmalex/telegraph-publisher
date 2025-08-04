# Traceability Matrix - Fix Anchor Generation According to Telegra.ph Rules

## Specification to Implementation Mapping

| Spec ID | Requirement | Implementation Target | Implementation Method | Test Coverage | Status |
|---------|-------------|----------------------|---------------------|---------------|---------|
| REQ-001 | Fix generateSlug to preserve Markdown symbols | src/links/LinkVerifier.ts#generateSlug | Replace algorithm: remove only `<>`, replace spaces with `-` | LinkVerifier.test.ts#generateSlug tests | ✅ Complete |
| REQ-002 | Remove markdown cleaning from getAnchorsForFile | src/links/LinkVerifier.ts#getAnchorsForFile | Remove cleanMarkdownString() call | LinkVerifier.test.ts#getAnchorsForFile tests | ✅ Complete |
| REQ-003 | Update anchor generation in TOC | src/markdownConverter.ts#generateTocAside | Use same algorithm as LinkVerifier | markdownConverter.test.ts#generateTocAside tests | ✅ Complete |
| REQ-004 | Preserve character case in anchors | Both generateSlug implementations | Remove toLowerCase() calls | Case preservation tests | ✅ Complete |
| REQ-005 | Replace only spaces with hyphens | Both generateSlug implementations | Use `.replace(/ /g, '-')` only | Space replacement tests | ✅ Complete |
| REQ-006 | Remove only < and > characters | Both generateSlug implementations | Use `.replace(/[<>]/g, '')` | Symbol removal tests | ✅ Complete |
| REQ-007 | Add TOC text formatting | src/markdownConverter.ts#generateTocAside | Use processInlineMarkdown for link text | TOC formatting tests | ✅ Complete |
| REQ-008 | Update test expectations | All test files | Update expected anchor values to match new algorithm | All existing anchor tests | ✅ Complete |

## Research Validation Mapping

| Research Case | Expected Anchor | Implementation Validation | Test File | Status |
|---------------|-----------------|---------------------------|-----------|---------|
| `Simple Title` | `Simple-Title` | generateSlug('Simple Title') === 'Simple-Title' | research_anchors.test.ts | ✅ Complete |
| `**Bold Title**` | `**Bold-Title**` | generateSlug('**Bold Title**') === '**Bold-Title**' | research_anchors.test.ts | ✅ Complete |
| `Title with comma,` | `Title-with-comma,` | generateSlug('Title with comma,') === 'Title-with-comma,' | research_anchors.test.ts | ✅ Complete |
| `1. Numbered Heading` | `1.-Numbered-Heading` | generateSlug('1. Numbered Heading') === '1.-Numbered-Heading' | research_anchors.test.ts | ✅ Complete |
| `Заголовок с пробелами` | `Заголовок-с-пробелами` | generateSlug('Заголовок с пробелами') === 'Заголовок-с-пробелами' | research_anchors.test.ts | ✅ Complete |

## Implementation Phase Cross-References

| Phase | Deliverable | Links to Requirements | Implementation Files | Status |
|-------|-------------|----------------------|---------------------|---------|
| IMPLEMENT-1 | Updated LinkVerifier.generateSlug | REQ-001, REQ-004, REQ-005, REQ-006 | src/links/LinkVerifier.ts | ✅ Complete |
| IMPLEMENT-2 | Updated LinkVerifier.getAnchorsForFile | REQ-002 | src/links/LinkVerifier.ts | ✅ Complete |
| IMPLEMENT-3 | Updated markdownConverter.generateTocAside | REQ-003, REQ-004, REQ-005, REQ-006, REQ-007 | src/markdownConverter.ts | ✅ Complete |
| IMPLEMENT-4 | Updated test suites | REQ-008 | LinkVerifier.test.ts, markdownConverter.test.ts | ✅ Complete |
| IMPLEMENT-5 | Research validation | All research cases | scripts/research_anchors.test.ts | ✅ Complete |

## Acceptance Criteria Validation

| Criteria | Validation Method | Expected Result | Test Location | Status |
|----------|-------------------|-----------------|---------------|---------|
| Heading `## **Bold Title**` generates anchor `**Bold-Title**` | Unit test with mock heading | generateSlug('**Bold Title**') returns '**Bold-Title**' | LinkVerifier.test.ts | ✅ Complete |
| Link validation passes for `[link](./target.md#**Bold-Title**)` | Integration test with test files | isValidAnchor returns true | LinkVerifier.test.ts | ✅ Complete |
| TOC generates correct anchor link | TOC generation test | href="#**Bold-Title**" in generated TOC | markdownConverter.test.ts | ✅ Complete |
| Research error log links validate correctly | Batch validation test | All research cases pass | research_anchors.test.ts | ✅ Complete |

## Change Impact Assessment

| Component | Impact Level | Change Type | Risk Level | Mitigation |
|-----------|--------------|-------------|------------|------------|
| LinkVerifier.generateSlug | High | Algorithm Replacement | Medium | Comprehensive test coverage |
| LinkVerifier.getAnchorsForFile | Medium | Remove function call | Low | Existing tests validate behavior |
| markdownConverter.generateTocAside | High | Algorithm Update + Formatting | Medium | Step-by-step validation |
| Test Suites | High | Expected values update | Low | Systematic test case review |
| Documentation | Low | Algorithm description update | Low | Review against implementation |