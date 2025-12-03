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
      // H1 row
      new TableRow({
        children: [
          createLabelCell('H1'),
          createContentCell(crawledData.h1[0] || 'Not set'),
          createOptimizedCell(optimizedContent.h1),
          createWhyCell('Differentiated from title, natural keyword placement'),
        ],
      }),
    ],
  });
}

export async function generateDocument(options: DocGeneratorOptions): Promise<Buffer> {
  console.log('[doc-generator] Starting document generation...');
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
                text: 'Content highlighted in ',
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
                text: ' indicates new or significantly changed content from the original page.',
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

          // H1 as main heading (with green highlight since it's optimized)
          new Paragraph({
            children: [
              new TextRun({
                text: optimizedContent.h1,
                bold: true,
                size: FONT_SIZES.HEADING1,
                font: FONT,
                color: COLORS.PRIMARY,
                shading: { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR },
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 100, after: 200 },
          }),

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
 * Clean up escaped markdown and normalize text
 */
function cleanMarkdownEscapes(text: string): string {
  return text
    .replace(/\\\*/g, '*')      // \* -> *
    .replace(/\\\[/g, '[')      // \[ -> [
    .replace(/\\\]/g, ']')      // \] -> ]
    .replace(/\\\(/g, '(')      // \( -> (
    .replace(/\\\)/g, ')')      // \) -> )
    .replace(/\\"/g, '"')       // \" -> "
    .replace(/\\_/g, '_');      // \_ -> _
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

// Helper to check if content is new/changed compared to original
function isContentNew(text: string, originalContent: string): boolean {
  if (!originalContent) return true;

  const originalLower = originalContent.toLowerCase();
  const textLower = text.toLowerCase().trim();

  // Check first 50 characters as a key phrase
  const keyPhrase = textLower.slice(0, 50);

  // If the key phrase exists in original, it's not new
  if (originalLower.includes(keyPhrase)) return false;

  // Check for first 5 words match
  const firstWords = textLower.split(' ').slice(0, 5).join(' ');
  if (originalLower.includes(firstWords)) return false;

  return true;
}

function parseContentToParagraphs(content: string, originalContent?: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = content.split('\n');
  const original = originalContent || '';

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    // H1 heading (#)
    if (trimmedLine.startsWith('# ') && !trimmedLine.startsWith('## ')) {
      const headingText = trimmedLine.replace('# ', '');
      const isNew = isContentNew(headingText, original);
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: cleanMarkdownEscapes(headingText),
              bold: true,
              size: FONT_SIZES.HEADING1,
              font: FONT,
              color: COLORS.PRIMARY,
              shading: isNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );
      continue;
    }

    // H2 heading (##)
    if (trimmedLine.startsWith('## ') && !trimmedLine.startsWith('### ')) {
      const headingText = trimmedLine.replace('## ', '');
      const isNew = isContentNew(headingText, original);
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: cleanMarkdownEscapes(headingText),
              bold: true,
              size: FONT_SIZES.HEADING2,
              font: FONT,
              color: COLORS.SECONDARY,
              shading: isNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        })
      );
      continue;
    }

    // H3 heading (###)
    if (trimmedLine.startsWith('### ')) {
      const headingText = trimmedLine.replace('### ', '');
      const isNew = isContentNew(headingText, original);
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: cleanMarkdownEscapes(headingText),
              bold: true,
              size: FONT_SIZES.HEADING3,
              font: FONT,
              color: COLORS.TERTIARY,
              shading: isNew ? { fill: COLORS.GREEN_HIGHLIGHT, type: ShadingType.CLEAR } : undefined,
            }),
          ],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        })
      );
      continue;
    }

    // Bullet point - use Word's native numbering with inline formatting
    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      const bulletContent = trimmedLine.substring(2);
      const isNew = isContentNew(bulletContent, original);
      paragraphs.push(
        new Paragraph({
          numbering: { reference: 'bullet-list', level: 0 },
          children: parseInlineFormattingWithHighlight(bulletContent, isNew),
          spacing: { after: 80 },
        })
      );
      continue;
    }

    // Numbered list - use Word's native numbering with inline formatting
    const numberMatch = trimmedLine.match(/^(\d+)\.\s(.+)/);
    if (numberMatch) {
      const isNew = isContentNew(numberMatch[2], original);
      paragraphs.push(
        new Paragraph({
          numbering: { reference: 'numbered-list', level: 0 },
          children: parseInlineFormattingWithHighlight(numberMatch[2], isNew),
          spacing: { after: 80 },
        })
      );
      continue;
    }

    // Regular paragraph with inline formatting
    const isNew = isContentNew(trimmedLine, original);
    paragraphs.push(
      new Paragraph({
        children: parseInlineFormattingWithHighlight(trimmedLine, isNew),
        spacing: { after: 150 },
      })
    );
  }

  return paragraphs;
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

  // Format keywords for the table
  const keywordText = [
    ...keywords.primary,
    ...keywords.secondary,
  ].join('\n');

  const nlpText = keywords.nlpTerms.length > 0
    ? '\n\nNLP:\n' + keywords.nlpTerms.slice(0, 10).join('\n')
    : '';

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
                new TextRun({ text: keywordText + nlpText, size: 22, font: FONT }),
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

    // New H1
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
                  text: optimizedContent.h1,
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
