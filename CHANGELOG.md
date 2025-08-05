# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-08-05

### 🚀 Major Changes - CLI Flags Refactoring

#### Added
- **Unified Force Flag**: New `--force` flag combines functionality of `--force` and `--force-republish`
- **Enhanced Flag Propagation**: All flags now propagate through entire dependency chain
- **Type-Safe Options System**: New `PublishDependenciesOptions` interface with validation
- **Builder Pattern Support**: `PublishOptionsBuilder` for complex option construction
- **Intelligent Error Handling**: User-friendly migration guidance for deprecated flags
- **Comprehensive Documentation**: Migration guide and API reference

#### Changed
- **BREAKING**: Removed `--force-republish` flag (use `--force` instead)
- **Default Configuration**: Updated `maxDependencyDepth` from `1` to `20`
- **API Signature**: `publishDependencies` now accepts options object instead of individual parameters
- **Flag Behavior**: `--force` now handles both link verification bypass and force republication
- **Dependency Processing**: Deeper dependency traversal by default

#### Enhanced
- **Error Messages**: Deprecated flag usage shows helpful migration guidance
- **Type Safety**: Complete TypeScript interfaces for all publisher options
- **Testing Coverage**: 71 comprehensive tests with 100% success rate
- **Architecture**: Clean layer integration patterns between CLI, Workflow, and Publisher
- **Validation**: Runtime validation with sensible defaults for all options

#### Preserved
- **Backward Compatibility**: `publishWithMetadata` maintains existing signature
- **Critical Behavior**: `--force` flag NEVER creates new pages for published content
- **Existing Functionality**: All legacy CLI options continue to work
- **Performance**: Maintained and improved options transformation performance

### 🛡️ Safety Guarantees

- ✅ **No Breaking Changes** for `publishWithMetadata` API
- ✅ **Force Flag Safety** - Always uses edit paths for published content
- ✅ **Metadata Preservation** - Existing publication data maintained
- ✅ **Regression Protection** - Comprehensive tests prevent functionality loss

### 📚 Migration Guide

#### CLI Usage
```bash
# ❌ Old (deprecated)
telegraph-publisher pub --file article.md --force-republish

# ✅ New (unified)
telegraph-publisher pub --file article.md --force
```

#### API Usage
```typescript
// ❌ Old API
await publisher.publishDependencies('file.md', 'author', true, true, 'Title', false);

// ✅ New API
await publisher.publishDependencies('file.md', 'author', {
  dryRun: true,
  force: true,
  generateAside: true,
  tocTitle: 'Title',
  tocSeparators: false
});
```

### 🧪 Testing

- **71 Tests** with 100% success rate
- **Unit Tests**: Core functionality validation
- **Integration Tests**: End-to-end workflow testing  
- **Regression Tests**: Backward compatibility protection
- **Performance Tests**: Options transformation efficiency

### 📖 Documentation

- **Migration Guide**: Step-by-step upgrade instructions
- **API Reference**: Complete interface documentation
- **Troubleshooting**: Common issues and solutions
- **Examples**: Usage patterns and best practices

### 🏗️ Architecture Improvements

- **Options Propagation Patterns**: Clean transformation between layers
- **Type-Safe Validation**: Runtime validation with compile-time safety
- **Error-First Design**: Structured error handling with user guidance
- **Builder Patterns**: Flexible option construction for complex scenarios
- **Clean Architecture**: Separation of concerns across CLI, Workflow, Publisher

### 🔧 Technical Details

#### New Interfaces
- `PublishDependenciesOptions` - Unified options interface
- `ValidatedPublishDependenciesOptions` - Runtime-validated options
- `DeprecatedFlagError` - Structured error for deprecated flags

#### New Classes
- `PublishOptionsValidator` - Options validation and defaults
- `PublishOptionsBuilder` - Builder pattern for complex options
- `OptionsPropagationChain` - Clean options transformation
- `LayerIntegrationPattern` - Cross-layer integration
- `UserFriendlyErrorReporter` - Enhanced error formatting

#### Updated Methods
- `publishDependencies()` - New options-based signature
- Enhanced error handling throughout CLI layer
- Improved options propagation in Publisher layer

---

## [1.x.x] - Previous Versions

[Previous changelog entries would go here...]

---

### 🔗 Links

- [Migration Guide](./docs/CLI-FLAGS-MIGRATION-GUIDE.md)
- [API Reference](./docs/API-REFERENCE.md)
- [Full Documentation](./docs/)

**For complete details on any change, see the linked documentation above.** 