import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from "bun:test";
import * as fs from 'node:fs'; // Import the actual fs module
import { dirname, join as nodePathJoin, resolve as nodePathResolve } from 'node:path';
import { PathResolver } from "./PathResolver";

describe('PathResolver', () => {
  let pathResolver: PathResolver;

  beforeEach(() => {
    pathResolver = PathResolver.getInstance();
    // Clear cache before each test
    (pathResolver as any).projectRootCache.clear();
  });

  afterEach(() => {
    // Clear PathResolver's cache after each test
    (pathResolver as any).projectRootCache.clear();
    // Restore any spies
    jest.restoreAllMocks();
  });

  test('should be a singleton instance', () => {
    const anotherInstance = PathResolver.getInstance();
    expect(pathResolver).toBe(anotherInstance);
  });

  describe('findProjectRoot', () => {
    test('should find project root in current working directory', () => {
      // Use actual current working directory which should have package.json
      const currentDir = process.cwd();
      const testFilePath = nodePathJoin(currentDir, 'src', 'utils', 'PathResolver.ts');

      const result = pathResolver.findProjectRoot(testFilePath);
      expect(result).toBe(currentDir);
    });

    test('should return dirname if no project root found', () => {
      // Create a spy to mock existsSync for this specific test
      const existsSyncSpy = jest.spyOn(fs, 'existsSync');
      existsSyncSpy.mockReturnValue(false);

      const filePathWithoutRoot = '/some/random/dir/file.md';
      const result = pathResolver.findProjectRoot(filePathWithoutRoot);
      expect(result).toBe(nodePathResolve('/some/random/dir'));

      existsSyncSpy.mockRestore();
    });

    test('should cache project root results', () => {
      const existsSyncSpy = jest.spyOn(fs, 'existsSync');

      const testPath = '/test/project/src/file.md';

      // First call
      pathResolver.findProjectRoot(testPath);
      const firstCallCount = existsSyncSpy.mock.calls.length;

      // Second call - should use cache
      pathResolver.findProjectRoot(testPath);
      const secondCallCount = existsSyncSpy.mock.calls.length;

      // Should not make additional calls due to caching
      expect(secondCallCount).toBe(firstCallCount);

      existsSyncSpy.mockRestore();
    });
  });

  describe('resolve', () => {
    const mockFromPath = '/home/user/project/src/docs/page.md';
    const mockProjectRoot = '/home/user/project';

    test('should resolve relative path starting with ./ ', () => {
      const linkHref = './images/image.png';
      const expected = nodePathResolve(dirname(mockFromPath), linkHref);
      expect(pathResolver.resolve(mockFromPath, linkHref)).toBe(expected);
    });

    test('should resolve relative path starting with ../ ', () => {
      const linkHref = '../assets/doc.pdf';
      const expected = nodePathResolve(dirname(mockFromPath), linkHref);
      expect(pathResolver.resolve(mockFromPath, linkHref)).toBe(expected);
    });

    test('should resolve relative path without explicit ./ or ../', () => {
      const linkHref = 'another_file.md';
      const expected = nodePathResolve(dirname(mockFromPath), linkHref);
      expect(pathResolver.resolve(mockFromPath, linkHref)).toBe(expected);
    });

    test('should resolve absolute path relative to project root', () => {
      // Mock findProjectRoot for this specific test
      const findProjectRootSpy = jest.spyOn(pathResolver, 'findProjectRoot');
      findProjectRootSpy.mockReturnValue(mockProjectRoot);

      const linkHref = '/components/button.md';
      const expected = nodePathResolve(mockProjectRoot, linkHref.slice(1));
      expect(pathResolver.resolve(mockFromPath, linkHref)).toBe(expected);
      expect(findProjectRootSpy).toHaveBeenCalledWith(mockFromPath);

      findProjectRootSpy.mockRestore();
    });

    test('should handle complex relative paths', () => {
      const complexFromPath = '/a/b/c/d/file.md';
      const linkHref = '../../../sibling/target.md';
      const expected = nodePathResolve(dirname(complexFromPath), linkHref);
      expect(pathResolver.resolve(complexFromPath, linkHref)).toBe(expected);
    });

    test('should handle paths with query parameters or fragments', () => {
      const linkHref = './page.md?param=value#section';
      const expected = nodePathResolve(dirname(mockFromPath), linkHref);
      expect(pathResolver.resolve(mockFromPath, linkHref)).toBe(expected);
    });

    test('should handle root absolute path', () => {
      // Mock findProjectRoot for this specific test
      const findProjectRootSpy = jest.spyOn(pathResolver, 'findProjectRoot');
      findProjectRootSpy.mockReturnValue(mockProjectRoot);

      const linkHref = '/root_file.md';
      const expected = nodePathResolve(mockProjectRoot, linkHref.slice(1));
      expect(pathResolver.resolve(mockFromPath, linkHref)).toBe(expected);

      findProjectRootSpy.mockRestore();
    });
  });
});