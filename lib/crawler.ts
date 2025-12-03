import FirecrawlApp from '@mendable/firecrawl-js';
import type { CrawledData, SchemaMarkup, ImageData } from '@/types';

const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;

interface FirecrawlResult {
  markdown?: string;
  html?: string;
  metadata?: {
    title?: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
    canonical?: string;
    [key: string]: unknown;
  };
}

export async function crawlPage(url: string): Promise<CrawledData> {
  if (!firecrawlApiKey) {
    throw new Error('FIRECRAWL_API_KEY is not configured');
  }

  const app = new FirecrawlApp({ apiKey: firecrawlApiKey });

  try {
    // Use type assertion to handle API version differences
    const scrapeResult = await (app as unknown as { scrapeUrl: (url: string, options: { formats: string[] }) => Promise<unknown> }).scrapeUrl(url, {
      formats: ['markdown', 'html'],
    }) as { success: boolean; error?: string } & FirecrawlResult;

    if (!scrapeResult.success) {
      throw new Error(scrapeResult.error || 'Failed to crawl page');
    }

    const html = scrapeResult.html || '';
    const markdown = scrapeResult.markdown || '';
    const metadata = scrapeResult.metadata || {};

    // Extract data from HTML
    const extractedData = extractFromHtml(html);

    // Calculate word count from markdown (cleaner text)
    const wordCount = countWords(markdown);

    return {
      url,
      title: metadata.title || extractedData.title || '',
      metaDescription: metadata.description || extractedData.metaDescription || '',
      h1: extractedData.h1,
      h2: extractedData.h2,
      h3: extractedData.h3,
      h4: extractedData.h4,
      h5: extractedData.h5,
      h6: extractedData.h6,
      bodyContent: markdown,
      schemaMarkup: extractedData.schemaMarkup,
      canonicalUrl: metadata.canonical || extractedData.canonicalUrl || '',
      ogTitle: metadata.ogTitle || '',
      ogDescription: metadata.ogDescription || '',
      wordCount,
      internalLinks: extractedData.internalLinks,
      externalLinks: extractedData.externalLinks,
      images: extractedData.images,
    };
  } catch (error) {
    console.error('Crawl error:', error);
    throw error;
  }
}

function extractFromHtml(html: string): {
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  h3: string[];
  h4: string[];
  h5: string[];
  h6: string[];
  schemaMarkup: SchemaMarkup[];
  canonicalUrl: string;
  internalLinks: string[];
  externalLinks: string[];
  images: ImageData[];
} {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Extract meta description
  const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : '';

  // Extract headings
  const h1 = extractHeadings(html, 'h1');
  const h2 = extractHeadings(html, 'h2');
  const h3 = extractHeadings(html, 'h3');
  const h4 = extractHeadings(html, 'h4');
  const h5 = extractHeadings(html, 'h5');
  const h6 = extractHeadings(html, 'h6');

  // Extract schema markup
  const schemaMarkup = extractSchemaMarkup(html);

  // Extract canonical URL
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/i);
  const canonicalUrl = canonicalMatch ? canonicalMatch[1] : '';

  // Extract links
  const { internalLinks, externalLinks } = extractLinks(html);

  // Extract images
  const images = extractImages(html);

  return {
    title,
    metaDescription,
    h1,
    h2,
    h3,
    h4,
    h5,
    h6,
    schemaMarkup,
    canonicalUrl,
    internalLinks,
    externalLinks,
    images,
  };
}

function extractHeadings(html: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*(?:<[^/h][^>]*>[^<]*)*)<\/${tag}>`, 'gi');
  const headings: string[] = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    // Remove HTML tags from heading content
    const cleanText = match[1].replace(/<[^>]*>/g, '').trim();
    if (cleanText) {
      headings.push(cleanText);
    }
  }

  return headings;
}

function extractSchemaMarkup(html: string): SchemaMarkup[] {
  const schemas: SchemaMarkup[] = [];
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const jsonContent = match[1].trim();
      const parsed = JSON.parse(jsonContent);

      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (item['@type']) {
            schemas.push({
              type: item['@type'],
              data: item,
            });
          }
        });
      } else if (parsed['@type']) {
        schemas.push({
          type: parsed['@type'],
          data: parsed,
        });
      } else if (parsed['@graph']) {
        parsed['@graph'].forEach((item: { '@type'?: string }) => {
          if (item['@type']) {
            schemas.push({
              type: item['@type'],
              data: item,
            });
          }
        });
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return schemas;
}

function extractLinks(html: string): { internalLinks: string[]; externalLinks: string[] } {
  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (href.startsWith('http://') || href.startsWith('https://')) {
      externalLinks.push(href);
    } else if (href.startsWith('/') || href.startsWith('#')) {
      internalLinks.push(href);
    }
  }

  return {
    internalLinks: [...new Set(internalLinks)],
    externalLinks: [...new Set(externalLinks)],
  };
}

function extractImages(html: string): ImageData[] {
  const images: ImageData[] = [];
  const imgRegex = /<img[^>]*>/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const imgTag = match[0];
    const srcMatch = imgTag.match(/src=["']([^"']*)["']/i);
    const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);

    if (srcMatch) {
      images.push({
        src: srcMatch[1],
        alt: altMatch ? altMatch[1] : '',
        hasAlt: !!altMatch && altMatch[1].length > 0,
      });
    }
  }

  return images;
}

function countWords(text: string): number {
  // Remove markdown syntax and count words
  const cleanText = text
    .replace(/#{1,6}\s/g, '') // Remove heading markers
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Replace links with text
    .replace(/[*_`~]/g, '') // Remove formatting
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .trim();

  return cleanText.split(/\s+/).filter((word) => word.length > 0).length;
}
