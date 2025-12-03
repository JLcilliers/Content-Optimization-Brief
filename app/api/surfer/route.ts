import { NextRequest, NextResponse } from 'next/server';
import { parseSurferAuditReport } from '@/lib/surfer-parser';
import type { SurferSEOReport, KeywordData } from '@/types';

// Extended timeout for Puppeteer browser automation
export const maxDuration = 60;

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

    console.log('[Surfer API] Starting Puppeteer-based parsing for:', surferUrl);

    // Use Puppeteer-based parser for better extraction
    const result = await parseSurferAuditReport(surferUrl);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to parse SurferSEO report' },
        { status: 500 }
      );
    }

    // Convert parsed data to SurferSEOReport format
    const surferReport: SurferSEOReport = {
      url: result.url,
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
      keywords: result.terms.map((term, index) => ({
        term: term.term,
        importance: index < 5 ? 'high' as const : index < 15 ? 'medium' as const : 'low' as const,
        usageTarget: {
          min: term.recommendedMin || 1,
          max: term.recommendedMax || 5,
          recommended: term.recommendedMin && term.recommendedMax
            ? Math.round((term.recommendedMin + term.recommendedMax) / 2)
            : 2,
        },
      })),
      nlpTerms: result.terms.slice(0, 20).map((term, index) => ({
        term: term.term,
        relevance: Math.max(0.3, 1 - (index * 0.03)),
        usageTarget: term.recommendedMax || Math.max(1, 3 - Math.floor(index / 5)),
      })),
      questions: result.questions,
      competitors: [],
      structureRecommendations: result.headings,
    };

    // Convert to KeywordData format for the main analyzer
    const keywords = convertToKeywordData(surferReport);

    console.log(`[Surfer API] Extracted ${result.terms.length} terms, ${result.questions.length} questions`);

    return NextResponse.json({
      success: true,
      data: {
        surferReport,
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

// Convert SurferSEO report to KeywordData format for the main analyzer
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
