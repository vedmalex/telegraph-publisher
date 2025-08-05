# CLI Flags Migration Guide

## Overview

This guide covers the CLI flags refactoring implemented in `telegraph-publisher` v2.0. The changes unify flag functionality, improve consistency, and enhance the user experience while maintaining backward compatibility.

## 🚀 What Changed

### 1. Unified Force Flag

#### Before (Deprecated)
```bash
# Two separate flags with overlapping functionality
telegraph-publisher pub --file article.md --force-republish
telegraph-publisher pub --file article.md --force
```

#### After (Current)
```bash
# Single unified flag with combined functionality
telegraph-publisher pub --file article.md --force
```

#### Benefits
- **Simplified CLI interface** - One flag instead of two
- **Unified behavior** - Force republication and bypass link verification
- **Better user experience** - Less confusion about which flag to use

### 2. Enhanced Flag Propagation

#### Before
- Flags applied only to root file
- Dependencies used default behavior
- Inconsistent behavior across dependency chain

#### After
- Flags propagate through entire dependency chain
- Consistent behavior for all linked files
- Predictable results for complex document structures

### 3. Updated Default Configuration

#### Before
```json
{
  "maxDependencyDepth": 1
}
```

#### After
```json
{
  "maxDependencyDepth": 20
}
```

## 📋 Migration Steps

### Step 1: Update Command Usage

Replace any usage of the deprecated `--force-republish` flag:

```bash
# ❌ Old (will show helpful error message)
telegraph-publisher pub --file article.md --force-republish

# ✅ New
telegraph-publisher pub --file article.md --force
```

### Step 2: Review Automation Scripts

If you have automation scripts or CI/CD pipelines using the old flag:

```bash
# Update build scripts
sed -i 's/--force-republish/--force/g' build.sh

# Update GitHub Actions
sed -i 's/--force-republish/--force/g' .github/workflows/publish.yml
```

### Step 3: Update Configuration (Optional)

If you have a custom `telegraph.config.json` with `maxDependencyDepth: 1`, you can now:

1. **Remove the setting** to use the new default (20)
2. **Keep your custom value** if you prefer specific depth control

## 🔧 New CLI Flag Behavior

### `--force` Flag (Unified)

The `--force` flag now combines the functionality of both previous flags:

**What it does:**
- ✅ Bypasses link verification (original `--force` behavior)
- ✅ Forces republication of unchanged files (original `--force-republish` behavior)  
- ✅ Propagates through entire dependency chain
- ✅ **NEVER creates new pages** for already published content (uses edit path)

**Usage examples:**
```bash
# Force republish a single file
telegraph-publisher pub --file article.md --force

# Force republish with dependencies
telegraph-publisher pub --file article.md --force --with-dependencies

# Debug mode with force (shows what would be published)
telegraph-publisher pub --file article.md --force --debug
```

### Enhanced Flag Propagation

All flags now propagate consistently:

```bash
# Debug mode applies to root file AND all dependencies
telegraph-publisher pub --file article.md --debug --with-dependencies

# Force behavior applies to entire dependency tree
telegraph-publisher pub --file article.md --force --with-dependencies

# Dry-run mode applies throughout the chain
telegraph-publisher pub --file article.md --dry-run --with-dependencies
```

## 🛡️ Safety Guarantees

### Critical Behavior Preservation

**The `--force` flag maintains these important safety guarantees:**

1. **Never creates duplicate pages** - Always uses existing edit paths for published content
2. **Preserves metadata** - Existing publication data is maintained
3. **Predictable behavior** - Same behavior whether file is new or already published

### Error Handling

If you accidentally use the old flag, you'll see a helpful migration message:

```
❌ Deprecated Flag Used: --force-republish

The flag '--force-republish' has been removed to simplify the CLI interface.

✅ Migration Guide:
   Old: telegraph-publisher pub --file example.md --force-republish
   New: telegraph-publisher pub --file example.md --force

📖 The '--force' flag now handles both:
   • Bypassing link verification (original --force behavior)
   • Forcing republication of unchanged files (original --force-republish behavior)

For more information, run: telegraph-publisher pub --help
```

## 📚 API Changes (for Developers)

### New TypeScript Interfaces

If you're using the API programmatically:

```typescript
// New unified options interface
interface PublishDependenciesOptions {
  dryRun?: boolean;
  debug?: boolean;
  force?: boolean;          // Unified flag
  generateAside?: boolean;
  tocTitle?: string;
  tocSeparators?: boolean;
}

// Updated method signature
async publishDependencies(
  filePath: string,
  username: string,
  options: PublishDependenciesOptions = {}
): Promise<{ success: boolean; error?: string; publishedFiles?: string[] }>
```

### Migration for Programmatic Usage

```typescript
// ❌ Old API usage
await publisher.publishDependencies(
  'article.md',
  'author',
  true,  // dryRun
  true,  // generateAside
  'Contents', // tocTitle
  true   // tocSeparators
);

// ✅ New API usage
await publisher.publishDependencies(
  'article.md',
  'author',
  {
    dryRun: true,
    force: true,          // Unified force flag
    generateAside: true,
    tocTitle: 'Contents',
    tocSeparators: true
  }
);
```

### Options Builder Pattern

For complex scenarios, use the builder pattern:

```typescript
import { PublishOptionsBuilder } from 'telegraph-publisher';

const options = PublishOptionsBuilder.create()
  .force(true)
  .debug(true)
  .tableOfContents({
    enabled: true,
    title: 'Table of Contents',
    separators: false
  })
  .buildValidated();

await publisher.publishDependencies('article.md', 'author', options);
```

## 🔍 Troubleshooting

### Common Issues

**Q: I'm getting "deprecated flag" errors**
- **A:** Replace `--force-republish` with `--force` in your commands

**Q: Force flag behavior seems different**
- **A:** The new `--force` combines both old flags' functionality. It should work the same or better.

**Q: My dependencies aren't being force-published**
- **A:** Ensure you're using `--with-dependencies` along with `--force`

**Q: Performance seems slower with the new defaults**
- **A:** The new default `maxDependencyDepth: 20` processes more dependencies. You can override this in your config if needed.

### Getting Help

```bash
# View all available options
telegraph-publisher pub --help

# Check current configuration
telegraph-publisher config show

# Test with dry-run mode
telegraph-publisher pub --file article.md --dry-run --force
```

## 📈 Benefits Summary

### For Users
- ✅ **Simpler CLI** - Fewer flags to remember
- ✅ **Consistent behavior** - Flags work the same across all files
- ✅ **Better error messages** - Helpful migration guidance
- ✅ **More powerful defaults** - Process more dependencies by default

### For Developers
- ✅ **Type-safe APIs** - Better TypeScript support
- ✅ **Clean architecture** - Improved code organization
- ✅ **Better testing** - Comprehensive test coverage
- ✅ **Maintainable code** - Cleaner patterns and structures

## 🔗 Additional Resources

- [CLI Reference](./CLI-REFERENCE.md) - Complete flag documentation
- [API Documentation](./API-REFERENCE.md) - Programmatic usage guide
- [Configuration Guide](./CONFIGURATION.md) - Setup and customization
- [Examples](./EXAMPLES.md) - Common usage patterns

---

**Need help?** If you encounter any issues during migration, please [open an issue](https://github.com/your-repo/telegraph-publisher/issues) with your specific use case. 