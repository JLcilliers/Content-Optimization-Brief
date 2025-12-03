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
} from 'docx';
import type { AnalysisResult, Settings, FAQ, SchemaRecommendation } from '@/types';

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

export async function generateDocument(options: DocGeneratorOptions): Promise<Buffer> {
  const { analysisResult, settings, clientName, pageName } = options;
  const { crawledData, optimizedContent, keywords } = analysisResult;

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
            spacing: { before: 100, after: 100 },
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

          // Section Header
          new Paragraph({
            children: [
              new TextRun({
                text: 'Web Page - Meta Data',
                bold: true,
                size: 28,
                font: 'Arial',
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 },
          }),

          // New Content Section
          new Paragraph({
            children: [
              new TextRun({
                text: 'NEW CONTENT',
                bold: true,
                size: 28,
                font: 'Arial',
                color: '2563EB',
              }),
            ],
            spacing: { before: 300, after: 200 },
          }),

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
            spacing: { before: 200, after: 200 },
          }),

          // Full Content
          ...parseContentToParagraphs(optimizedContent.fullContent),

          // FAQs Section (if any)
          ...(optimizedContent.faqs.length > 0
            ? [
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
                  spacing: { before: 400, after: 200 },
                }),
                ...generateFAQParagraphs(optimizedContent.faqs),
              ]
            : []),

          // Schema Recommendations (if any)
          ...(settings.includeSchemaRecommendations && optimizedContent.schemaRecommendations.length > 0
            ? [
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
                  spacing: { before: 400, after: 200 },
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

  return Buffer.from(await Packer.toBuffer(doc));
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

    // H2 heading (##)
    if (trimmedLine.startsWith('## ')) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine.replace('## ', ''),
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
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine.replace('### ', ''),
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

    // Bullet point - use Word's native numbering
    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      paragraphs.push(
        new Paragraph({
          numbering: { reference: 'bullet-list', level: 0 },
          children: [
            new TextRun({
              text: trimmedLine.substring(2),
              size: 24,
              font: 'Arial',
            }),
          ],
          spacing: { after: 80 },
        })
      );
      continue;
    }

    // Numbered list - use Word's native numbering
    const numberMatch = trimmedLine.match(/^(\d+)\.\s(.+)/);
    if (numberMatch) {
      paragraphs.push(
        new Paragraph({
          numbering: { reference: 'numbered-list', level: 0 },
          children: [
            new TextRun({
              text: numberMatch[2],
              size: 24,
              font: 'Arial',
            }),
          ],
          spacing: { after: 80 },
        })
      );
      continue;
    }

    // Bold text handling (**text**)
    const runs: TextRun[] = [];
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(trimmedLine)) !== null) {
      // Add text before bold
      if (match.index > lastIndex) {
        runs.push(
          new TextRun({
            text: trimmedLine.substring(lastIndex, match.index),
            size: 24,
            font: 'Arial',
          })
        );
      }
      // Add bold text
      runs.push(
        new TextRun({
          text: match[1],
          bold: true,
          size: 24,
          font: 'Arial',
        })
      );
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < trimmedLine.length) {
      runs.push(
        new TextRun({
          text: trimmedLine.substring(lastIndex),
          size: 24,
          font: 'Arial',
        })
      );
    }

    // Regular paragraph
    paragraphs.push(
      new Paragraph({
        children: runs.length > 0 ? runs : [
          new TextRun({
            text: trimmedLine,
            size: 24,
            font: 'Arial',
          }),
        ],
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
    const jsonLines = formattedJson.split('\n');
    jsonLines.forEach((line, index) => {
      paragraphs.push(
        new Paragraph({
          style: 'CodeBlock',
          children: [
            new TextRun({
              text: line,
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
            after: index === jsonLines.length - 1 ? 200 : 0
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
