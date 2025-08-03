# Task Definition: Debug Option Implementation

**Task ID:** TASK-014
**Created:** 2025-08-03_11-29
**Status:** ACTIVE
**Priority:** Medium
**Phase:** VAN

## Task Summary

Implement a new CLI option `--debug` that works in conjunction with `--dry-run` to save generated Telegraph JSON to a file for debugging purposes.

## User Request

The user provided a comprehensive technical specification (technical-specification.md) for adding a `--debug` option to the CLI publish command. This option should:

1. Automatically enable `--dry-run` mode
2. Save the generated TelegraphNode[] JSON to a file
3. Use pretty formatting with 2-space indentation
4. Save alongside the original markdown file with .json extension
5. Provide user feedback about the saved file

## User Specifications

- **Technical Specification Document:** Comprehensive specification provided by user
- **Target Files:** CLI commands, workflow manager, publisher
- **Testing Requirements:** Need to update existing tests
- **Format Requirements:** JSON with 2-space indentation
- **File Naming:** Same as source file but with .json extension

## Success Criteria

1. New `--debug` CLI option added to publish command
2. `--debug` automatically enables `--dry-run` mode
3. Generated TelegraphNode[] saved as formatted JSON file
4. User feedback provided when JSON file is saved
5. Functionality works for both single files and directories
6. Tests updated to cover new functionality
7. No JSON file created when `--dry-run` used without `--debug`

## Context

This feature will enhance the development experience by allowing developers to inspect the exact JSON that would be sent to Telegraph API, making debugging much easier.

## Files to Examine

- `src/cli/EnhancedCommands.ts` - CLI command definition
- `src/workflow/PublicationWorkflowManager.ts` - Command handling logic
- `src/publisher/EnhancedTelegraphPublisher.ts` - JSON generation and saving
- `src/workflow/PublicationWorkflowManager.test.ts` - Test updates

## Next Steps

1. Analyze current CLI structure and publisher implementation
2. Plan the implementation approach
3. Implement the changes across the identified files
4. Update tests to cover the new functionality
5. Validate the implementation meets all acceptance criteria