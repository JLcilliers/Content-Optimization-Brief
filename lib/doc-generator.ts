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

// Change types for annotations
const ChangeTypes = {
  NEW_SECTION: 'New Section Added',
  RESTRUCTURED: 'Content Restructured',
  KEYWORD_ADDED: 'Keyword Integration',
  HEADING_OPTIMIZED: 'Heading Optimized',
  CTA_ADDED: 'Call-to-Action Added',
  READABILITY: 'Readability Improved',
  SEO_ENHANCED: 'SEO Enhancement',
  FAQ_ADDED: 'FAQ Added for Featured Snippets',
  SCHEMA_ADDED: 'Schema Markup Added',
  CONTENT_EXPANDED: 'Content Expanded',
  REMOVED: 'Content Removed',
  REWORDED: 'Reworded for Clarity',
} as const;

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
          },
        },
      ],
    },
  ],
};

// Helper to create a change annotation box (yellow callout)
function createChangeAnnotation(changeType: string, explanation: string): Paragraph {
  return new Paragraph({
    spacing: { before: 100, after: 100 },
    shading: { fill: 'FEF3C7', type: ShadingType.CLEAR }, // Light yellow background
    border: {
      left: { style: BorderStyle.SINGLE, size: 24, color: 'F59E0B' }, // Orange left border
    },
    indent: { left: 200, right: 200 },
    children: [
      new TextRun({ text: `\u270F\uFE0F ${changeType}: `, bold: true, size: 18, color: '92400E' }),
      new TextRun({ text: explanation, size: 18, color: '78350F', italics: true }),
    ],
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
          children: [new TextRun({ text, bold: true, size: 20, color: 'FFFFFF' })],
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
          children: [new TextRun({ text, bold: true, size: 20 })],
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
          children: [new TextRun({ text, size: 18 })],
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
          children: [new TextRun({ text, size: 16, italics: true, color: '4B5563' })],
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
          createContentCell(truncateText(optimizedContent.metaTitle, 50)),
          createWhyCell('Primary keyword in first 30 chars, optimal length'),
        ],
      }),
      // Meta Description row
      new TableRow({
        children: [
          createLabelCell('Meta Description'),
          createContentCell(truncateText(crawledData.metaDescription, 60)),
          createContentCell(truncateText(optimizedContent.metaDescription, 60)),
          createWhyCell('Added CTA, included target keyword, compelling copy'),
        ],
      }),
      // H1 row
      new TableRow({
        children: [
          createLabelCell('H1'),
          createContentCell(crawledData.h1[0] || 'Not set'),
          createContentCell(optimizedContent.h1),
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
            font: 'Arial',
            size: 24, // 12pt
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
            size: 56, // 28pt
            bold: true,
            font: 'Arial',
          },
          paragraph: {
            spacing: { after: 200 },
          },
        },
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          run: {
            size: 32, // 16pt
            bold: true,
            font: 'Arial',
            color: '1a1a1a',
          },
          paragraph: {
            spacing: { before: 240, after: 120 },
          },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          run: {
            size: 28, // 14pt
            bold: true,
            font: 'Arial',
            color: '333333',
          },
          paragraph: {
            spacing: { before: 200, after: 100 },
          },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          run: {
            size: 24, // 12pt
            bold: true,
            font: 'Arial',
            color: '444444',
          },
          paragraph: {
            spacing: { before: 160, after: 80 },
          },
        },
        {
          id: 'CodeBlock',
          name: 'Code Block',
          basedOn: 'Normal',
          run: {
            font: 'Consolas',
            size: 18,
            color: '374151',
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
          // Document Title - using HeadingLevel.TITLE for proper Word styling
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [
              new TextRun({
                text: `${clientName} - ${pageName} | Content Improvement`,
              }),
            ],
            spacing: { after: 400 },
          }),

          // Section Header - Comparison Table
          new Paragraph({
            children: [
              new TextRun({
                text: 'Current vs Optimized Meta Elements',
                bold: true,
                size: 28,
                font: 'Arial',
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
                size: 28,
                font: 'Arial',
                color: '2563EB',
              }),
            ],
            spacing: { before: 400, after: 100 },
          }),

          // Info box about annotations
          new Paragraph({
            shading: { fill: 'DBEAFE', type: ShadingType.CLEAR }, // Light blue background
            spacing: { before: 0, after: 200 },
            indent: { left: 200, right: 200 },
            children: [
              new TextRun({
                text: '\u2139\uFE0F The content below has been optimized for SEO. Yellow callout boxes explain what was changed and why.',
                italics: true,
                size: 20,
                color: '1E40AF',
              }),
            ],
          }),

          // Change annotation for H1
          createChangeAnnotation(
            ChangeTypes.HEADING_OPTIMIZED,
            `H1 optimized with primary keyword placement. Differentiated from title tag to avoid duplication.`
          ),

          // H1 as main heading
          new Paragraph({
            children: [
              new TextRun({
                text: optimizedContent.h1,
                bold: true,
                size: 32,
                font: 'Arial',
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 100, after: 200 },
          }),

          // General content optimization annotation
          createChangeAnnotation(
            ChangeTypes.SEO_ENHANCED,
            'Content restructured with target keywords naturally integrated throughout. Improved readability and value for readers.'
          ),

          // Full Content
          ...parseContentToParagraphs(optimizedContent.fullContent),

          // FAQs Section (if any)
          ...(optimizedContent.faqs.length > 0
            ? [
                // Annotation for FAQs
                createChangeAnnotation(
                  ChangeTypes.FAQ_ADDED,
                  'FAQs added to target featured snippets and "People Also Ask" results. These can be marked up with FAQPage schema.'
                ),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'Frequently Asked Questions',
                      bold: true,
                      size: 28,
                      font: 'Arial',
                    }),
                  ],
                  heading: HeadingLevel.HEADING_2,
                  spacing: { before: 200, after: 200 },
                }),
                ...generateFAQParagraphs(optimizedContent.faqs),
              ]
            : []),

          // Schema Recommendations (if any)
          ...(settings.includeSchemaRecommendations && optimizedContent.schemaRecommendations.length > 0
            ? [
                // Annotation for Schema
                createChangeAnnotation(
                  ChangeTypes.SCHEMA_ADDED,
                  'Schema markup recommendations to enable rich snippets in search results. Add these to your page\'s HTML.'
                ),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'Schema Markup Recommendations',
                      bold: true,
                      size: 28,
                      font: 'Arial',
                    }),
                  ],
                  heading: HeadingLevel.HEADING_2,
                  spacing: { before: 200, after: 200 },
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
            size: 24,
            font: 'Arial',
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
                size: 24,
                font: 'Arial',
                color: '2563EB',
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
            size: 24,
            font: 'Arial',
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
          size: 24,
          font: 'Arial',
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
              size: 24,
              font: 'Arial',
              color: '2563EB',
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
          size: 24,
          font: 'Arial',
        })
      );
    }
  }

  // If no matches found, return the whole text as a single TextRun
  if (elements.length === 0) {
    elements.push(
      new TextRun({
        text: cleanedText,
        size: 24,
        font: 'Arial',
      })
    );
  }

  return elements;
}

function parseContentToParagraphs(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    // H1 heading (#)
    if (trimmedLine.startsWith('# ') && !trimmedLine.startsWith('## ')) {
      const headingText = trimmedLine.replace('# ', '');
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: cleanMarkdownEscapes(headingText),
              bold: true,
              size: 32,
              font: 'Arial',
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
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: cleanMarkdownEscapes(headingText),
              bold: true,
              size: 28,
              font: 'Arial',
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
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: cleanMarkdownEscapes(headingText),
              bold: true,
              size: 24,
              font: 'Arial',
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
      paragraphs.push(
        new Paragraph({
          numbering: { reference: 'bullet-list', level: 0 },
          children: parseInlineFormatting(bulletContent),
          spacing: { after: 80 },
        })
      );
      continue;
    }

    // Numbered list - use Word's native numbering with inline formatting
    const numberMatch = trimmedLine.match(/^(\d+)\.\s(.+)/);
    if (numberMatch) {
      paragraphs.push(
        new Paragraph({
          numbering: { reference: 'numbered-list', level: 0 },
          children: parseInlineFormatting(numberMatch[2]),
          spacing: { after: 80 },
        })
      );
      continue;
    }

    // Regular paragraph with inline formatting
    paragraphs.push(
      new Paragraph({
        children: parseInlineFormatting(trimmedLine),
        spacing: { after: 150 },
      })
    );
  }

  return paragraphs;
}

function generateFAQParagraphs(faqs: FAQ[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  faqs.forEach((faq) => {
    // Question
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Q: ${faq.question}`,
            bold: true,
            size: 24,
            font: 'Arial',
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
            size: 24,
            font: 'Arial',
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
            size: 24,
            font: 'Arial',
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
            font: 'Arial',
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
                new TextRun({ text: 'Target Keyword(s)', bold: true, size: 22 }),
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
                new TextRun({ text: keywordText + nlpText, size: 22 }),
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
                new TextRun({ text: 'Target Page URL', bold: true, size: 22 }),
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
                new TextRun({ text: crawledData.url, size: 22, color: '2563EB' }),
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
                new TextRun({ text: 'Updated Title Tag', bold: true, size: 22 }),
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
                new TextRun({ text: 'Updated Meta Description', bold: true, size: 22 }),
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
                new TextRun({ text: 'Current H1', bold: true, size: 22 }),
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
                new TextRun({ text: 'New H1', bold: true, size: 22 }),
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
                new TextRun({ text: optimizedContent.h1, size: 22 }),
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
