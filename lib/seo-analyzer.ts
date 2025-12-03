import type { CrawledData, KeywordData, SEOAnalysis, SEOIssue, HeadingStructure, KeywordAnalysisResult } from '@/types';
import { calculateKeywordDensity } from './utils';

export function analyzeSEO(crawledData: CrawledData, keywords: KeywordData): SEOAnalysis {
  const issues: SEOIssue[] = [];

  // Analyze title
  const titleLength = crawledData.title.length;
  if (titleLength === 0) {
    issues.push({
      type: 'error',
      category: 'title',
      message: 'Missing meta title',
      recommendation: 'Add a descriptive meta title between 50-60 characters',
    });
  } else if (titleLength < 30) {
    issues.push({
      type: 'warning',
      category: 'title',
      message: `Meta title is too short (${titleLength} characters)`,
      recommendation: 'Expand your title to 50-60 characters for better visibility',
    });
  } else if (titleLength > 60) {
    issues.push({
      type: 'warning',
      category: 'title',
      message: `Meta title may be truncated (${titleLength} characters)`,
      recommendation: 'Shorten your title to under 60 characters',
    });
  }

  // Analyze description
  const descriptionLength = crawledData.metaDescription.length;
  if (descriptionLength === 0) {
    issues.push({
      type: 'error',
      category: 'description',
      message: 'Missing meta description',
      recommendation: 'Add a compelling meta description between 150-160 characters',
    });
  } else if (descriptionLength < 120) {
    issues.push({
      type: 'warning',
      category: 'description',
      message: `Meta description is too short (${descriptionLength} characters)`,
      recommendation: 'Expand your description to 150-160 characters',
    });
  } else if (descriptionLength > 160) {
    issues.push({
      type: 'warning',
      category: 'description',
      message: `Meta description may be truncated (${descriptionLength} characters)`,
      recommendation: 'Shorten your description to under 160 characters',
    });
  }

  // Analyze H1
  const h1Count = crawledData.h1.length;
  if (h1Count === 0) {
    issues.push({
      type: 'error',
      category: 'h1',
      message: 'Missing H1 heading',
      recommendation: 'Add exactly one H1 heading that describes the page content',
    });
  } else if (h1Count > 1) {
    issues.push({
      type: 'warning',
      category: 'h1',
      message: `Multiple H1 headings found (${h1Count})`,
      recommendation: 'Use only one H1 heading per page',
    });
  }

  // Analyze heading structure
  const headingStructure = analyzeHeadingStructure(crawledData);
  if (!headingStructure.hasProperHierarchy) {
    headingStructure.issues.forEach((issue) => {
      issues.push({
        type: 'warning',
        category: 'headings',
        message: issue,
        recommendation: 'Ensure headings follow proper hierarchy (H1 > H2 > H3, etc.)',
      });
    });
  }

  // Analyze keywords
  const keywordAnalysis = analyzeKeywords(crawledData, keywords);
  if (keywords.primary.length > 0) {
    if (!keywordAnalysis.primaryInTitle) {
      issues.push({
        type: 'warning',
        category: 'keywords',
        message: 'Primary keyword not found in meta title',
        recommendation: 'Include the primary keyword in the first 30 characters of your title',
      });
    }
    if (!keywordAnalysis.primaryInH1) {
      issues.push({
        type: 'warning',
        category: 'keywords',
        message: 'Primary keyword not found in H1',
        recommendation: 'Include the primary keyword naturally in your H1 heading',
      });
    }
    if (!keywordAnalysis.primaryInFirst100Words) {
      issues.push({
        type: 'info',
        category: 'keywords',
        message: 'Primary keyword not found in first 100 words',
        recommendation: 'Include your primary keyword early in your content',
      });
    }
  }

  // Check for overused keywords
  keywordAnalysis.overusedKeywords.forEach((keyword) => {
    issues.push({
      type: 'warning',
      category: 'keywords',
      message: `Keyword "${keyword}" may be overused (>2.5% density)`,
      recommendation: 'Reduce keyword frequency to avoid appearing as keyword stuffing',
    });
  });

  // Check schema
  const schemaTypes = crawledData.schemaMarkup.map((s) => s.type);
  if (schemaTypes.length === 0) {
    issues.push({
      type: 'info',
      category: 'schema',
      message: 'No schema markup detected',
      recommendation: 'Add structured data to improve search appearance',
    });
  }

  // Calculate overall score
  const score = calculateSEOScore(issues, crawledData, keywords);

  return {
    currentTitle: crawledData.title,
    currentDescription: crawledData.metaDescription,
    currentH1: crawledData.h1[0] || '',
    titleLength,
    descriptionLength,
    h1Count,
    headingStructure,
    keywordAnalysis,
    schemaTypes,
    issues,
    score,
  };
}

function analyzeHeadingStructure(crawledData: CrawledData): HeadingStructure {
  const issues: string[] = [];
  let hasProperHierarchy = true;

  // Check for skipped heading levels
  const hasH2 = crawledData.h2.length > 0;
  const hasH3 = crawledData.h3.length > 0;
  const hasH4 = crawledData.h4.length > 0;
  const hasH5 = crawledData.h5.length > 0;
  const hasH6 = crawledData.h6.length > 0;

  if (hasH3 && !hasH2) {
    issues.push('H3 found without H2 - heading level skipped');
    hasProperHierarchy = false;
  }
  if (hasH4 && !hasH3) {
    issues.push('H4 found without H3 - heading level skipped');
    hasProperHierarchy = false;
  }
  if (hasH5 && !hasH4) {
    issues.push('H5 found without H4 - heading level skipped');
    hasProperHierarchy = false;
  }
  if (hasH6 && !hasH5) {
    issues.push('H6 found without H5 - heading level skipped');
    hasProperHierarchy = false;
  }

  return {
    h1: crawledData.h1,
    h2: crawledData.h2,
    h3: crawledData.h3,
    h4: crawledData.h4,
    h5: crawledData.h5,
    h6: crawledData.h6,
    hasProperHierarchy,
    issues,
  };
}

function analyzeKeywords(crawledData: CrawledData, keywords: KeywordData): KeywordAnalysisResult {
  const primaryKeywords = keywords.primary;
  const allKeywords = keywords.all;
  const content = crawledData.bodyContent.toLowerCase();
  const title = crawledData.title.toLowerCase();
  const description = crawledData.metaDescription.toLowerCase();
  const h1 = crawledData.h1[0]?.toLowerCase() || '';

  // Get first 100 words
  const first100Words = content.split(/\s+/).slice(0, 100).join(' ');

  // Check primary keyword presence
  const primaryInTitle = primaryKeywords.some((kw) =>
    title.includes(kw.toLowerCase())
  );
  const primaryInDescription = primaryKeywords.some((kw) =>
    description.includes(kw.toLowerCase())
  );
  const primaryInH1 = primaryKeywords.some((kw) =>
    h1.includes(kw.toLowerCase())
  );
  const primaryInFirst100Words = primaryKeywords.some((kw) =>
    first100Words.includes(kw.toLowerCase())
  );

  // Calculate keyword density
  const keywordDensity: Record<string, number> = {};
  const overusedKeywords: string[] = [];
  const missingKeywords: string[] = [];

  allKeywords.forEach((keyword) => {
    const density = calculateKeywordDensity(content, keyword);
    keywordDensity[keyword] = density;

    if (density > 2.5) {
      overusedKeywords.push(keyword);
    } else if (density === 0) {
      missingKeywords.push(keyword);
    }
  });

  return {
    primaryInTitle,
    primaryInDescription,
    primaryInH1,
    primaryInFirst100Words,
    keywordDensity,
    missingKeywords: missingKeywords.slice(0, 10), // Limit to first 10
    overusedKeywords,
  };
}

function calculateSEOScore(issues: SEOIssue[], crawledData: CrawledData, keywords: KeywordData): number {
  let score = 100;

  // Deduct points for issues
  issues.forEach((issue) => {
    switch (issue.type) {
      case 'error':
        score -= 15;
        break;
      case 'warning':
        score -= 8;
        break;
      case 'info':
        score -= 3;
        break;
    }
  });

  // Bonus points
  if (crawledData.schemaMarkup.length > 0) {
    score += 5;
  }
  if (crawledData.title.length >= 50 && crawledData.title.length <= 60) {
    score += 5;
  }
  if (crawledData.metaDescription.length >= 150 && crawledData.metaDescription.length <= 160) {
    score += 5;
  }
  if (crawledData.h1.length === 1) {
    score += 5;
  }
  if (keywords.primary.length > 0) {
    score += 3;
  }

  // Ensure score is between 0 and 100
  return Math.max(0, Math.min(100, score));
}
