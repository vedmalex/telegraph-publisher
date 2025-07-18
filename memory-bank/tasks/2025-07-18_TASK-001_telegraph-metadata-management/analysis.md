# VAN Analysis: Telegraph Metadata Management System

## Value (Ценность)

### Business Value
- **Workflow Simplification**: Automatic metadata management eliminates manual link tracking
- **User Experience**: Single command publishes files with all dependencies resolved
- **Content Integrity**: Source files remain unchanged while published content is optimized
- **Time Savings**: No manual link replacement or metadata management required

### Technical Value
- **Automation**: Reduces human error in link management
- **Consistency**: Standardized metadata format across all publications
- **Dependency Resolution**: Automatic handling of linked local files
- **Backward Compatibility**: Maintains existing CLI functionality

## Analysis (Анализ)

### Current State Assessment

#### Existing Codebase Analysis
1. **Telegraph Publisher** (`src/telegraphPublisher.ts`):
   - ✅ Has `createPage()` and `editPage()` methods
   - ✅ Supports access token management
   - ✅ Returns page URL and path information
   - ❌ No metadata injection capability
   - ❌ No publication status tracking

2. **Markdown Converter** (`src/markdownConverter.ts`):
   - ✅ Converts markdown to Telegraph nodes
   - ✅ Extracts title from content
   - ✅ Validates content
   - ❌ No local link detection
   - ❌ No link replacement capability

3. **CLI Interface** (`src/cli.ts`):
   - ✅ File processing workflow
   - ✅ Access token management
   - ✅ Configuration file support
   - ❌ No metadata management
   - ❌ No dependency resolution

#### Current File Structure Analysis
- **Sample File**: `шлока1.1.1.md` contains structured markdown
- **No Metadata**: Files don't have publication metadata
- **Local Links**: Potential for local file references in content

### Technical Challenges

1. **Metadata Format Design**:
   - Where to store: Beginning of file vs separate metadata file
   - Format: YAML frontmatter vs comment block vs custom format
   - Information: URL, edit key, username, publication date

2. **Publication Status Detection**:
   - How to identify already published files
   - Metadata parsing and validation
   - Handling corrupted or missing metadata

3. **Local Link Resolution**:
   - Markdown link pattern detection
   - Relative path resolution
   - Recursive dependency publishing
   - Circular dependency prevention

4. **Link Replacement Strategy**:
   - Temporary content modification (not source)
   - Telegraph URL format handling
   - Preserving link text and context

## Needs (Потребности)

### Functional Requirements

#### 1. Metadata Management
- **Format**: YAML frontmatter or HTML comment block
- **Information**:
  - Telegraph URL
  - Edit key/path
  - Username
  - Publication timestamp
  - Original filename

#### 2. Publication Status Detection
- Parse existing metadata from file beginning
- Validate metadata integrity
- Determine if file was previously published
- Handle missing or corrupted metadata

#### 3. Smart Publishing Logic
```
IF file has valid metadata:
    Use editPage() with existing path/key
ELSE:
    Use createPage() and inject new metadata
```

#### 4. Local Link Resolution
- **Detection**: Find `[text](./local/file.md)` patterns
- **Resolution**: Resolve relative paths to absolute
- **Recursive Publishing**: Auto-publish referenced files
- **Link Replacement**: Replace with Telegraph URLs in published content only

#### 5. Content Processing Pipeline
```
1. Read source file
2. Parse existing metadata (if any)
3. Extract content without metadata
4. Find local links in content
5. Recursively process referenced files
6. Replace local links with Telegraph URLs
7. Publish/edit page with processed content
8. Inject/update metadata in source file
```

### Technical Requirements

#### 1. New Components Needed
- **MetadataManager**: Handle metadata parsing, validation, injection
- **LinkResolver**: Find and resolve local file references
- **DependencyManager**: Handle recursive file publishing
- **ContentProcessor**: Temporary content modification for publishing

#### 2. Enhanced Existing Components
- **TelegraphPublisher**: Add metadata-aware publishing methods
- **CLI**: Add metadata management options and workflows
- **MarkdownConverter**: Add link detection and replacement

#### 3. Data Structures
```typescript
interface FileMetadata {
  telegraphUrl: string;
  editPath: string;
  username: string;
  publishedAt: string;
  originalFilename: string;
}

interface LocalLink {
  text: string;
  originalPath: string;
  resolvedPath: string;
  isPublished: boolean;
  telegraphUrl?: string;
}
```

### Integration Requirements

#### 1. Backward Compatibility
- Existing CLI commands must continue working
- Non-metadata files should be handled gracefully
- Configuration file format remains unchanged

#### 2. Error Handling
- Network failures during publishing
- File system permission issues
- Circular dependency detection
- Invalid metadata handling

#### 3. Performance Considerations
- Caching publication status
- Batch processing for multiple dependencies
- Minimal file system operations

### Testing Requirements

#### 1. Unit Tests (85% coverage minimum)
- Metadata parsing and injection
- Link detection and resolution
- Publication status determination
- Content processing pipeline

#### 2. Integration Tests
- End-to-end publishing workflow
- Dependency resolution chains
- Error scenarios and recovery

#### 3. Test Data
- Sample markdown files with various link patterns
- Mock Telegraph API responses
- Metadata format variations

## Implementation Priority

### Phase 1: Core Metadata Management
1. Design metadata format
2. Implement MetadataManager
3. Add metadata injection to publishing workflow

### Phase 2: Publication Status Detection
1. Enhance TelegraphPublisher with status detection
2. Implement smart publish/edit logic
3. Add metadata validation

### Phase 3: Link Resolution
1. Implement LinkResolver for local link detection
2. Add recursive publishing capability
3. Implement link replacement for published content

### Phase 4: Integration and Testing
1. Enhance CLI with new functionality
2. Comprehensive testing suite
3. Documentation and examples

## Risk Assessment

### High Risk
- **Circular Dependencies**: Files referencing each other
- **Large Dependency Trees**: Performance impact
- **Metadata Corruption**: Data loss scenarios

### Medium Risk
- **Network Failures**: During recursive publishing
- **File System Issues**: Permission or access problems
- **API Rate Limits**: Telegraph API constraints

### Low Risk
- **Backward Compatibility**: Well-defined interfaces
- **Configuration Changes**: Minimal impact on existing setup