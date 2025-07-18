# 🚀 Telegraph Publisher v1.2.0 - Metadata Management System

## ✨ Major Features
- **📋 YAML Front-matter Management**: Automatic metadata injection and tracking
- **🔗 Bidirectional Link Resolution**: Smart conversion between local and Telegraph URLs
- **📊 Dependency Analysis**: Automatic detection and publishing of linked files
- **⚙️ Enhanced CLI**: New commands (`pub`, `analyze`, `config`, `status`) with legacy support

## 🎯 Key Improvements
- **85.42% test coverage** with 196 comprehensive tests
- **Unified CLI interface** with backward compatibility
- **Smart republishing** with change detection
- **Project-wide configuration** management

## 📋 Quick Start
```bash
# Enhanced publishing
telegraph-publisher pub -f article.md -a "Author"

# Analyze dependencies
telegraph-publisher analyze -f main.md --show-tree

# Configure defaults
telegraph-publisher config --username "Your Name"
```

## 🔄 Migration
- **Existing users**: All commands work as `*-legacy` versions
- **New users**: Use enhanced `pub` command for best experience
- **Full backward compatibility** with v1.1.x

## 📦 What's Included
- 🔧 **6 new core components** (MetadataManager, LinkResolver, DependencyManager, etc.)
- 📝 **Comprehensive documentation** and examples
- 🧪 **Extensive test suite** with mock Telegraph API
- ⚡ **Performance optimizations** and caching

**Full release notes**: [RELEASE_NOTES_v1.2.0.md](./RELEASE_NOTES_v1.2.0.md)