import { test, expect } from "bun:test";
import { convertMarkdownToTelegraphNodes, validateContentStructure } from './markdownConverter';
import type { TelegraphNode } from './telegraphPublisher';

test("should convert simple paragraph to Telegraph node", () => {
  const markdown = 'This is a simple paragraph.';
  const result = convertMarkdownToTelegraphNodes(markdown);

  expect(result).toEqual([
    { tag: 'p', children: ['This is a simple paragraph.'] }
  ]);
});

test("should convert headings to Telegraph nodes", () => {
  const markdown = '# Heading 1\n## Heading 2\n### Heading 3';
  const result = convertMarkdownToTelegraphNodes(markdown);

  expect(result).toEqual([
    { tag: 'h1', children: ['Heading 1'] },
    { tag: 'h2', children: ['Heading 2'] },
    { tag: 'h3', children: ['Heading 3'] }
  ]);
});

test("should convert bold text to strong nodes", () => {
  const markdown = 'This is **bold** text and __also bold__.';
  const result = convertMarkdownToTelegraphNodes(markdown);

  expect(result).toEqual([
    {
      tag: 'p',
      children: [
        'This is ',
        { tag: 'strong', children: ['bold'] },
        ' text and ',
        { tag: 'strong', children: ['also bold'] },
        '.'
      ]
    }
  ]);
});

test("should convert italic text to em nodes", () => {
  const markdown = 'This is *italic* text and _also italic_.';
  const result = convertMarkdownToTelegraphNodes(markdown);

  expect(result).toEqual([
    {
      tag: 'p',
      children: [
        'This is ',
        { tag: 'em', children: ['italic'] },
        ' text and ',
        { tag: 'em', children: ['also italic'] },
        '.'
      ]
    }
  ]);
});

test("should convert blockquotes to blockquote nodes", () => {
  const markdown = '> This is a blockquote\n> with multiple lines';
  const result = convertMarkdownToTelegraphNodes(markdown);

  expect(result).toEqual([
    { tag: 'blockquote', children: ['This is a blockquote'] },
    { tag: 'blockquote', children: ['with multiple lines'] }
  ]);
});

test("should convert unordered lists to ul nodes", () => {
  const markdown = '- Item 1\n- Item 2\n- Item 3';
  const result = convertMarkdownToTelegraphNodes(markdown);

  expect(result).toEqual([
    {
      tag: 'ul',
      children: [
        { tag: 'li', children: ['Item 1'] },
        { tag: 'li', children: ['Item 2'] },
        { tag: 'li', children: ['Item 3'] }
      ]
    }
  ]);
});

test("should convert ordered lists to ol nodes", () => {
  const markdown = '1. First item\n2. Second item\n3. Third item';
  const result = convertMarkdownToTelegraphNodes(markdown);

  expect(result).toEqual([
    {
      tag: 'ol',
      children: [
        { tag: 'li', children: ['First item'] },
        { tag: 'li', children: ['Second item'] },
        { tag: 'li', children: ['Third item'] }
      ]
    }
  ]);
});

test("should convert inline code to code nodes", () => {
  const markdown = 'This is `inline code` in text.';
  const result = convertMarkdownToTelegraphNodes(markdown);

  expect(result).toEqual([
    {
      tag: 'p',
      children: [
        'This is ',
        { tag: 'code', children: ['inline code'] },
        ' in text.'
      ]
    }
  ]);
});

test("should convert links to anchor nodes", () => {
  const markdown = 'Visit [Google](https://google.com) for search.';
  const result = convertMarkdownToTelegraphNodes(markdown);

  expect(result).toEqual([
    {
      tag: 'p',
      children: [
        'Visit ',
        { tag: 'a', attrs: { href: 'https://google.com' }, children: ['Google'] },
        ' for search.'
      ]
    }
  ]);
});

test("should handle complex nested markdown", () => {
  const markdown = '## **Bold Heading**\n\nThis is a paragraph with **bold** and *italic* text.\n\n- List item with `code`\n- Another item';
  const result = convertMarkdownToTelegraphNodes(markdown);

  expect(result.length).toBeGreaterThan(0);
  expect(result[0]?.tag).toBe('h2');
  expect(result[1]?.tag).toBe('p');
  expect(result[2]?.tag).toBe('ul');
});

test("should validate correct shloka structure", () => {
  const validMarkdown = `### **Связный пословный перевод Шримад-Бхагаватам 1.1.1**

**Полный текст:**

**Разбор и связный перевод:**

**Часть 1: Обращение и объект поклонения**

> **ом̇ намо бхагавате ва̄судева̄йа**

**Связно:** «Ом, с почтением я склоняюсь»

**Часть 2: Определение Абсолютной Истины**

> **джанма̄дй асйа йато 'нвайа̄д итараташ́ ча̄ртхешв абхиджн̃ах̣ свара̄т̣**

**Связно:** «От Которого происходит сотворение»

**Часть 3: Источник знания**

> **тене брахма хр̣да̄ йа а̄ди-кавайе мухйанти йат сӯрайах̣**

**Связно:** «Тот, Кто вложил ведическое знание»

**Часть 4: Природа иллюзии**

> **теджо-ва̄ри-мр̣да̄м̇ йатха̄ винимайо йатра три-сарго 'мр̣ша̄**

**Связно:** «Подобно тому как происходит обманчивое смешение»

**Часть 5: Заключение**

> **дха̄мна̄ свена сада̄ нираста-кухакам̇ сатйам̇ парам̇ дхӣмахи**

**Связно:** «На Него, Кто Своей собственной обителью»

### **Итоговый связный перевод в едином тексте:**`;

  const result = validateContentStructure(validMarkdown);
  expect(result).toBe(true);
});

test("should fail validation for missing main heading", () => {
  const invalidMarkdown = `**Полный текст:**

**Разбор и связный перевод:**`;

  const result = validateContentStructure(invalidMarkdown);
  expect(result).toBe(false);
});

test("should fail validation for missing required sections", () => {
  const invalidMarkdown = `### **Связный пословный перевод Шримад-Бхагаватам 1.1.1**

Some content but missing required sections.`;

  const result = validateContentStructure(invalidMarkdown);
  expect(result).toBe(false);
});