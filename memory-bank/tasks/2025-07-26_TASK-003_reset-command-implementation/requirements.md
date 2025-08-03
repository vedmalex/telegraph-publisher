# Requirements Document - Reset Command Implementation

## 📋 Overview

This document defines the functional and technical requirements for implementing a `reset` command in the Telegraph Publisher CLI tool. The command should remove all publication metadata from markdown files while preserving the title field.

## 🎯 Functional Requirements

### FR-1: Command Interface
**Requirement**: The CLI must provide a `reset` command that follows existing command patterns
**Priority**: High
**Acceptance Criteria**:
- Command is accessible via `telegraph-publisher reset`
- Command appears in help output (`--help`)
- Command follows same option patterns as existing `publish` command
- Command provides clear description in help text

### FR-2: File Processing Modes
**Requirement**: The command must support both single file and directory processing modes
**Priority**: High
**Acceptance Criteria**:
- **Single File Mode**: `reset -f <file.md>` processes specified file
- **Directory Mode**: `reset` (no -f option) processes all .md files in current directory
- Command validates file existence before processing
- Command handles non-markdown files gracefully

### FR-3: Metadata Reset Logic
**Requirement**: The command must remove publication metadata while preserving title
**Priority**: High
**Acceptance Criteria**:
- Removes all Telegraph publication metadata fields (telegraphUrl, editPath, username, publishedAt, originalFilename, description)
- Preserves existing `title` field if present in front-matter
- Maintains all markdown content below front-matter unchanged
- Creates clean front-matter containing only title (if title exists)
- Removes front-matter entirely if no title exists

### FR-4: User Feedback
**Requirement**: The command must provide clear progress indication and results
**Priority**: Medium
**Acceptance Criteria**:
- Shows progress for multi-file operations
- Reports number of files processed
- Reports success/error count
- Provides clear error messages for failures
- Supports verbose mode for detailed output

### FR-5: Error Handling
**Requirement**: The command must handle various error scenarios gracefully
**Priority**: High
**Acceptance Criteria**:
- File not found: Clear error message, continue with remaining files
- Permission denied: Informative error with suggested resolution
- Invalid front-matter: Warning message, attempt processing
- No front-matter: Skip file with informational message
- Disk space issues: Graceful failure with clear error

### FR-6: Safety Features
**Requirement**: The command must implement safety measures to prevent data loss
**Priority**: High
**Acceptance Criteria**:
- Validates file content before modification
- Only modifies files with valid front-matter structure
- Preserves file encoding and line endings
- Does not modify files without publication metadata (unless --force option)

## 🔧 Technical Requirements

### TR-1: Code Organization
**Requirement**: Implementation must follow existing codebase patterns
**Priority**: High
**Acceptance Criteria**:
- New command added to `src/cli.ts` following existing pattern
- Command handler implemented in `src/cli/EnhancedCommands.ts`
- Metadata processing method added to `src/metadata/MetadataManager.ts`
- Uses existing `ProgressIndicator` for user feedback

### TR-2: Dependencies
**Requirement**: Implementation must use existing project dependencies
**Priority**: High
**Acceptance Criteria**:
- Uses Commander.js for CLI option parsing
- Uses Node.js fs module for file operations
- Uses existing MetadataManager for front-matter parsing
- No new external dependencies required

### TR-3: Performance
**Requirement**: Implementation must handle large directories efficiently
**Priority**: Medium
**Acceptance Criteria**:
- Processes 100+ files without memory issues
- Provides progress feedback for operations >5 files
- Completes operation on 50 files within 10 seconds
- Handles concurrent file operations safely

### TR-4: Compatibility
**Requirement**: Implementation must maintain compatibility with existing features
**Priority**: High
**Acceptance Criteria**:
- Does not break existing CLI commands
- Maintains compatibility with existing front-matter formats
- Works with files processed by existing publish commands
- Supports same file encoding as existing commands

## 🧪 Testing Requirements

### TT-1: Unit Testing
**Requirement**: All new code must have comprehensive unit tests
**Priority**: High
**Acceptance Criteria**:
- 85% minimum code coverage for new code
- 100% test success rate
- Tests for MetadataManager.resetMetadata method
- Tests for command option parsing
- Tests for error handling scenarios

### TT-2: Integration Testing
**Requirement**: Command integration must be thoroughly tested
**Priority**: High
**Acceptance Criteria**:
- CLI command integration tests
- End-to-end file processing tests
- Multi-file operation tests
- Error scenario integration tests

### TT-3: Edge Case Testing
**Requirement**: All edge cases must be tested
**Priority**: Medium
**Acceptance Criteria**:
- Files with no front-matter
- Files with corrupted front-matter
- Files with only title in front-matter
- Files with complex nested metadata
- Large files (>1MB)
- Unicode/special character handling

## 🎨 User Experience Requirements

### UX-1: Command Options
**Requirement**: Command must support standard CLI options
**Priority**: High
**Acceptance Criteria**:
- `-f, --file <path>`: Specify target file
- `--dry-run`: Preview changes without modification
- `-v, --verbose`: Detailed output mode
- `--help`: Show command help

### UX-2: Output Formatting
**Requirement**: Command output must be clear and consistent
**Priority**: Medium
**Acceptance Criteria**:
- Consistent with existing command output style
- Uses emojis and colors for visual feedback
- Progress indicators for long operations
- Summary statistics for batch operations

### UX-3: Help Documentation
**Requirement**: Command must have comprehensive help documentation
**Priority**: Medium
**Acceptance Criteria**:
- Clear command description
- Usage examples for common scenarios
- Option descriptions
- Example workflows

## 📊 Success Criteria

### Primary Success Criteria
1. **Functional Completeness**: All functional requirements implemented and tested
2. **Quality Standards**: 85% test coverage, 100% test success rate
3. **User Experience**: Intuitive command interface following existing patterns
4. **Safety**: No data loss, proper error handling
5. **Performance**: Efficient processing of large directories

### Validation Methods
1. **Automated Testing**: Unit and integration test suites
2. **Manual Testing**: Real-world usage scenarios
3. **Code Review**: Peer review of implementation
4. **Performance Testing**: Large directory processing
5. **User Acceptance**: Command usability validation

## 🔄 Use Cases

### UC-1: Reset Single File
**Actor**: Developer
**Goal**: Remove publication metadata from a specific file
**Scenario**:
1. Developer has published file with metadata
2. Developer wants to reset publication state
3. Developer runs `reset -f article.md`
4. System removes publication metadata, preserves title
5. Developer receives success confirmation

### UC-2: Reset Directory
**Actor**: Developer
**Goal**: Reset all files in current directory
**Scenario**:
1. Developer has directory with multiple published files
2. Developer wants to reset all publication states
3. Developer runs `reset` in directory
4. System processes all .md files
5. Developer receives summary of operations

### UC-3: Preview Reset Operation
**Actor**: Developer
**Goal**: See what changes would be made without executing
**Scenario**:
1. Developer wants to preview reset operation
2. Developer runs `reset --dry-run`
3. System shows what would be changed
4. Developer decides whether to proceed
5. No files are actually modified

### UC-4: Handle Errors Gracefully
**Actor**: Developer
**Goal**: Process files with some errors without stopping
**Scenario**:
1. Developer has mixed directory with some problematic files
2. Developer runs `reset`
3. System processes valid files, reports errors for invalid ones
4. Developer receives detailed error report
5. Valid files are successfully reset

## 🔗 Dependencies and Integration

### Internal Dependencies
- `src/metadata/MetadataManager.ts`: Front-matter parsing and manipulation
- `src/cli/EnhancedCommands.ts`: Command handler implementation
- `src/cli/ProgressIndicator.ts`: User feedback and progress indication
- `src/config/ConfigManager.ts`: Configuration management (if needed)

### External Dependencies
- `commander`: CLI option parsing and command structure
- `node:fs`: File system operations
- `node:path`: Path manipulation utilities

### Integration Points
- CLI command registration in main program
- Metadata processing pipeline
- Error handling and reporting system
- Progress indication system

## 📝 Implementation Notes

### Metadata Processing Strategy
```typescript
// Preserve only title from existing metadata
const existingMetadata = MetadataManager.parseMetadata(content);
const titleOnly = existingMetadata?.title ? { title: existingMetadata.title } : null;

// Remove all metadata and add back title if it exists
const contentWithoutMetadata = MetadataManager.removeMetadata(content);
if (titleOnly) {
  return MetadataManager.injectMetadata(contentWithoutMetadata, titleOnly);
} else {
  return contentWithoutMetadata;
}
```

### File Processing Strategy
```typescript
// Follow existing publish command pattern
if (!options.file) {
  // Directory mode - process all .md files
  await handleDirectoryReset(options);
} else {
  // Single file mode
  await handleSingleFileReset(options.file, options);
}
```

### Error Handling Strategy
- Continue processing remaining files when individual files fail
- Accumulate errors and report summary at end
- Use consistent error message formatting
- Provide actionable error messages with suggestions