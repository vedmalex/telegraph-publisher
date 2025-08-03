import { join } from 'path';
import { file, write } from 'bun';
import { mkdir } from 'node:fs/promises';

async function sliceBook() {
  const baseDir = join(process.cwd(), '..', 'материалы', 'SatKriyaSaraDipika', 'sliced');
  const bookPath = join(process.cwd(), '..', 'материалы', 'SatKriyaSaraDipika', 'SatKriyaSaraDipika.md');
  const contentsPath = join(process.cwd(), '..', 'материалы', 'SatKriyaSaraDipika', 'book.md');

  // Ensure base directory exists
  await mkdir(baseDir, { recursive: true });

  // Read the full book content
  const bookContent = await file(bookPath).text();
  const contentsContent = await file(contentsPath).text();

  // Parse contents to get sections and their start pages
  const sections: { name: string; page: number; level: number; full_path_name: string; parent_full_path?: string }[] = [];
  const lines = contentsContent.split('\n');
  let currentParentFullPath = '';

  for (const line of lines) {
    // Regex for main sections: 001. **Section Name** Page
    const mainSectionRegex = /^\s*(\d{3}\. )\*\*([^*]+?)\*\*\s+(\d+)\s*$/;
    // Updated regex for sub-sections:     01. Sub Section Name Page
    const subSectionRegex = /^\s*(\d{2}\. )([^\d\*]+?)\s+(\d+)\s*$/;

    let match;

    match = line.match(mainSectionRegex);
    if (match) {
      const fullPath = match[1]?.trim() ?? '';
      const name = match[2]?.trim() ?? '';
      const page = parseInt(match[3] ?? '0');
      sections.push({ name, page, level: 0, full_path_name: fullPath.slice(0, -1) }); // Remove trailing dot for path
      currentParentFullPath = fullPath.slice(0, -1); // Store parent path without trailing dot
      continue;
    }

    match = line.match(subSectionRegex);
    if (match) {
      const subSectionNumber = match[1]?.trim() ?? '';
      const name = match[2]?.trim() ?? '';
      const page = parseInt(match[3] ?? '0');

      if (currentParentFullPath) {
        const fullPathName = `${currentParentFullPath}/${subSectionNumber.slice(0, -1)}`; // Combine parent and sub-section numbers
        sections.push({ name, page, level: 1, full_path_name: fullPathName, parent_full_path: currentParentFullPath });
      } else {
        // Fallback for unexpected structure, treat as top-level using just the subSectionNumber
        sections.push({ name, page, level: 0, full_path_name: subSectionNumber.slice(0, -1) });
        console.warn(`Sub-section '${name}' found without a preceding main section. Treating as main section.`);
        currentParentFullPath = subSectionNumber.slice(0, -1);
      }
    }
  }
  console.log('--- Sections Parsing Status ---');
  console.log(`Number of sections found: ${sections.length}`);
  if (sections.length > 0) {
    console.log('First 5 sections:', sections.slice(0, 5));
  }

  // Sort sections by page
  sections.sort((a, b) => a.page - b.page);

  // Split book into pages
  const pages: { [key: number]: string } = {};
  const pageRegex = /\*\*Страница (\d+)\*\*/g;
  let lastIndex = 0;
  let matchPage;
  while ((matchPage = pageRegex.exec(bookContent)) !== null) {
    const pageNum = parseInt(matchPage[1] ?? '0');
    const start = matchPage.index + matchPage[0].length;
    const end = bookContent.indexOf('**Страница ', start);
    const content = bookContent.slice(start, end !== -1 ? end : undefined).trim();
    pages[pageNum] = content;
    lastIndex = end;
  }
  // Last page - ensure it's captured correctly
  if (lastIndex !== -1 && lastIndex < bookContent.length) {
    const lastPageNum = Object.keys(pages).length > 0 ? Math.max(...Object.keys(pages).map(Number)) + 1 : 1;
    pages[lastPageNum] = bookContent.slice(lastIndex).trim();
  } else if (Object.keys(pages).length === 0 && bookContent.length > 0) {
    // Case where there are no page markers but content exists (e.g., a single page book)
    pages[1] = bookContent.trim();
  }

  console.log('--- Pages Parsing Status ---');
  console.log(`Number of pages found: ${Object.keys(pages).length}`);
  if (Object.keys(pages).length > 0) {
    console.log('Sample pages (1, 2, 3):', pages[1]?.substring(0, 100), pages[2]?.substring(0, 100), pages[3]?.substring(0, 100));
  }

  const allPageNumbers = Object.keys(pages).map(Number).sort((a, b) => a - b);

  // Create folders and save pages
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const nextSection = sections[i + 1];
    const startPage = section.page;
    const endPage = nextSection ? nextSection.page - 1 : (allPageNumbers.length > 0 ? Math.max(...allPageNumbers) : 0);

    let targetDirForSection: string;

    if (section.level === 0) {
      targetDirForSection = join(baseDir, section.full_path_name); // Use full_path_name directly
      console.log(`Determined main section directory: ${targetDirForSection}`);
    } else if (section.level === 1 && section.parent_full_path) {
      targetDirForSection = join(baseDir, section.parent_full_path, section.full_path_name.split('/').pop()!); // Use parent path and only the last part of full_path_name
      console.log(`Determined sub-section directory: ${targetDirForSection}`);
    } else {
      targetDirForSection = baseDir;
      console.warn(`Unexpected section structure for ${section.name}. Placing in base directory.`);
    }

    await mkdir(targetDirForSection, { recursive: true }); // Ensure this directory exists

    console.log(`Processing section: ${section.name} (Path: ${targetDirForSection}), Start Page: ${startPage}, End Page: ${endPage}`);

    for (let p = startPage; p <= endPage; p++) {
      if (pages[p]) {
        let pageContent = pages[p] ?? '';

        // Add front matter to the beginning of the page content
        const frontMatter = `---\ntitle: Sat Kriya Sara Dipika - page - ${p}\n---\n\n`;
        pageContent = frontMatter + pageContent;

        // Add navigation links
        const prevPage = p > 1 ? p - 1 : null;
        const nextPage = p < allPageNumbers.length ? allPageNumbers[allPageNumbers.indexOf(p) + 1] : null; // Get the actual next page number from sorted list

        let navigationLinks = '';
        if (prevPage || nextPage) {
          navigationLinks += '\n\n***\n\n**Navigation:**\n';
          if (prevPage) {
            const prevFilePath = `./page_${prevPage.toString().padStart(3, '0')}.md`;
            navigationLinks += `\n* [Previous Page: ${prevPage}](${prevFilePath}) `;
          }
          if (nextPage) {
            const nextFilePath = `./page_${nextPage.toString().padStart(3, '0')}.md`;
            navigationLinks += `\n* [Next Page: ${nextPage}](${nextFilePath})`;
          }
        }
        pageContent += navigationLinks;

        const filePath = join(targetDirForSection, `page_${p.toString().padStart(3, '0')}.md`);
        console.log(`Writing page ${p} to ${filePath}`);
        await write(filePath, pageContent);
      } else {
        console.log(`Page ${p} not found in parsed content.`);
      }
    }
  }

  // Generate toc.md
  let tocContent = `---\ntitle: Sat Kriya Sara Dipika\n---\n\n# Contents\n\n`;
  let lastMainSectionFullPath = ''; // This variable is not strictly needed for the new TOC format, but kept for context

  for (const section of sections) {
    let sectionText = '';
    let indentation = '';

    const firstPageFile = `page_${section.page.toString().padStart(3, '0')}.md`;

    // Determine the relative path for the link based on section level
    let linkBaseDir = '';
    if (section.level === 0) {
      linkBaseDir = section.full_path_name; // e.g., '001'
    } else if (section.level === 1 && section.parent_full_path) {
      linkBaseDir = `${section.parent_full_path}/${section.full_path_name.split('/').pop()}`; // e.g., '005/01'
    }
    const linkPath = `./${linkBaseDir}/${firstPageFile}`;

    if (section.level === 0) {
      sectionText = `${section.full_path_name}. ${section.name}`;
      tocContent += `* [${sectionText}](${linkPath})\n`;
      // lastMainSectionFullPath = section.full_path_name; // No longer strictly needed as nesting is directly based on level
    } else if (section.level === 1) {
      indentation = '  '; // Two spaces for sub-sections for markdown bullet list
      sectionText = `${section.full_path_name.split('/').pop()}. ${section.name}`;
      tocContent += `${indentation}* [${sectionText}](${linkPath})\n`;
    }
  }

  const tocFilePath = join(baseDir, 'toc.md');
  console.log(`Writing TOC to ${tocFilePath}`);
  await write(tocFilePath, tocContent);

  console.log('Slicing and TOC generation completed.');
}

sliceBook().catch(console.error);
