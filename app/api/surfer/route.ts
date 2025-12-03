import { NextRequest, NextResponse } from 'next/server';
import FirecrawlApp from '@mendable/firecrawl-js';
import type { SurferSEOReport, SurferKeyword, SurferNLPTerm, KeywordData } from '@/types';

const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;

interface FirecrawlResponse {
  success: boolean;
  error?: string;
  data?: {
    markdown?: string;
    html?: string;
    metadata?: Record<string, unknown>;
  };
  markdown?: string;
  html?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { surferUrl } = body;

    // Validate SurferSEO URL
    if (!surferUrl) {
      return NextResponse.json(
        { success: false, error: 'SurferSEO report URL is required' },
        { status: 400 }
      );
    }

    // Validate it's a SurferSEO URL
    if (!surferUrl.includes('surferseo.com') && !surferUrl.includes('app.surferseo.com')) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid SurferSEO report URL (e.g., https://app.surferseo.com/...)' },
        { status: 400 }
      );
    }

    if (!firecrawlApiKey) {
      return NextResponse.json(
        { success: false, error: 'Firecrawl API key is not configured' },
        { status: 500 }
      );
    }

    const app = new FirecrawlApp({ apiKey: firecrawlApiKey });

    // Scrape the SurferSEO page
    const scrapeResult = await (app as unknown as {
      scrapeUrl: (url: string, options: { formats: string[] }) => Promise<unknown>
    }).scrapeUrl(surferUrl, {
      formats: ['markdown', 'html'],
    }) as FirecrawlResponse;

    if (!scrapeResult.success) {
      return NextResponse.json(
        { success: false, error: scrapeResult.error || 'Failed to access SurferSEO report. Make sure the report is publicly accessible or shared.' },
        { status: 500 }
      );
    }

    // Handle both API response formats
    const responseData = scrapeResult.data || scrapeResult;
    const markdown = responseData.markdown || '';
    const html = responseData.html || '';

    // Parse the SurferSEO report content
    const surferData = parseSurferContent(markdown, html);

    // Convert to KeywordData format for the main analyzer
    const keywords = convertToKeywordData(surferData);

    return NextResponse.json({
      success: true,
      data: {
        surferReport: surferData,
        keywords,
      },
    });

  } catch (error) {
    console.error('SurferSEO parsing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to parse SurferSEO report: ${errorMessage}` },
      { status: 500 }
    );
  }
}

function parseSurferContent(markdown: string, html: string): SurferSEOReport {
  // Extract data from the SurferSEO report
  // This parser handles common SurferSEO content editor report formats

  const report: SurferSEOReport = {
    url: '',
    targetKeyword: '',
    contentScore: 0,
    wordCountTarget: { min: 1500, max: 3000, recommended: 2000 },
    headings: {
      h2Count: { min: 3, max: 10, recommended: 6 },
      h3Count: { min: 2, max: 15, recommended: 8 },
    },
    keywords: [],
    nlpTerms: [],
    questions: [],
    competitors: [],
    structureRecommendations: [],
  };

  // Extract target keyword (usually prominently displayed)
  const keywordMatch = markdown.match(/(?:target keyword|main keyword|primary keyword)[:\s]*([^\n]+)/i)
    || markdown.match(/(?:keyword|topic)[:\s]*["']?([^"'\n]+)["']?/i);
  if (keywordMatch) {
    report.targetKeyword = keywordMatch[1].trim();
  }

  // Extract content score
  const scoreMatch = markdown.match(/(?:content score|score)[:\s]*(\d+)/i);
  if (scoreMatch) {
    report.contentScore = parseInt(scoreMatch[1], 10);
  }

  // Extract word count recommendations
  const wordCountMatch = markdown.match(/(?:word count|words)[:\s]*(\d+)\s*[-–]\s*(\d+)/i)
    || markdown.match(/(\d+)\s*[-–]\s*(\d+)\s*words/i);
  if (wordCountMatch) {
    report.wordCountTarget.min = parseInt(wordCountMatch[1], 10);
    report.wordCountTarget.max = parseInt(wordCountMatch[2], 10);
    report.wordCountTarget.recommended = Math.round((report.wordCountTarget.min + report.wordCountTarget.max) / 2);
  }

  // Extract keywords from various sections
  const keywordPatterns = [
    /(?:important terms|key terms|keywords to use|terms to include)[:\s]*\n([\s\S]*?)(?=\n\n|\n#|$)/gi,
    /(?:use these|include these)[:\s]*\n([\s\S]*?)(?=\n\n|\n#|$)/gi,
  ];

  const keywordTerms: Set<string> = new Set();

  for (const pattern of keywordPatterns) {
    const matches = markdown.matchAll(pattern);
    for (const match of matches) {
      const terms = match[1].split(/[\n,;]/).map(t => t.trim()).filter(t => t.length > 0 && t.length < 50);
      terms.forEach(t => {
        // Clean up bullet points and numbers
        const cleaned = t.replace(/^[-•*\d.)\]]+\s*/, '').trim();
        if (cleaned) keywordTerms.add(cleaned);
      });
    }
  }

  // Also look for terms in lists
  const listItemPattern = /[-•*]\s*([^:\n]+?)(?:\s*[-–:]\s*(?:high|medium|low|important|use \d+|mention))?$/gim;
  const listMatches = markdown.matchAll(listItemPattern);
  for (const match of listMatches) {
    const term = match[1].trim();
    if (term.length > 2 && term.length < 50 && !term.includes('http')) {
      keywordTerms.add(term);
    }
  }

  // Convert to SurferKeyword format
  let index = 0;
  keywordTerms.forEach(term => {
    const importance = index < 5 ? 'high' : index < 15 ? 'medium' : 'low';
    report.keywords.push({
      term,
      importance,
      usageTarget: {
        min: importance === 'high' ? 3 : importance === 'medium' ? 2 : 1,
        max: importance === 'high' ? 10 : importance === 'medium' ? 6 : 4,
        recommended: importance === 'high' ? 5 : importance === 'medium' ? 3 : 2,
      },
    });
    index++;
  });

  // Extract NLP terms (often labeled as NLP entities or semantic terms)
  const nlpPattern = /(?:nlp terms|nlp entities|semantic terms|related terms)[:\s]*\n([\s\S]*?)(?=\n\n|\n#|$)/gi;
  const nlpMatches = markdown.matchAll(nlpPattern);
  for (const match of nlpMatches) {
    const terms = match[1].split(/[\n,;]/).map(t => t.trim()).filter(t => t.length > 0);
    terms.forEach((t, i) => {
      const cleaned = t.replace(/^[-•*\d.)\]]+\s*/, '').trim();
      if (cleaned && cleaned.length < 50) {
        report.nlpTerms.push({
          term: cleaned,
          relevance: Math.max(0.3, 1 - (i * 0.05)),
          usageTarget: Math.max(1, 3 - Math.floor(i / 5)),
        });
      }
    });
  }

  // Extract questions (People Also Ask, FAQs)
  const questionPatterns = [
    /(?:questions|people also ask|faqs?)[:\s]*\n([\s\S]*?)(?=\n\n|\n#|$)/gi,
    /\?[^\n]*\n/g,
  ];

  const questions: Set<string> = new Set();

  // Look for question sections
  const questionSectionMatch = markdown.match(/(?:questions|people also ask)[:\s]*\n([\s\S]*?)(?=\n\n|\n#|$)/i);
  if (questionSectionMatch) {
    const qLines = questionSectionMatch[1].split('\n');
    qLines.forEach(line => {
      const cleaned = line.replace(/^[-•*\d.)\]]+\s*/, '').trim();
      if (cleaned.includes('?') || cleaned.toLowerCase().startsWith('how') ||
          cleaned.toLowerCase().startsWith('what') || cleaned.toLowerCase().startsWith('why') ||
          cleaned.toLowerCase().startsWith('when') || cleaned.toLowerCase().startsWith('where')) {
        questions.add(cleaned.endsWith('?') ? cleaned : cleaned + '?');
      }
    });
  }

  // Find standalone questions
  const standaloneQuestions = markdown.match(/(?:^|\n)([^?\n]*\?)\s*(?:\n|$)/g);
  if (standaloneQuestions) {
    standaloneQuestions.forEach(q => {
      const cleaned = q.trim();
      if (cleaned.length > 10 && cleaned.length < 200) {
        questions.add(cleaned);
      }
    });
  }

  report.questions = Array.from(questions).slice(0, 10);

  // Extract structure recommendations
  const structurePatterns = [
    /(?:structure|outline|recommended headings)[:\s]*\n([\s\S]*?)(?=\n\n|\n#|$)/gi,
    /(?:h2|heading)[:\s]*([^\n]+)/gi,
  ];

  for (const pattern of structurePatterns) {
    const matches = markdown.matchAll(pattern);
    for (const match of matches) {
      const rec = match[1].trim();
      if (rec && rec.length < 100) {
        report.structureRecommendations.push(rec);
      }
    }
  }

  // If we didn't find much, try to extract from HTML
  if (report.keywords.length === 0 && html) {
    // Try to find keyword elements in HTML
    const htmlKeywordMatches = html.matchAll(/data-keyword="([^"]+)"/g);
    for (const match of htmlKeywordMatches) {
      report.keywords.push({
        term: match[1],
        importance: 'medium',
        usageTarget: { min: 1, max: 5, recommended: 2 },
      });
    }
  }

  return report;
}

function convertToKeywordData(surferReport: SurferSEOReport): KeywordData {
  // Convert SurferSEO report to KeywordData format
  const primary: string[] = [];
  const secondary: string[] = [];
  const nlpTerms: string[] = [];
  const questions: string[] = surferReport.questions;
  const longTail: string[] = [];

  // Add target keyword as primary
  if (surferReport.targetKeyword) {
    primary.push(surferReport.targetKeyword);
  }

  // Categorize keywords by importance
  surferReport.keywords.forEach(kw => {
    if (kw.importance === 'high') {
      if (!primary.includes(kw.term)) {
        primary.push(kw.term);
      }
    } else if (kw.importance === 'medium') {
      secondary.push(kw.term);
    } else {
      // Low importance keywords often make good long-tail targets
      if (kw.term.split(' ').length >= 3) {
        longTail.push(kw.term);
      } else {
        secondary.push(kw.term);
      }
    }
  });

  // Add NLP terms
  surferReport.nlpTerms.forEach(term => {
    nlpTerms.push(term.term);
  });

  // Combine all keywords
  const all = [...new Set([...primary, ...secondary, ...nlpTerms, ...questions, ...longTail])];

  return {
    primary: primary.slice(0, 5),
    secondary: secondary.slice(0, 15),
    nlpTerms: nlpTerms.slice(0, 20),
    questions: questions.slice(0, 10),
    longTail: longTail.slice(0, 10),
    all,
  };
}
