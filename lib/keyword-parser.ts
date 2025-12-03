import * as XLSX from 'xlsx';
import type { KeywordData } from '@/types';

export function parseKeywordsFromBuffer(buffer: Buffer, filename: string): KeywordData {
  const extension = filename.toLowerCase().split('.').pop();

  if (extension === 'csv') {
    return parseCSV(buffer.toString('utf-8'));
  } else if (extension === 'xlsx' || extension === 'xls') {
    return parseExcel(buffer);
  }

  throw new Error('Unsupported file format. Please upload .xlsx, .xls, or .csv files.');
}

function parseCSV(content: string): KeywordData {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const keywords: string[] = [];

  // Skip header if it looks like one
  const startIndex = isHeaderRow(lines[0]) ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split by comma but handle quoted fields
    const fields = parseCSVLine(line);

    // Try to find the keyword column (first non-empty, non-numeric column)
    for (const field of fields) {
      const cleaned = field.trim().replace(/^["']|["']$/g, '');
      if (cleaned && !isNumericOnly(cleaned) && cleaned.length > 1) {
        keywords.push(cleaned);
        break;
      }
    }
  }

  return categorizeKeywords(keywords);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

function parseExcel(buffer: Buffer): KeywordData {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const keywords: string[] = [];

  // Process first sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  if (data.length === 0) {
    return emptyKeywordData();
  }

  // Find the keyword column
  let keywordColIndex = 0;
  const firstRow = data[0];

  if (Array.isArray(firstRow)) {
    // Check if first row is a header
    const headerKeywords = ['keyword', 'keywords', 'term', 'terms', 'query', 'search term'];
    for (let i = 0; i < firstRow.length; i++) {
      const cell = String(firstRow[i] || '').toLowerCase().trim();
      if (headerKeywords.some((h) => cell.includes(h))) {
        keywordColIndex = i;
        break;
      }
    }
  }

  // Determine start row (skip header if present)
  const startRow = isHeaderRow(String(data[0]?.[keywordColIndex] || '')) ? 1 : 0;

  // Extract keywords
  for (let i = startRow; i < data.length; i++) {
    const row = data[i];
    if (Array.isArray(row)) {
      const value = row[keywordColIndex];
      if (value && typeof value === 'string' && value.trim()) {
        keywords.push(value.trim());
      } else if (value && typeof value === 'number') {
        // Skip numeric-only values
      } else if (typeof value === 'string') {
        const trimmed = String(value).trim();
        if (trimmed && !isNumericOnly(trimmed)) {
          keywords.push(trimmed);
        }
      }
    }
  }

  return categorizeKeywords(keywords);
}

function isHeaderRow(value: string): boolean {
  const headerIndicators = [
    'keyword',
    'keywords',
    'term',
    'query',
    'search',
    'volume',
    'difficulty',
    'kd',
    'cpc',
  ];
  const lowerValue = value.toLowerCase().trim();
  return headerIndicators.some((indicator) => lowerValue.includes(indicator));
}

function isNumericOnly(value: string): boolean {
  return /^\d+([.,]\d+)?$/.test(value.trim());
}

function categorizeKeywords(keywords: string[]): KeywordData {
  // Remove duplicates and empty values
  const uniqueKeywords = [...new Set(keywords.filter((k) => k.trim()))];

  if (uniqueKeywords.length === 0) {
    return emptyKeywordData();
  }

  const primary: string[] = [];
  const secondary: string[] = [];
  const nlpTerms: string[] = [];
  const questions: string[] = [];
  const longTail: string[] = [];

  const questionStarters = ['who', 'what', 'when', 'where', 'why', 'how', 'is', 'are', 'can', 'do', 'does'];

  uniqueKeywords.forEach((keyword, index) => {
    const lowerKeyword = keyword.toLowerCase().trim();
    const wordCount = lowerKeyword.split(/\s+/).length;
    const firstWord = lowerKeyword.split(/\s+/)[0];

    // Categorize based on position and characteristics
    if (questionStarters.some((q) => firstWord === q) || lowerKeyword.includes('?')) {
      questions.push(keyword);
    } else if (wordCount >= 4) {
      longTail.push(keyword);
    } else if (index < 5) {
      // First 5 non-question keywords are primary
      primary.push(keyword);
    } else if (index < 15) {
      // Next 10 are secondary
      secondary.push(keyword);
    } else {
      // Rest are NLP/related terms
      nlpTerms.push(keyword);
    }
  });

  // Ensure we have at least some primary keywords
  if (primary.length === 0 && secondary.length > 0) {
    primary.push(...secondary.splice(0, 3));
  }

  if (primary.length === 0 && longTail.length > 0) {
    primary.push(...longTail.splice(0, 3));
  }

  if (primary.length === 0 && questions.length > 0) {
    primary.push(...questions.splice(0, 2));
  }

  return {
    primary,
    secondary,
    nlpTerms,
    questions,
    longTail,
    all: uniqueKeywords,
  };
}

function emptyKeywordData(): KeywordData {
  return {
    primary: [],
    secondary: [],
    nlpTerms: [],
    questions: [],
    longTail: [],
    all: [],
  };
}
