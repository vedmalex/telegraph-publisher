# VAN Analysis - Reset Command Implementation

## 🎯 Value Analysis

### Business Value
- **User Need**: Users need an easy way to clear publication metadata from files while preserving their original content and title
- **Workflow Improvement**: Allows users to reset file publication state for re-publishing or cleaning up
- **Data Management**: Provides a clean way to manage metadata lifecycle without manual front-matter editing
- **Consistency**: Follows existing CLI command patterns (publish/pub works on files or directories)

### Technical Value
- **Leverages Existing Infrastructure**: Reuses MetadataManager.removeMetadata() and file handling patterns
- **Consistency with Publish Command**: Implements same argument patterns (-f for file, directory mode)
- **Minimal Code Duplication**: Uses established command registration and option handling patterns
- **Error Handling**: Inherits robust error handling from existing command infrastructure

### User Experience Value
- **Intuitive Interface**: Follows same patterns as existing publish command
- **Flexible Usage**: Works with single files or entire directories
- **Safe Operation**: Only removes publication metadata, preserves title and content
- **Clear Feedback**: Provides user feedback on which files were processed

## 🏗️ Architecture Analysis

### Current Architecture Components
1. **CLI Entry Point**: `src/cli.ts` - Main CLI program with command registration
2. **Enhanced Commands**: `src/cli/EnhancedCommands.ts` - Command implementation handlers
3. **Metadata Manager**: `src/metadata/MetadataManager.ts` - Front-matter operations
4. **Progress Indicator**: `src/cli/ProgressIndicator.ts` - User feedback system
5. **Config Manager**: `src/config/ConfigManager.ts` - Configuration handling

### Integration Points
- **Command Registration**: Add new command alongside existing publish/analyze commands
- **File Processing**: Reuse file discovery and iteration patterns from publish command
- **Metadata Operations**: Use existing `MetadataManager.removeMetadata()` and custom reset logic
- **User Feedback**: Use `ProgressIndicator` for status updates and progress tracking

### Architectural Decisions
1. **Command Structure**: Add `reset` command with alias support like existing commands
2. **File Handling**: Follow same pattern as publish - optional -f parameter, directory mode default
3. **Metadata Strategy**: Custom reset method that preserves only title field
4. **Error Handling**: Consistent error reporting with existing command patterns

## 🧭 Navigation Analysis

### Existing Patterns to Follow
1. **Command Registration Pattern**:
   ```typescript
   program
     .command("reset")
     .description("Reset publication metadata, keeping only title")
     .option("-f, --file <path>", "Path to specific file (optional)")
     // ... other options
   ```

2. **File Processing Pattern**:
   ```typescript
   // From publish command:
   if (!options.file) {
     await handleDirectoryReset(options);
     return;
   }
   const filePath = resolve(options.file);
   ```

3. **Metadata Processing Pattern**:
   ```typescript
   // Custom reset preserving title:
   const metadata = MetadataManager.parseMetadata(content);
   const titleOnly = metadata?.title ? { title: metadata.title } : {};
   const resetContent = MetadataManager.removeMetadata(content);
   ```

### File Structure Analysis
```
src/
├── cli.ts                     # Add reset command registration
├── cli/
│   ├── EnhancedCommands.ts   # Add resetCommand method and handlers
│   └── ProgressIndicator.ts  # Reuse for user feedback
├── metadata/
│   └── MetadataManager.ts    # Add resetMetadata method
└── [tests files]             # Add comprehensive tests
```

### Implementation Flow
1. **Command Registration**: Add reset command to main CLI
2. **Handler Implementation**: Create reset command handler in EnhancedCommands
3. **Metadata Method**: Add resetMetadata method to MetadataManager
4. **File Processing**: Implement single file and directory processing
5. **Testing**: Add comprehensive tests for all functionality

## 🔍 Implementation Requirements Analysis

### Core Functionality
1. **Metadata Reset**: Remove all publication metadata except title
2. **File Mode**: Process single file when -f option provided
3. **Directory Mode**: Process all .md files in current directory when no -f option
4. **Error Handling**: Graceful handling of file access errors and invalid metadata
5. **User Feedback**: Clear progress indication and success/error reporting

### Technical Requirements
1. **Title Preservation**: Parse existing title from front-matter and preserve it
2. **Content Integrity**: Ensure markdown content remains unchanged
3. **File Safety**: Backup/validation to prevent data loss
4. **Consistency**: Follow same patterns as publish command for options and behavior

### Quality Requirements
1. **Test Coverage**: 85% minimum code coverage
2. **Test Success**: 100% test pass rate
3. **Error Scenarios**: Test file not found, invalid metadata, permission errors
4. **Integration**: Test with various front-matter configurations

## 🎨 Design Considerations

### User Interface Design
- **Command Name**: `reset` with potential alias `r` or `clear`
- **Options Consistency**: Same option names as publish (-f, --file)
- **Help Text**: Clear description of functionality and usage examples
- **Progress Feedback**: Status updates for multi-file operations

### Error Handling Design
- **File Not Found**: Clear error message and continue with remaining files
- **Permission Errors**: Informative error with suggested resolution
- **Invalid Metadata**: Warning message but continue processing
- **No Title Found**: Handle gracefully, create clean front-matter or remove entirely

### Safety Design
- **Non-destructive**: Only removes publication metadata, preserves content
- **Validation**: Confirm metadata structure before modification
- **Dry Run**: Optional --dry-run mode for preview (like publish command)

## 📊 Success Metrics

### Functional Metrics
- [ ] Command appears in CLI help output
- [ ] Single file reset removes publication metadata while preserving title
- [ ] Directory reset processes all .md files recursively
- [ ] Error handling works for various failure scenarios
- [ ] User feedback provides clear status information

### Quality Metrics
- [ ] 85% minimum test coverage achieved
- [ ] 100% test success rate
- [ ] Integration tests pass with existing CLI structure
- [ ] Performance acceptable for large directories

### User Experience Metrics
- [ ] Command follows same patterns as existing commands
- [ ] Clear and helpful error messages
- [ ] Consistent behavior with publish command patterns
- [ ] Documentation and help text clarity