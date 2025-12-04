import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel,
  convertInchesToTwip,
  ShadingType,
  Packer,
  LevelFormat,
  INumberingOptions,
  ExternalHyperlink,
  VerticalAlign,
} from 'docx';
import type { AnalysisResult, Settings, FAQ, SchemaRecommendation } from '@/types';
import { filterAndLimitKeywords, formatKeywordsForDocument } from './keyword-processor';

// Font constant for easy updates
const FONT = 'Poppins';

// Font sizes in half-points (multiply by 2 for pt size)
const FONT_SIZES = {
  TITLE: 56,      // 28pt
  HEADING1: 44,   // 22pt
  HEADING2: 32,   // 16pt
  HEADING3: 28,   // 14pt
  BODY: 24,       // 12pt
  SMALL: 20,      // 10pt
  CODE: 18,       // 9pt
};

// Colors
const COLORS = {
  PRIMARY: '1e3a5f',
  SECONDARY: '2c5282',
  TERTIARY: '3c6997',
  LINK: '2563EB',
  TEXT: '1a1a1a',
  TEXT_LIGHT: '374151',
  GREEN_HIGHLIGHT: 'C6EFCE',  // Light green for highlighting changes
  GREEN_BORDER: '22C55E',
};

interface DocGeneratorOptions {
  analysisResult: AnalysisResult;
  settings: Settings;
  clientName: string;
  pageName: string;
}

// Module-level H1 tracking to prevent duplicates
let processedH1s: Set<string> = new Set();

/**
 * Clean markers from text for display (removes [[KEYWORD:]], [[ADJUSTED:]], [[NEW]])
 * Used for metadata fields where we want clean text without markers
 */
function cleanMarkersForDisplay(text: string): string {
  return text
    .replace(/\[\[KEYWORD:\s*([^\]]*)\]\]/g, '$1')
    .replace(/\[\[ADJUSTED:\s*[^→]*→\s*([^\]]*)\]\]/g, '$1')
    .replace(/\[\[NEW\]\]/g, '')
    .trim();
}

/**
 * Reset H1 tracking - call at start of each document generation
 */
function resetH1Tracking(): void {
  processedH1s = new Set();
}

/**
 * Check if an H1 is a duplicate (case-insensitive, normalized)
 */
function isDuplicateH1(content: string): boolean {
  const normalized = cleanMarkersForDisplay(content)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  if (processedH1s.has(normalized)) {
    console.log('[doc-generator] Skipping duplicate H1:', normalized);
    return true;
  }

  processedH1s.add(normalized);
  return false;
}

/**
 * Filter out footer content that shouldn't appear in the document
 */
function filterFooterContent(content: string): string {
  // Patterns that indicate footer/non-content areas
  const footerPatterns = [
    /©.*All Rights Reserved.*/gi,
    /©\s*\d{4}.*/gi,
    /Privacy Policy.*/gi,
    /Terms of Service.*/gi,
    /Cookie Policy.*/gi,
    /\| All Rights Reserved \|/gi,
    /Follow us on.*/gi,
    /Connect with us.*/gi,
    /^\s*©.*/gm,
  ];

  let filtered = content;
  for (const pattern of footerPatterns) {
    filtered = filtered.replace(pattern, '');
  }

  // Split into lines and filter aggressively in the last portion
  const lines = filtered.split('\n');
  const cutoffIndex = Math.floor(lines.length * 0.85);

  const cleanedLines = lines.filter((line, index) => {
    const trimmedLine = line.trim();

    // Always filter these patterns regardless of position
    if (trimmedLine.includes('©') ||
        trimmedLine.includes('All Rights Reserved') ||
        /Privacy Policy/i.test(trimmedLine) ||
        /Terms of (Service|Use)/i.test(trimmedLine)) {
      return false;
    }

    // More aggressive filtering for bottom 15% of content
    if (index > cutoffIndex) {
      // Skip very short lines at the end (likely footer links)
      if (trimmedLine.length < 20 && trimmedLine.length > 0) {
        // Check if it looks like a footer link
        if (/^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/.test(trimmedLine)) {
          return false;
        }
      }
    }

    return true;
  });

  return cleanedLines.join('\n').trim();
}

// Numbering configuration for bullet lists
const numberingConfig: INumberingOptions = {
  config: [
    {
      reference: 'bullet-list',
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: 720, hanging: 360 },
            },
            run: { font: FONT },
          },
        },
        {
          level: 1,
          format: LevelFormat.BULLET,
          text: '\u25E6',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: 1440, hanging: 360 },
            },
            run: { font: FONT },
          },
        },
      ],
    },
    {
      reference: 'numbered-list',
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: 720, hanging: 360 },
            },
            run: { font: FONT },
          },
        },
      ],
    },
  ],
};

// Helper to create text with green highlight for new/changed content
function createHighlightedTextRun(
  text: string,
  options: {
    isNew?: boolean;
    bold?: boolean;
    italics?: boolean;
    size?: number;
    color?: string;
  } = {}
): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: options.size || FONT_SIZES.BODY,
    bold: options.bold,
    italics: options.italics,
    color: options.color,
    // Use shading for green highlight (more subtle than highlight property)
    shading: options.isNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
  });
}

// Helper to create a paragraph with optional green highlighting
function createHighlightedParagraph(
  text: string,
  isNew: boolean = false,
  options: { bold?: boolean; italics?: boolean } = {}
): Paragraph {
  return new Paragraph({
    children: [
      createHighlightedTextRun(text, { isNew, ...options })
    ],
    spacing: { after: 150 },
  });
}

// Helper to create highlighted heading for new/changed sections
function createHighlightedHeading(
  text: string,
  level: 1 | 2 | 3,
  isNew: boolean = false
): Paragraph {
  const headingLevel = level === 1 ? HeadingLevel.HEADING_1
    : level === 2 ? HeadingLevel.HEADING_2
    : HeadingLevel.HEADING_3;

  const sizes = { 1: FONT_SIZES.HEADING1, 2: FONT_SIZES.HEADING2, 3: FONT_SIZES.HEADING3 };
  const colors = { 1: COLORS.PRIMARY, 2: COLORS.SECONDARY, 3: COLORS.TERTIARY };

  return new Paragraph({
    heading: headingLevel,
    children: [
      new TextRun({
        text,
        font: FONT,
        size: sizes[level],
        bold: true,
        color: colors[level],
        shading: isNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
      })
    ],
    spacing: { before: level === 1 ? 360 : level === 2 ? 280 : 240, after: level === 1 ? 200 : level === 2 ? 160 : 120 },
  });
}

// Helper to create bullet point with optional highlighting
function createHighlightedBullet(
  text: string,
  isNew: boolean = false
): Paragraph {
  return new Paragraph({
    numbering: { reference: 'bullet-list', level: 0 },
    children: [
      createHighlightedTextRun(text, { isNew })
    ],
    spacing: { after: 80 },
  });
}

// Helper to truncate text for table display
function truncateText(text: string, maxLength: number): string {
  if (!text) return 'Not set';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Create comparison table for current vs optimized meta elements
function createComparisonTable(
  crawledData: AnalysisResult['crawledData'],
  optimizedContent: AnalysisResult['optimizedContent']
): Table {
  const headerShading = { type: ShadingType.CLEAR, fill: '1E40AF' }; // Dark blue header
  const labelShading = { type: ShadingType.CLEAR, fill: 'F9CB9C' }; // Orange/peach for labels
  const tableBorder = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: 'CCCCCC',
  };
  const cellBorders = {
    top: tableBorder,
    bottom: tableBorder,
    left: tableBorder,
    right: tableBorder,
  };

  // Helper to create header cell
  const createHeaderCell = (text: string): TableCell =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: true, size: FONT_SIZES.SMALL, color: 'FFFFFF', font: FONT })],
          alignment: AlignmentType.CENTER,
        }),
      ],
      shading: headerShading,
      borders: cellBorders,
      verticalAlign: VerticalAlign.CENTER,
    });

  // Helper to create label cell (left column)
  const createLabelCell = (text: string): TableCell =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: true, size: FONT_SIZES.SMALL, font: FONT })],
        }),
      ],
      shading: labelShading,
      borders: cellBorders,
      verticalAlign: VerticalAlign.CENTER,
      width: { size: 1800, type: WidthType.DXA },
    });

  // Helper to create content cell
  const createContentCell = (text: string, width?: number): TableCell =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text, size: FONT_SIZES.CODE, font: FONT })],
        }),
      ],
      borders: cellBorders,
      verticalAlign: VerticalAlign.CENTER,
      width: width ? { size: width, type: WidthType.DXA } : undefined,
    });

  // Helper to create optimized cell with green highlight
  const createOptimizedCell = (text: string, width?: number): TableCell =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({
            text,
            size: FONT_SIZES.CODE,
            font: FONT,
            shading: { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR },
          })],
        }),
      ],
      borders: cellBorders,
      verticalAlign: VerticalAlign.CENTER,
      width: width ? { size: width, type: WidthType.DXA } : undefined,
    });

  // Helper to create "why changed" cell with italic explanation
  const createWhyCell = (text: string): TableCell =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text, size: 16, italics: true, color: '4B5563', font: FONT })],
        }),
      ],
      borders: cellBorders,
      verticalAlign: VerticalAlign.CENTER,
      width: { size: 2400, type: WidthType.DXA },
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      // Header row
      new TableRow({
        children: [
          createHeaderCell('Element'),
          createHeaderCell('Current'),
          createHeaderCell('Optimized'),
          createHeaderCell('Why Changed'),
        ],
      }),
      // Title Tag row
      new TableRow({
        children: [
          createLabelCell('Title Tag'),
          createContentCell(truncateText(crawledData.title, 50)),
          createOptimizedCell(truncateText(optimizedContent.metaTitle, 50)),
          createWhyCell('Primary keyword in first 30 chars, optimal length'),
        ],
      }),
      // Meta Description row
      new TableRow({
        children: [
          createLabelCell('Meta Description'),
          createContentCell(truncateText(crawledData.metaDescription, 60)),
          createOptimizedCell(truncateText(optimizedContent.metaDescription, 60)),
          createWhyCell('Added CTA, included target keyword, compelling copy'),
        ],
      }),
      // H1 row - strip markers for clean display
      new TableRow({
        children: [
          createLabelCell('H1'),
          createContentCell(crawledData.h1[0] || 'Not set'),
          createOptimizedCell(cleanMarkersForDisplay(optimizedContent.h1)),
          createWhyCell('Differentiated from title, natural keyword placement'),
        ],
      }),
    ],
  });
}

export async function generateDocument(options: DocGeneratorOptions): Promise<Buffer> {
  console.log('[doc-generator] Starting document generation...');

  // Reset H1 tracking for each new document
  resetH1Tracking();

  const { analysisResult, settings, clientName, pageName } = options;
  const { crawledData, optimizedContent, keywords } = analysisResult;
  console.log('[doc-generator] Content length:', optimizedContent?.fullContent?.length || 0);

  const doc = new Document({
    numbering: numberingConfig,
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: FONT_SIZES.BODY,
          },
        },
      },
      paragraphStyles: [
        {
          id: 'Title',
          name: 'Title',
          basedOn: 'Normal',
          next: 'Normal',
          run: {
            size: FONT_SIZES.TITLE,
            bold: true,
            font: FONT,
            color: COLORS.TEXT,
          },
          paragraph: {
            spacing: { after: 120 },
            alignment: AlignmentType.LEFT,
          },
        },
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: FONT_SIZES.HEADING1,
            bold: true,
            font: FONT,
            color: COLORS.PRIMARY,
          },
          paragraph: {
            spacing: { before: 360, after: 200 },
            outlineLevel: 0,
          },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: FONT_SIZES.HEADING2,
            bold: true,
            font: FONT,
            color: COLORS.SECONDARY,
          },
          paragraph: {
            spacing: { before: 280, after: 160 },
            outlineLevel: 1,
          },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            size: FONT_SIZES.HEADING3,
            bold: true,
            font: FONT,
            color: COLORS.TERTIARY,
          },
          paragraph: {
            spacing: { before: 240, after: 120 },
            outlineLevel: 2,
          },
        },
        {
          id: 'Normal',
          name: 'Normal',
          run: {
            font: FONT,
            size: FONT_SIZES.BODY,
          },
          paragraph: {
            spacing: { after: 160, line: 276 },  // 1.15 line spacing
          },
        },
        {
          id: 'URL',
          name: 'URL',
          basedOn: 'Normal',
          run: {
            font: FONT,
            size: FONT_SIZES.SMALL,
            color: COLORS.LINK,
            italics: true,
          },
          paragraph: {
            spacing: { after: 300 },
          },
        },
        {
          id: 'CodeBlock',
          name: 'Code Block',
          basedOn: 'Normal',
          run: {
            font: 'Consolas',
            size: FONT_SIZES.CODE,
            color: COLORS.TEXT_LIGHT,
          },
          paragraph: {
            spacing: { before: 0, after: 0, line: 240 },
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children: [
          // Document Title
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [
              new TextRun({
                text: `${clientName} - ${pageName} | Content Improvement`,
                font: FONT,
                size: FONT_SIZES.TITLE,
                bold: true,
              }),
            ],
            spacing: { after: 120 },
          }),

          // Target URL (right below title)
          new Paragraph({
            style: 'URL',
            children: [
              new TextRun({
                text: 'Target Page: ',
                font: FONT,
                size: FONT_SIZES.SMALL,
                bold: true,
                color: COLORS.TEXT_LIGHT,
              }),
              new ExternalHyperlink({
                children: [
                  new TextRun({
                    text: crawledData.url,
                    font: FONT,
                    size: FONT_SIZES.SMALL,
                    color: COLORS.LINK,
                    underline: {},
                  }),
                ],
                link: crawledData.url,
              }),
            ],
            spacing: { after: 300 },
          }),

          // Legend for green highlighting
          new Paragraph({
            spacing: { before: 200, after: 300 },
            shading: { fill: 'F0FDF4', type: ShadingType.CLEAR },  // Very light green background
            border: {
              left: { style: BorderStyle.SINGLE, size: 24, color: COLORS.GREEN_BORDER },
            },
            indent: { left: 200, right: 200 },
            children: [
              new TextRun({
                text: '📝 Reading Guide: ',
                font: FONT,
                size: 22,
                bold: true,
              }),
              new TextRun({
                text: 'Words highlighted in ',
                font: FONT,
                size: 22,
              }),
              new TextRun({
                text: 'green',
                font: FONT,
                size: 22,
                bold: true,
                shading: { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR },
              }),
              new TextRun({
                text: ' are keyword insertions or small adjustments. The rest of the content remains unchanged from the original page.',
                font: FONT,
                size: 22,
              }),
            ],
          }),

          // Section Header - Comparison Table
          new Paragraph({
            children: [
              new TextRun({
                text: 'Current vs Optimized Meta Elements',
                bold: true,
                size: FONT_SIZES.HEADING2,
                font: FONT,
                color: COLORS.SECONDARY,
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 },
          }),

          // Comparison Table
          createComparisonTable(crawledData, optimizedContent),

          // Optimized Content Section Header
          new Paragraph({
            children: [
              new TextRun({
                text: 'OPTIMIZED CONTENT',
                bold: true,
                size: FONT_SIZES.HEADING2,
                font: FONT,
                color: COLORS.LINK,
              }),
            ],
            spacing: { before: 400, after: 200 },
          }),

          // H1 as main heading - parse [[KEYWORD:]] markers inline for green highlighting
          // IMPORTANT: Register this H1 to prevent duplicates in fullContent
          ...(() => {
            // Track this H1 so it won't be duplicated if it appears in fullContent
            isDuplicateH1(optimizedContent.h1);
            return [new Paragraph({
              children: parseKeywordMarkersToTextRuns(optimizedContent.h1, {
                bold: true,
                size: FONT_SIZES.HEADING1,
                color: COLORS.PRIMARY,
              }),
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 100, after: 200 },
            })];
          })(),

          // Full Content (with green highlighting for new content)
          ...parseContentToParagraphs(optimizedContent.fullContent, crawledData.bodyContent),

          // FAQs Section (if any) - with green highlight since these are new
          ...(optimizedContent.faqs.length > 0
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'Frequently Asked Questions',
                      bold: true,
                      size: FONT_SIZES.HEADING2,
                      font: FONT,
                      color: COLORS.SECONDARY,
                      shading: { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR },
                    }),
                  ],
                  heading: HeadingLevel.HEADING_2,
                  spacing: { before: 300, after: 200 },
                }),
                ...generateFAQParagraphs(optimizedContent.faqs, true),  // true = highlight as new
              ]
            : []),

          // Schema Recommendations (if any) - with green highlight since these are new
          ...(settings.includeSchemaRecommendations && optimizedContent.schemaRecommendations.length > 0
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'Schema Markup Recommendations',
                      bold: true,
                      size: FONT_SIZES.HEADING2,
                      font: FONT,
                      color: COLORS.SECONDARY,
                      shading: { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR },
                    }),
                  ],
                  heading: HeadingLevel.HEADING_2,
                  spacing: { before: 300, after: 200 },
                }),
                ...generateSchemaParagraphs(optimizedContent.schemaRecommendations),
              ]
            : []),

          // Spacer before table
          new Paragraph({
            spacing: { before: 400, after: 200 },
          }),

          // Metadata Table
          createMetadataTable(crawledData, optimizedContent, keywords, settings),
        ],
      },
    ],
  });

  console.log('[doc-generator] Document structure created, starting Packer.toBuffer...');
  const buffer = await Packer.toBuffer(doc);
  console.log('[doc-generator] Buffer created, size:', buffer.length);
  return Buffer.from(buffer);
}

// Type for inline elements that can be TextRun or ExternalHyperlink
type InlineElement = TextRun | ExternalHyperlink;

/**
 * Comprehensive content cleaning for Word document output
 * Strips ALL markdown/HTML artifacts that shouldn't appear in final document
 */
function cleanContentForDocument(text: string): string {
  let cleaned = text;

  // 1. Remove escaped markdown characters
  cleaned = cleaned
    .replace(/\\\*/g, '*')      // \* -> *
    .replace(/\\\[/g, '[')      // \[ -> [
    .replace(/\\\]/g, ']')      // \] -> ]
    .replace(/\\\(/g, '(')      // \( -> (
    .replace(/\\\)/g, ')')      // \) -> )
    .replace(/\\"/g, '"')       // \" -> "
    .replace(/\\_/g, '_')       // \_ -> _
    .replace(/\\#/g, '#')       // \# -> #
    .replace(/\\>/g, '>')       // \> -> >
    .replace(/\\-/g, '-')       // \- -> -
    .replace(/\\`/g, '`');      // \` -> `

  // 2. Convert markdown links to plain text: [text](url) -> text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 3. Remove bold/italic markdown: **text** or *text* -> text
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');  // **bold**
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');       // *italic*
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');       // __bold__
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');         // _italic_

  // 4. Remove inline code: `code` -> code
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 5. Remove HTML tags that might slip through
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // 6. Remove markdown heading prefixes that weren't properly parsed
  // Only remove if at start of line (after processing)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // 7. Remove markdown horizontal rules
  cleaned = cleaned.replace(/^[-*_]{3,}$/gm, '');

  // 8. Remove markdown blockquote prefix
  cleaned = cleaned.replace(/^>\s*/gm, '');

  // 9. Clean up multiple spaces and normalize whitespace
  cleaned = cleaned.replace(/  +/g, ' ');

  // 10. Clean up multiple newlines (keep max 2)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Clean up escaped markdown and normalize text (legacy function for compatibility)
 */
function cleanMarkdownEscapes(text: string): string {
  return cleanContentForDocument(text);
}

/**
 * Parse inline markdown formatting (bold, italic, links) into docx elements
 */
function parseInlineFormatting(text: string): InlineElement[] {
  const elements: InlineElement[] = [];

  // Clean escaped markdown first
  let cleanedText = cleanMarkdownEscapes(text);

  // Combined regex to match: **bold**, *italic*, [link](url), or plain text
  // Order matters: **bold** before *italic* to handle properly
  const inlinePattern = /(\*\*(.+?)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\))/g;

  let lastIndex = 0;
  let match;

  while ((match = inlinePattern.exec(cleanedText)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      const plainText = cleanedText.substring(lastIndex, match.index);
      if (plainText) {
        elements.push(
          new TextRun({
            text: plainText,
            size: FONT_SIZES.BODY,
            font: FONT,
          })
        );
      }
    }

    const fullMatch = match[0];

    // Bold: **text**
    if (fullMatch.startsWith('**') && fullMatch.endsWith('**')) {
      const boldContent = match[2];
      // Check if bold content contains a link
      const linkInBold = boldContent.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkInBold) {
        // Bold link
        elements.push(
          new ExternalHyperlink({
            children: [
              new TextRun({
                text: linkInBold[1],
                bold: true,
                size: FONT_SIZES.BODY,
                font: FONT,
                color: COLORS.LINK,
                underline: { type: 'single' },
              }),
            ],
            link: linkInBold[2],
          })
        );
      } else {
        elements.push(
          new TextRun({
            text: boldContent,
            bold: true,
            size: FONT_SIZES.BODY,
            font: FONT,
          })
        );
      }
    }
    // Italic: *text* (but not **)
    else if (fullMatch.startsWith('*') && !fullMatch.startsWith('**') && fullMatch.endsWith('*')) {
      elements.push(
        new TextRun({
          text: match[3],
          italics: true,
          size: FONT_SIZES.BODY,
          font: FONT,
        })
      );
    }
    // Link: [text](url)
    else if (fullMatch.startsWith('[')) {
      const linkText = match[4];
      const linkUrl = match[5];
      elements.push(
        new ExternalHyperlink({
          children: [
            new TextRun({
              text: linkText,
              size: FONT_SIZES.BODY,
              font: FONT,
              color: COLORS.LINK,
              underline: { type: 'single' },
            }),
          ],
          link: linkUrl,
        })
      );
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining plain text after last match
  if (lastIndex < cleanedText.length) {
    const remainingText = cleanedText.substring(lastIndex);
    if (remainingText) {
      elements.push(
        new TextRun({
          text: remainingText,
          size: FONT_SIZES.BODY,
          font: FONT,
        })
      );
    }
  }

  // If no matches found, return the whole text as a single TextRun
  if (elements.length === 0) {
    elements.push(
      new TextRun({
        text: cleanedText,
        size: FONT_SIZES.BODY,
        font: FONT,
      })
    );
  }

  return elements;
}

/**
 * Parse inline markdown formatting with optional green highlighting for new content
 */
function parseInlineFormattingWithHighlight(text: string, isNew: boolean = false): InlineElement[] {
  const elements: InlineElement[] = [];

  // Clean escaped markdown first
  let cleanedText = cleanMarkdownEscapes(text);

  // Combined regex to match: **bold**, *italic*, [link](url), or plain text
  const inlinePattern = /(\*\*(.+?)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\))/g;

  let lastIndex = 0;
  let match;

  while ((match = inlinePattern.exec(cleanedText)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      const plainText = cleanedText.substring(lastIndex, match.index);
      if (plainText) {
        elements.push(
          new TextRun({
            text: plainText,
            size: FONT_SIZES.BODY,
            font: FONT,
            shading: isNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
          })
        );
      }
    }

    const fullMatch = match[0];

    // Bold: **text**
    if (fullMatch.startsWith('**') && fullMatch.endsWith('**')) {
      const boldContent = match[2];
      const linkInBold = boldContent.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkInBold) {
        elements.push(
          new ExternalHyperlink({
            children: [
              new TextRun({
                text: linkInBold[1],
                bold: true,
                size: FONT_SIZES.BODY,
                font: FONT,
                color: COLORS.LINK,
                underline: { type: 'single' },
                shading: isNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
              }),
            ],
            link: linkInBold[2],
          })
        );
      } else {
        elements.push(
          new TextRun({
            text: boldContent,
            bold: true,
            size: FONT_SIZES.BODY,
            font: FONT,
            shading: isNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
          })
        );
      }
    }
    // Italic: *text*
    else if (fullMatch.startsWith('*') && !fullMatch.startsWith('**') && fullMatch.endsWith('*')) {
      elements.push(
        new TextRun({
          text: match[3],
          italics: true,
          size: FONT_SIZES.BODY,
          font: FONT,
          shading: isNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
        })
      );
    }
    // Link: [text](url)
    else if (fullMatch.startsWith('[')) {
      const linkText = match[4];
      const linkUrl = match[5];
      elements.push(
        new ExternalHyperlink({
          children: [
            new TextRun({
              text: linkText,
              size: FONT_SIZES.BODY,
              font: FONT,
              color: COLORS.LINK,
              underline: { type: 'single' },
              shading: isNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
            }),
          ],
          link: linkUrl,
        })
      );
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining plain text after last match
  if (lastIndex < cleanedText.length) {
    const remainingText = cleanedText.substring(lastIndex);
    if (remainingText) {
      elements.push(
        new TextRun({
          text: remainingText,
          size: FONT_SIZES.BODY,
          font: FONT,
          shading: isNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
        })
      );
    }
  }

  // If no matches found, return the whole text as a single TextRun
  if (elements.length === 0) {
    elements.push(
      new TextRun({
        text: cleanedText,
        size: FONT_SIZES.BODY,
        font: FONT,
        shading: isNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
      })
    );
  }

  return elements;
}

/**
 * Parse structured content with [H1], [H2], [H3], [PARA], [BULLET] markers
 * Also handles legacy markdown format for backwards compatibility
 * The AI marks changes with [[KEYWORD: term]], [[ADJUSTED: old → new]], [[NEW]]
 *
 * IMPORTANT: This function now processes [[KEYWORD:]] markers INLINE to create
 * green highlighted text, rather than stripping them first.
 */
function parseContentToParagraphs(content: string, originalContent?: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // First filter out footer content
  let processedContent = filterFooterContent(content);

  // Clean residual markdown/HTML but KEEP the [[KEYWORD:]] markers
  // We only clean markdown/HTML, not our custom markers
  processedContent = processedContent
    // Remove escaped markdown characters
    .replace(/\\\*/g, '*')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    // Remove markdown image syntax: ![alt](url) or ![alt]
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')      // ![alt](url)
    .replace(/!\[[^\]]*\]/g, '')                  // ![alt]
    .replace(/^!([A-Za-z][A-Za-z0-9 ]*)/gm, '')   // !AltText at start of line
    // Remove markdown links: [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove orphan brackets (but not our [[KEYWORD:]] markers)
    .replace(/(?<!\[)\[(?!\[)([^\]]*)\](?!\])/g, '$1')  // Single [text] but not [[
    // Remove bold/italic markdown
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Remove "Get a Quote" button text that might be captured
    .replace(/^Get a Quote$/gm, '');

  // CRITICAL: Split structured markers onto their own lines if AI didn't add newlines
  // This handles cases where AI outputs: "[H1] Title [PARA] Content [H2] Heading"
  // and converts it to separate lines
  processedContent = processedContent
    .replace(/\s*\[H1\]/g, '\n[H1]')
    .replace(/\s*\[H2\]/g, '\n[H2]')
    .replace(/\s*\[H3\]/g, '\n[H3]')
    .replace(/\s*\[PARA\]/g, '\n[PARA]')
    .replace(/\s*\[BULLET\]/g, '\n[BULLET]')
    .trim();

  console.log('[doc-generator] Processing content with inline marker parsing');

  // Split by lines for processing - keep the [[KEYWORD:]] markers intact
  const lines = processedContent.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      // Add spacing paragraph for empty lines
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    // NEW STRUCTURED FORMAT: [H1] Heading
    if (trimmedLine.startsWith('[H1]')) {
      const headingText = trimmedLine.replace('[H1]', '').trim();
      // Check for duplicate H1 using module-level tracking
      if (isDuplicateH1(headingText)) {
        continue; // Skip duplicate H1
      }

      paragraphs.push(
        new Paragraph({
          children: createTextRunsWithHighlighting(headingText, [], {
            bold: true,
            size: FONT_SIZES.HEADING1,
            color: COLORS.PRIMARY,
          }),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );
      continue;
    }

    // NEW STRUCTURED FORMAT: [H2] Subheading
    if (trimmedLine.startsWith('[H2]')) {
      const headingText = trimmedLine.replace('[H2]', '').trim();
      paragraphs.push(
        new Paragraph({
          children: createTextRunsWithHighlighting(headingText, [], {
            bold: true,
            size: FONT_SIZES.HEADING2,
            color: COLORS.SECONDARY,
          }),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        })
      );
      continue;
    }

    // NEW STRUCTURED FORMAT: [H3] Sub-subheading
    if (trimmedLine.startsWith('[H3]')) {
      const headingText = trimmedLine.replace('[H3]', '').trim();
      paragraphs.push(
        new Paragraph({
          children: createTextRunsWithHighlighting(headingText, [], {
            bold: true,
            size: FONT_SIZES.HEADING3,
            color: COLORS.TERTIARY,
          }),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        })
      );
      continue;
    }

    // NEW STRUCTURED FORMAT: [PARA] Paragraph text
    if (trimmedLine.startsWith('[PARA]')) {
      const paraText = trimmedLine.replace('[PARA]', '').trim();
      paragraphs.push(
        new Paragraph({
          children: createTextRunsWithHighlighting(paraText, []),
          spacing: { after: 200 },
        })
      );
      continue;
    }

    // NEW STRUCTURED FORMAT: [BULLET] Bullet point
    if (trimmedLine.startsWith('[BULLET]')) {
      const bulletContent = trimmedLine.replace('[BULLET]', '').trim();
      paragraphs.push(
        new Paragraph({
          numbering: { reference: 'bullet-list', level: 0 },
          children: createTextRunsWithHighlighting(bulletContent, []),
          spacing: { after: 80 },
        })
      );
      continue;
    }

    // LEGACY FORMAT: # H1 heading (markdown)
    if (trimmedLine.startsWith('# ') && !trimmedLine.startsWith('## ')) {
      const headingText = trimmedLine.replace('# ', '');
      // Check for duplicate H1 using module-level tracking
      if (isDuplicateH1(headingText)) {
        continue; // Skip duplicate H1
      }

      paragraphs.push(
        new Paragraph({
          children: createTextRunsWithHighlighting(headingText, [], {
            bold: true,
            size: FONT_SIZES.HEADING1,
            color: COLORS.PRIMARY,
          }),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );
      continue;
    }

    // LEGACY FORMAT: ## H2 heading (markdown)
    if (trimmedLine.startsWith('## ') && !trimmedLine.startsWith('### ')) {
      const headingText = trimmedLine.replace('## ', '');
      paragraphs.push(
        new Paragraph({
          children: createTextRunsWithHighlighting(headingText, [], {
            bold: true,
            size: FONT_SIZES.HEADING2,
            color: COLORS.SECONDARY,
          }),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        })
      );
      continue;
    }

    // LEGACY FORMAT: ### H3 heading (markdown)
    if (trimmedLine.startsWith('### ')) {
      const headingText = trimmedLine.replace('### ', '');
      paragraphs.push(
        new Paragraph({
          children: createTextRunsWithHighlighting(headingText, [], {
            bold: true,
            size: FONT_SIZES.HEADING3,
            color: COLORS.TERTIARY,
          }),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        })
      );
      continue;
    }

    // LEGACY FORMAT: Bullet point (- or *)
    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      const bulletContent = trimmedLine.substring(2);
      paragraphs.push(
        new Paragraph({
          numbering: { reference: 'bullet-list', level: 0 },
          children: createTextRunsWithHighlighting(bulletContent, []),
          spacing: { after: 80 },
        })
      );
      continue;
    }

    // LEGACY FORMAT: Numbered list
    const numberMatch = trimmedLine.match(/^(\d+)\.\s(.+)/);
    if (numberMatch) {
      paragraphs.push(
        new Paragraph({
          numbering: { reference: 'numbered-list', level: 0 },
          children: createTextRunsWithHighlighting(numberMatch[2], []),
          spacing: { after: 80 },
        })
      );
      continue;
    }

    // Regular paragraph (no marker - treat as paragraph)
    // This handles content that doesn't have any markers
    paragraphs.push(
      new Paragraph({
        children: createTextRunsWithHighlighting(trimmedLine, []),
        spacing: { after: 200 },
      })
    );
  }

  return paragraphs;
}

/**
 * Pre-process content to ensure proper spacing around [[KEYWORD:]] markers
 * This fixes cases where AI outputs markers without spaces:
 * - "years,[[KEYWORD: AIM Insurance]]has" → "years, [[KEYWORD: AIM Insurance]] has"
 * - "from[[KEYWORD: AIM]]today" → "from [[KEYWORD: AIM]] today"
 *
 * CRITICAL: This function must be called BEFORE parsing the markers!
 */
function ensureSpacesAroundMarkers(content: string): string {
  let result = content;

  // STEP 1: Add space BEFORE [[ marker
  // Match any word character or comma before [[
  result = result.replace(/(\w)(\[\[)/g, '$1 $2');
  result = result.replace(/,(\[\[)/g, ', $1');
  result = result.replace(/\.(\[\[)/g, '. $1');
  result = result.replace(/:(\[\[)/g, ': $1');
  result = result.replace(/;(\[\[)/g, '; $1');
  result = result.replace(/\)(\[\[)/g, ') $1');

  // STEP 2: Add space AFTER ]] marker
  // Match ]] followed by any word character
  result = result.replace(/(\]\])(\w)/g, '$1 $2');
  // Also handle ]] followed by opening parenthesis
  result = result.replace(/(\]\])(\()/g, '$1 $2');

  // STEP 3: Clean up any double spaces
  result = result.replace(/  +/g, ' ');

  // Debug: Log if any markers found without proper spacing
  const badPatternBefore = /\w\[\[/g;
  const badPatternAfter = /\]\]\w/g;
  if (badPatternBefore.test(result) || badPatternAfter.test(result)) {
    console.log('[doc-generator] WARNING: Some markers may still lack proper spacing');
  }

  return result;
}

/**
 * Parse [[KEYWORD: text]], [[ADJUSTED: old → new]], [[NEW]] markers inline
 * and convert them to TextRuns with green highlighting
 *
 * IMPORTANT: Pre-processes content to ensure proper spacing around markers
 */
function parseKeywordMarkersToTextRuns(
  content: string,
  baseStyle: { bold?: boolean; size?: number; color?: string } = {}
): TextRun[] {
  const runs: TextRun[] = [];

  // CRITICAL: Pre-process to ensure spaces around markers BEFORE parsing
  const processedContent = ensureSpacesAroundMarkers(content);

  // Regex to match all marker types:
  // [[KEYWORD: text]] - keyword insertion
  // [[ADJUSTED: old → new]] - adjusted text (show new part)
  // [[NEW]] - new content marker (standalone)
  const markerRegex = /\[\[(KEYWORD|ADJUSTED):\s*([^\]]*)\]\]|\[\[(NEW)\]\]/g;

  let lastIndex = 0;
  let match;

  while ((match = markerRegex.exec(processedContent)) !== null) {
    // Add text before the marker (not highlighted)
    if (match.index > lastIndex) {
      const beforeText = processedContent.substring(lastIndex, match.index);
      if (beforeText) {
        runs.push(new TextRun({
          text: cleanMarkdownEscapes(beforeText),
          font: FONT,
          size: baseStyle.size || FONT_SIZES.BODY,
          bold: baseStyle.bold,
          color: baseStyle.color,
        }));
      }
    }

    const markerType = match[1] || match[3]; // KEYWORD, ADJUSTED, or NEW
    const markerContent = match[2] || ''; // The text inside the marker

    if (markerType === 'KEYWORD' && markerContent) {
      // Highlighted keyword insertion
      runs.push(new TextRun({
        text: cleanMarkdownEscapes(markerContent.trim()),
        font: FONT,
        size: baseStyle.size || FONT_SIZES.BODY,
        bold: baseStyle.bold,
        color: baseStyle.color,
        shading: { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR },
      }));
    } else if (markerType === 'ADJUSTED' && markerContent) {
      // For adjusted text, show the new version highlighted
      // Format is "old → new", we want just the "new" part
      const parts = markerContent.split('→').map(s => s.trim());
      const newText = parts.length > 1 ? parts[1] : markerContent;
      runs.push(new TextRun({
        text: cleanMarkdownEscapes(newText),
        font: FONT,
        size: baseStyle.size || FONT_SIZES.BODY,
        bold: baseStyle.bold,
        color: baseStyle.color,
        shading: { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR },
      }));
    } else if (markerType === 'NEW') {
      // NEW marker - just a standalone marker, skip it (the content after is what's new)
      // Don't add anything - the [[NEW]] marker is informational
    }

    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text after the last marker
  if (lastIndex < processedContent.length) {
    const afterText = processedContent.substring(lastIndex);
    if (afterText) {
      runs.push(new TextRun({
        text: cleanMarkdownEscapes(afterText),
        font: FONT,
        size: baseStyle.size || FONT_SIZES.BODY,
        bold: baseStyle.bold,
        color: baseStyle.color,
      }));
    }
  }

  // If no markers found and no runs created, return the whole content as a single run
  if (runs.length === 0) {
    runs.push(new TextRun({
      text: cleanMarkdownEscapes(processedContent),
      font: FONT,
      size: baseStyle.size || FONT_SIZES.BODY,
      bold: baseStyle.bold,
      color: baseStyle.color,
    }));
  }

  return runs;
}

/**
 * Create TextRun array with inline highlighting for marked segments
 * Uses the new inline marker parsing for proper [[KEYWORD:]] handling
 */
function createTextRunsWithHighlighting(
  text: string,
  highlightSegments: string[],
  baseStyle: { bold?: boolean; size?: number; color?: string } = {}
): TextRun[] {
  // Use the new inline marker parser which handles [[KEYWORD:]], [[ADJUSTED:]], [[NEW]] properly
  return parseKeywordMarkersToTextRuns(text, baseStyle);
}

function generateFAQParagraphs(faqs: FAQ[], highlightAsNew: boolean = false): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  faqs.forEach((faq) => {
    // Question
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Q: ${faq.question}`,
            bold: true,
            size: FONT_SIZES.BODY,
            font: FONT,
            shading: highlightAsNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
          }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    // Answer
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `A: ${faq.answer}`,
            size: FONT_SIZES.BODY,
            font: FONT,
            shading: highlightAsNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
          }),
        ],
        spacing: { after: 150 },
        indent: { left: convertInchesToTwip(0.25) },
      })
    );
  });

  return paragraphs;
}

function generateSchemaParagraphs(recommendations: SchemaRecommendation[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  recommendations.forEach((rec) => {
    // Schema type
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: rec.type,
            bold: true,
            size: FONT_SIZES.BODY,
            font: FONT,
            shading: { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR },
          }),
        ],
        spacing: { before: 200, after: 50 },
      })
    );

    // Reason
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: rec.reason,
            size: 22,
            font: FONT,
            italics: true,
          }),
        ],
        spacing: { after: 100 },
      })
    );

    // JSON-LD code - format with proper indentation
    // Parse and re-stringify to ensure proper formatting
    let formattedJson = rec.jsonLd;
    try {
      const parsed = JSON.parse(rec.jsonLd);
      formattedJson = JSON.stringify(parsed, null, 2);
    } catch {
      // If parsing fails, use original
    }

    // Split JSON into lines and create separate paragraphs for each line
    // Use tight spacing (line: 240) so it looks like a cohesive code block
    const jsonLines = formattedJson.split('\n');
    jsonLines.forEach((line, index) => {
      paragraphs.push(
        new Paragraph({
          style: 'CodeBlock',
          children: [
            new TextRun({
              text: line || ' ', // Use space for empty lines to maintain shading
              font: 'Consolas',
              size: 18,
            }),
          ],
          shading: {
            type: ShadingType.CLEAR,
            fill: 'F3F4F6',
          },
          spacing: {
            before: index === 0 ? 100 : 0,
            after: index === jsonLines.length - 1 ? 200 : 0,
            line: 240, // Tight line spacing for cohesive code block
          },
        })
      );
    });
  });

  return paragraphs;
}

function createMetadataTable(
  crawledData: AnalysisResult['crawledData'],
  optimizedContent: AnalysisResult['optimizedContent'],
  keywords: AnalysisResult['keywords'],
  settings: Settings
): Table {
  // Orange/peach shading for left column as per requirements
  const headerShading = { type: ShadingType.CLEAR, fill: 'f9cb9c' };
  const tableBorder = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: 'CCCCCC',
  };
  const cellBorders = {
    top: tableBorder,
    bottom: tableBorder,
    left: tableBorder,
    right: tableBorder,
  };

  // Column widths in DXA: left ~30% (2800), right ~70% (6560)
  const leftColWidth = { size: 2800, type: WidthType.DXA };
  const rightColWidth = { size: 6560, type: WidthType.DXA };

  // Filter and limit keywords to 5 most relevant for this page
  const filteredKeywords = filterAndLimitKeywords(
    keywords,
    crawledData.url,
    crawledData.title
  );

  // Format filtered keywords with volume for display
  const keywordText = formatKeywordsForDocument(filteredKeywords);

  const rows: TableRow[] = [
    // Target Keywords
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'Target Keyword(s)', bold: true, size: 22, font: FONT }),
              ],
            }),
          ],
          width: leftColWidth,
          shading: headerShading,
          borders: cellBorders,
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: keywordText, size: 22, font: FONT }),
              ],
            }),
          ],
          width: rightColWidth,
          borders: cellBorders,
        }),
      ],
    }),

    // Target Page URL
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'Target Page URL', bold: true, size: 22, font: FONT }),
              ],
            }),
          ],
          width: leftColWidth,
          shading: headerShading,
          borders: cellBorders,
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: crawledData.url, size: 22, font: FONT, color: COLORS.LINK }),
              ],
            }),
          ],
          width: rightColWidth,
          borders: cellBorders,
        }),
      ],
    }),

    // Updated Title Tag
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'Updated Title Tag', bold: true, size: 22, font: FONT }),
              ],
            }),
          ],
          width: leftColWidth,
          shading: headerShading,
          borders: cellBorders,
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: `${optimizedContent.metaTitle} (${optimizedContent.metaTitle.length} chars)`,
                  size: 22,
                  font: FONT,
                  shading: { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR },
                }),
              ],
            }),
          ],
          width: rightColWidth,
          borders: cellBorders,
        }),
      ],
    }),

    // Updated Meta Description
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'Updated Meta Description', bold: true, size: 22, font: FONT }),
              ],
            }),
          ],
          width: leftColWidth,
          shading: headerShading,
          borders: cellBorders,
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: `${optimizedContent.metaDescription} (${optimizedContent.metaDescription.length} chars)`,
                  size: 22,
                  font: FONT,
                  shading: { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR },
                }),
              ],
            }),
          ],
          width: rightColWidth,
          borders: cellBorders,
        }),
      ],
    }),

    // Current H1
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'Current H1', bold: true, size: 22, font: FONT }),
              ],
            }),
          ],
          width: leftColWidth,
          shading: headerShading,
          borders: cellBorders,
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: crawledData.h1[0] || 'No H1 found',
                  size: 22,
                  font: FONT,
                  italics: !crawledData.h1[0],
                }),
              ],
            }),
          ],
          width: rightColWidth,
          borders: cellBorders,
        }),
      ],
    }),

    // New H1 - strip any [[KEYWORD:]] markers for clean display
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: 'New H1', bold: true, size: 22, font: FONT }),
              ],
            }),
          ],
          width: leftColWidth,
          shading: headerShading,
          borders: cellBorders,
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: cleanMarkersForDisplay(optimizedContent.h1),
                  size: 22,
                  font: FONT,
                  shading: { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR },
                }),
              ],
            }),
          ],
          width: rightColWidth,
          borders: cellBorders,
        }),
      ],
    }),
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}
