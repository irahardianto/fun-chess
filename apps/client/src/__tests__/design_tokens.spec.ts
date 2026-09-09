import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

interface CssBlock {
  selector: string;
  content: string;
  start: number;
  end: number;
}

function parseTopLevelBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let depth = 0;
  let currentSelector = '';
  let currentBody = '';
  let blockStart = 0;
  let inString: string | null = null;
  let inComment = false;

  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    const nextChar = css[i + 1];

    if (inComment) {
      if (char === '*' && nextChar === '/') {
        inComment = false;
        i++;
      }
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inComment = true;
      i++;
      continue;
    }

    if (inString) {
      if (char === inString && css[i - 1] !== '\\') {
        inString = null;
      }
      if (depth === 0) currentSelector += char;
      else currentBody += char;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = char;
      if (depth === 0) currentSelector += char;
      else currentBody += char;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        blockStart = i;
        currentBody = '';
      } else {
        currentBody += char;
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        blocks.push({
          selector: currentSelector.trim(),
          content: currentBody,
          start: blockStart,
          end: i,
        });
        currentSelector = '';
        currentBody = '';
      } else {
        currentBody += char;
      }
    } else {
      if (depth === 0) {
        currentSelector += char;
      } else {
        currentBody += char;
      }
    }
  }

  return blocks;
}

describe('Design Tokens Cascade and Theme Specificity (MAJ-UX-001)', () => {
  const designTokensPath = path.resolve(__dirname, '../assets/design-tokens.css');
  const cssContent = fs.readFileSync(designTokensPath, 'utf-8');
  const blocks = parseTopLevelBlocks(cssContent);

  const glassTokenNames = [
    '--hint-banner-glass',
    '--soft-error-glass',
    '--soft-info-glass',
    '--soft-success-glass',
    '--glow-hint-banner',
  ];

  it('defines default floating glass overlay tokens in the primary :root block', () => {
    expect(cssContent).toContain('--hint-banner-glass:   rgba(254, 249, 195, 0.94);');
    expect(cssContent).toContain('--soft-error-glass:    rgba(255, 241, 242, 0.94);');
    expect(cssContent).toContain('--soft-info-glass:     rgba(240, 249, 255, 0.94);');
    expect(cssContent).toContain('--soft-success-glass:  rgba(240, 253, 244, 0.94);');
    expect(cssContent).toContain('--glow-hint-banner:    0 0 20px 4px rgba(255, 193, 7, 0.38);');
  });

  it('defines dark theme floating glass overlay overrides in [data-theme=\'dark\']', () => {
    expect(cssContent).toContain('--hint-banner-glass:     rgba(45, 36, 18, 0.94);');
    expect(cssContent).toContain('--soft-error-glass:      rgba(45, 20, 25, 0.94);');
    expect(cssContent).toContain('--soft-info-glass:       rgba(20, 38, 50, 0.94);');
    expect(cssContent).toContain('--soft-success-glass:    rgba(20, 45, 30, 0.94);');
  });

  it('ensures default glass tokens appear before the semantic [data-theme=\'dark\'] block in the CSS cascade', () => {
    const semanticDarkBlock = blocks.find(
      (b) => b.selector.includes("[data-theme='dark']") && b.content.includes('--hint-banner-glass')
    );
    expect(semanticDarkBlock).toBeDefined();
    const darkThemeIndex = semanticDarkBlock!.start;

    for (const token of glassTokenNames) {
      const tokenIndex = cssContent.indexOf(token);
      expect(tokenIndex).toBeGreaterThan(-1);
      expect(tokenIndex).toBeLessThan(darkThemeIndex);
    }
  });

  it('ensures no subsequent :root blocks shadow dark mode floating glass overlay overrides', () => {
    const semanticDarkBlockIndex = blocks.findIndex(
      (b) => b.selector.includes("[data-theme='dark']") && b.content.includes('--hint-banner-glass')
    );
    expect(semanticDarkBlockIndex).toBeGreaterThan(-1);

    const subsequentBlocks = blocks.slice(semanticDarkBlockIndex + 1);
    const subsequentRootBlocks = subsequentBlocks.filter((b) => b.selector === ':root');

    expect(subsequentRootBlocks.length).toBeGreaterThan(0);

    for (const rootBlock of subsequentRootBlocks) {
      for (const token of glassTokenNames) {
        expect(rootBlock.content).not.toContain(token);
      }
    }
  });

  it('validates dark theme override precedence in parsed style blocks', () => {
    let lastRootHintBanner = '';
    let lastDarkHintBanner = '';
    let lastRootSoftError = '';
    let lastDarkSoftError = '';

    for (const block of blocks) {
      if (block.selector === ':root') {
        const hintMatch = block.content.match(/--hint-banner-glass:\s*([^;]+);/);
        if (hintMatch?.[1]) lastRootHintBanner = hintMatch[1].trim();

        const errorMatch = block.content.match(/--soft-error-glass:\s*([^;]+);/);
        if (errorMatch?.[1]) lastRootSoftError = errorMatch[1].trim();
      } else if (block.selector.includes("[data-theme='dark']")) {
        const hintMatch = block.content.match(/--hint-banner-glass:\s*([^;]+);/);
        if (hintMatch?.[1]) lastDarkHintBanner = hintMatch[1].trim();

        const errorMatch = block.content.match(/--soft-error-glass:\s*([^;]+);/);
        if (errorMatch?.[1]) lastDarkSoftError = errorMatch[1].trim();
      }
    }

    expect(lastRootHintBanner).toBe('rgba(254, 249, 195, 0.94)');
    expect(lastDarkHintBanner).toBe('rgba(45, 36, 18, 0.94)');
    expect(lastRootSoftError).toBe('rgba(255, 241, 242, 0.94)');
    expect(lastDarkSoftError).toBe('rgba(45, 20, 25, 0.94)');
  });
});
