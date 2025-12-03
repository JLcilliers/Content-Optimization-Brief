import { NextRequest, NextResponse } from 'next/server';
import { parseKeywordsFromBuffer } from '@/lib/keyword-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    const isValidType =
      validTypes.includes(file.type) ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls') ||
      file.name.endsWith('.csv');

    if (!isValidType) {
      return NextResponse.json(
        { success: false, error: 'Please upload an Excel (.xlsx, .xls) or CSV file.' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse keywords
    const keywords = parseKeywordsFromBuffer(buffer, file.name);

    if (keywords.all.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No keywords found in the uploaded file. Please check the file format.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: keywords,
    });
  } catch (error) {
    console.error('Error parsing keywords:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to parse keywords file. Please check the file format.' },
      { status: 500 }
    );
  }
}
