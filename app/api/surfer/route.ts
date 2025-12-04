import { NextRequest, NextResponse } from 'next/server';
import { parseSurferAuditReport } from '@/lib/surfer-parser';
import type { SurferSEOReport, KeywordData } from '@/types';

// Extended timeout for Puppeteer browser automation
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  console.log('[Surfer API] Request received');

  try {
    const body = await request.json();
    console.log('[Surfer API] Request body:', JSON.stringify(body));

    const { surferUrl } = body;

    // Validate SurferSEO URL
    if (!surferUrl) {
      console.log('[Surfer API] No surferUrl provided');
      return NextResponse.json(
        { success: false, error: 'SurferSEO report URL is required' },
        { status: 400 }
      );
    }

    // Validate it's a SurferSEO URL
    if (!surferUrl.includes('surferseo.com') && !surferUrl.includes('app.surferseo.com')) {
      console.log('[Surfer API] Invalid URL format:', surferUrl);
      return NextResponse.json(
        { success: false, error: 'Please provide a valid SurferSEO report URL (e.g., https://app.surferseo.com/...)' },
        { status: 400 }
      );
    }

    console.log('[Surfer API] Starting Puppeteer-based parsing for:', surferUrl);

    // Use Puppeteer-based parser for better extraction
    let result;
    try {
      result = await parseSurferAuditReport(surferUrl);
      console.log('[Surfer API] Parser returned:', {
        success: result.success,
        termCount: result.terms?.length || 0,
        nlpTermCount: result.nlpTerms?.length || 0,
        error: result.error
      });
    } catch (parseError) {
      console.error('[Surfer API] Parser threw exception:', parseError);
      throw parseError;
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to parse SurferSEO report' },
        { status: 500 }
      );
    }

    // Combine regular terms and NLP terms for the full list
    const allTerms = [...result.terms, ...result.nlpTerms];

    // Convert parsed data to SurferSEOReport format
    const surferReport: SurferSEOReport = {
      url: result.url,
      auditedUrl: result.auditedUrl,
      targetKeyword: result.mainKeyword,
      contentScore: result.contentScore || 0,
      wordCountTarget: {
        min: result.wordCount ? Math.round(result.wordCount * 0.8) : 1500,
        max: result.wordCount ? Math.round(result.wordCount * 1.2) : 3000,
        recommended: result.wordCount || 2000,
      },
      headings: {
        h2Count: { min: 3, max: 10, recommended: 6 },
        h3Count: { min: 2, max: 15, recommended: 8 },
      },
      keywords: allTerms.map((term, index) => ({
        term: term.term,
        importance: index < 5 ? 'high' as const : index < 15 ? 'medium' as const : 'low' as const,
        usageTarget: {
          min: term.recommendedMin || 1,
          max: term.recommendedMax || 5,
          recommended: term.recommendedMin && term.recommendedMax
            ? Math.round((term.recommendedMin + term.recommendedMax) / 2)
            : 2,
        },
        currentCount: term.currentCount,
        status: term.status,
        action: term.action,
        relevance: term.relevance,
        isNLP: term.isNLP,
      })),
      nlpTerms: result.nlpTerms.map((term, index) => ({
        term: term.term,
        relevance: term.relevance ?? Math.max(0.3, 1 - (index * 0.03)),
        usageTarget: term.recommendedMax || Math.max(1, 3 - Math.floor(index / 5)),
        currentCount: term.currentCount,
        status: term.status,
        action: term.action,
      })),
      questions: result.questions,
      competitors: [],
      structureRecommendations: result.headings,
    };

    // Convert to KeywordData format for the main analyzer
    const keywords = convertToKeywordData(surferReport);

    console.log(`[Surfer API] Extracted ${result.terms.length} terms, ${result.nlpTerms.length} NLP terms, ${result.questions.length} questions`);

    return NextResponse.json({
      success: true,
      data: {
        surferReport,
        keywords,
      },
    });

  } catch (error) {
    console.error('[Surfer API] Unhandled error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[Surfer API] Error stack:', errorStack);

    return NextResponse.json(
      {
        success: false,
        error: `Failed to parse SurferSEO report: ${errorMessage}`,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    );
  }
}

// Helper to check if a string looks like a URL
function isUrl(str: string): boolean {
  return str.startsWith('http://') ||
         str.startsWith('https://') ||
         str.startsWith('www.') ||
         str.includes('.com/') ||
         str.includes('.pdf') ||
         str.includes('.org/') ||
         str.includes('.net/') ||
         str.includes('.io/') ||
         /^[a-z0-9-]+\.(com|org|net|io|co|edu|gov|pdf)\b/i.test(str);
}

// Helper to filter out invalid keywords
function isValidKeyword(term: string): boolean {
  if (!term || term.length < 2 || term.length > 60) return false;
  if (isUrl(term)) return false;
  if (/[<>{}|\[\]\\]/.test(term)) return false;
  return true;
}

// Convert SurferSEO report to KeywordData format for the main analyzer
function convertToKeywordData(surferReport: SurferSEOReport): KeywordData {
  // Convert SurferSEO report to KeywordData format
  const primary: string[] = [];
  const secondary: string[] = [];
  const nlpTerms: string[] = [];
  const questions: string[] = surferReport.questions.filter(q => !isUrl(q));
  const longTail: string[] = [];

  // Add target keyword as primary (if valid)
  if (surferReport.targetKeyword && isValidKeyword(surferReport.targetKeyword)) {
    primary.push(surferReport.targetKeyword);
  }

  // Categorize keywords by importance, filtering out URLs
  surferReport.keywords.forEach(kw => {
    // Skip invalid keywords (URLs, too long, etc.)
    if (!isValidKeyword(kw.term)) return;

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

  // Add NLP terms (filtering out URLs)
  surferReport.nlpTerms.forEach(term => {
    if (isValidKeyword(term.term)) {
      nlpTerms.push(term.term);
    }
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
