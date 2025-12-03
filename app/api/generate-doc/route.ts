import { NextRequest, NextResponse } from 'next/server';
import { generateDocument } from '@/lib/doc-generator';
import type { DocumentGenerationRequest } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: DocumentGenerationRequest = await request.json();
    const { analysisResult, settings, clientName, pageName } = body;

    if (!analysisResult) {
      return NextResponse.json(
        { success: false, error: 'Analysis result is required' },
        { status: 400 }
      );
    }

    // Generate the Word document
    const docBuffer = await generateDocument({
      analysisResult,
      settings,
      clientName: clientName || 'Client',
      pageName: pageName || 'Page',
    });

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
