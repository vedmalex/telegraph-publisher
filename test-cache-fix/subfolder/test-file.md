# Test Cache Location Fix

This file is in a subfolder to test that the cache file is created in the working directory (test-cache-fix/) and not in the subfolder where this file is located.

## Expected Behavior

When running bulk publish from `test-cache-fix/` directory:
- Cache file should be created at: `test-cache-fix/.telegraph-pages-cache.json`
- NOT at: `test-cache-fix/subfolder/.telegraph-pages-cache.json`

This ensures cache is shared across all files in the project, not scattered in subdirectories.