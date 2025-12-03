import { NextRequest, NextResponse } from 'next/server';
import { generateDocument } from '@/lib/doc-generator';
import type { DocumentGenerationRequest } from '@/types';

// Extend timeout for Vercel (Pro plan: up to 300s, Hobby: 10s max)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  console.log('[generate-doc] Starting request...');

  try {
    const body: DocumentGenerationRequest = await request.json();
    const { analysisResult, settings, clientName, pageName } = body;

    console.log('[generate-doc] Parsed body, content length:',
      analysisResult?.optimizedContent?.fullContent?.length || 0);

    if (!analysisResult) {
      return NextResponse.json(
        { success: false, error: 'Analysis result is required' },
        { status: 400 }
      );
    }

    console.log('[generate-doc] Starting document generation...');

    // Generate the Word document
    const docBuffer = await generateDocument({
      analysisResult,
      settings,
      clientName: clientName || 'Client',
      pageName: pageName || 'Page',
    });

    console.log('[generate-doc] Document generated, buffer size:', docBuffer.length);

    // Return the document as a downloadable file
    const filename = `${clientName || 'SEO'}_${pageName || 'Content'}_Improvement.docx`
      .replace(/[^a-zA-Z0-9_-]/g, '_');

    return new NextResponse(new Uint8Array(docBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': docBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Document generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate document. Please try again.' },
      { status: 500 }
    );
  }
}
