import { NextRequest, NextResponse } from 'next/server';
import { crawlPage } from '@/lib/crawler';
import { analyzeSEO } from '@/lib/seo-analyzer';
import { optimizeContent } from '@/lib/content-optimizer';
import type { AnalyzeRequest, AnalysisResult, KeywordData, CustomInstructions } from '@/types';

// Extend timeout for Vercel Pro (Claude API calls can take 30-60+ seconds)
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json();
    const { url, keywords, settings, customInstructions } = body;

    // Validate URL
    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid URL starting with http:// or https://' },
        { status: 400 }
      );
    }

    // Ensure keywords object has all required properties
    const safeKeywords: KeywordData = {
      primary: keywords?.primary || [],
      secondary: keywords?.secondary || [],
      nlpTerms: keywords?.nlpTerms || [],
      questions: keywords?.questions || [],
      longTail: keywords?.longTail || [],
      all: keywords?.all || [],
    };

    // Step 1: Crawl the page
    let crawledData;
    try {
      crawledData = await crawlPage(url);
    } catch (error) {
      console.error('Crawl error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('FIRECRAWL_API_KEY')) {
        return NextResponse.json(
          { success: false, error: 'Firecrawl API key is not configured. Please add it to your .env.local file.' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { success: false, error: `Failed to crawl page: ${errorMessage}` },
        { status: 500 }
      );
    }

    // Step 2: Analyze SEO
    const seoAnalysis = analyzeSEO(crawledData, safeKeywords);

    // Ensure customInstructions has all required properties
    const safeCustomInstructions: CustomInstructions = {
      thingsToAvoid: customInstructions?.thingsToAvoid || '',
      focusAreas: customInstructions?.focusAreas || '',
      toneAndStyle: customInstructions?.toneAndStyle || '',
      additionalInstructions: customInstructions?.additionalInstructions || '',
    };

    // Step 3: Generate optimized content using AI
    let optimizedContent;
    try {
      optimizedContent = await optimizeContent(crawledData, safeKeywords, settings, safeCustomInstructions);
    } catch (error) {
      console.error('AI optimization error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('ANTHROPIC_API_KEY')) {
        return NextResponse.json(
          { success: false, error: 'Anthropic API key is not configured. Please add it to your .env.local file.' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { success: false, error: `Failed to generate optimized content: ${errorMessage}` },
        { status: 500 }
      );
    }

    const result: AnalysisResult = {
      crawledData,
      seoAnalysis,
      optimizedContent,
      keywords: safeKeywords,
    };

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
