import { NextResponse } from 'next/server';
import { parseSurferAuditReport, combineSurferReports } from '@/lib/surfer-parser';

export const maxDuration = 60; // 60 second timeout for Puppeteer

export async function POST(request: Request) {
  try {
    const { urls } = await request.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: 'Please provide an array of SurferSEO report URLs' },
        { status: 400 }
      );
    }

    console.log(`[API] Parsing ${urls.length} SurferSEO reports...`);

    // Parse all reports
    const reports = await Promise.all(
      urls.map(url => parseSurferAuditReport(url))
    );

    // Combine results
    const combined = combineSurferReports(reports);

    // Count successes/failures
    const successCount = reports.filter(r => r.success).length;
    const failedReports = reports
      .filter(r => !r.success)
      .map(r => ({ url: r.url, error: r.error }));

    return NextResponse.json({
      success: true,
      reportsProcessed: urls.length,
      reportsSuccessful: successCount,
      failedReports,
      data: {
        keywords: combined.allTerms.map(t => t.term),
        keywordsWithData: combined.allTerms,
        questions: combined.allQuestions,
        primaryKeywords: combined.primaryKeywords
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Surfer parsing error:', errorMessage);
    return NextResponse.json(
      { error: 'Failed to parse SurferSEO reports', details: errorMessage },
      { status: 500 }
    );
  }
}
