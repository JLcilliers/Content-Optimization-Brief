/**
 * Keyword Processor - Filters and limits keywords for document output
 *
 * Ensures only relevant keywords are shown based on page context,
 * with a maximum of 5 keywords displayed with their search volumes.
 */

export interface KeywordWithVolume {
  keyword: string;
  volume: number | null;
  relevance?: number;
}

// Maximum keywords to display in document
const MAX_DISPLAY_KEYWORDS = 5;

// Page-specific exclusion patterns
// These terms are excluded when they don't match the page's primary topic
const EXCLUDED_KEYWORDS_BY_PAGE: Record<string, string[]> = {
  // Educators page shouldn't show booster club/PTA terms
  'educators-professional-liability': [
    'booster club',
    'band booster',
    'pta ',
    'pto ',
    'raffle',
    'embezzlement',
    'fidelity bond',
    'nonprofit event',
    'volunteer organization',
    'parent organization',
  ],
  // Booster club page shouldn't show teacher/educator terms
  'booster-club-insurance': [
    'teacher liability',
    'educator',
    'classroom',
    'student teacher',
    'principal',
    'school administrator',
  ],
  // PTA page exclusions
  'pta-insurance': [
    'teacher liability',
    'educator professional',
    'classroom',
    'band booster',
  ],
  // Nonprofit event exclusions
  'nonprofit-event-insurance': [
    'teacher liability',
    'educator',
    'classroom',
    'pta ',
    'pto ',
  ],
};

// Generic exclusion patterns that should never appear in keywords
const GENERIC_EXCLUSIONS = [
  'http://',
  'https://',
  'www.',
  '.com',
  '.org',
  '.net',
  '.pdf',
];

/**
 * Extract page slug from URL for matching exclusion rules
 */
function extractPageSlug(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    // Get the last meaningful segment of the path
    const segments = pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || '';
  } catch {
    // If URL parsing fails, try simple extraction
    const match = url.match(/\/([^\/]+)\/?$/);
    return match ? match[1] : '';
  }
}

/**
 * Check if a keyword should be excluded based on page context
 */
function shouldExcludeKeyword(keyword: string, pageSlug: string): boolean {
  const keywordLower = keyword.toLowerCase();

  // Check generic exclusions first
  for (const exclusion of GENERIC_EXCLUSIONS) {
    if (keywordLower.includes(exclusion)) {
      return true;
    }
  }

  // Check page-specific exclusions
  for (const [slugPattern, exclusions] of Object.entries(EXCLUDED_KEYWORDS_BY_PAGE)) {
    if (pageSlug.includes(slugPattern) || slugPattern.includes(pageSlug)) {
      for (const exclusion of exclusions) {
        if (keywordLower.includes(exclusion.toLowerCase())) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Score a keyword for relevance based on page context
 * Higher score = more relevant
 */
function scoreKeywordRelevance(keyword: string, pageSlug: string, pageTitle?: string): number {
  const keywordLower = keyword.toLowerCase();
  const slugLower = pageSlug.toLowerCase();
  const titleLower = (pageTitle || '').toLowerCase();

  let score = 50; // Base score

  // Boost if keyword appears in slug
  if (slugLower.includes(keywordLower.replace(/\s+/g, '-'))) {
    score += 30;
  }

  // Boost if keyword appears in page title
  if (titleLower.includes(keywordLower)) {
    score += 20;
  }

  // Boost for key insurance terms on insurance pages
  if (slugLower.includes('insurance') || slugLower.includes('liability')) {
    if (keywordLower.includes('insurance') || keywordLower.includes('liability') || keywordLower.includes('coverage')) {
      score += 15;
    }
  }

  // Boost for page-specific terms
  if (slugLower.includes('educator') && keywordLower.includes('educator')) {
    score += 25;
  }
  if (slugLower.includes('teacher') && keywordLower.includes('teacher')) {
    score += 25;
  }
  if (slugLower.includes('booster') && keywordLower.includes('booster')) {
    score += 25;
  }
  if (slugLower.includes('pta') && keywordLower.includes('pta')) {
    score += 25;
  }

  // Penalize very short keywords (likely too generic)
  if (keyword.length < 5) {
    score -= 10;
  }

  // Boost for longer, more specific keywords
  if (keyword.split(' ').length >= 3) {
    score += 10;
  }

  return score;
}

/**
 * Filter and limit keywords for document display
 *
 * @param keywords - All available keywords from SurferSEO or manual input
 * @param pageUrl - The URL of the page being optimized
 * @param pageTitle - Optional page title for additional context
 * @param searchVolumes - Optional map of keyword -> search volume
 * @returns Array of max 5 relevant keywords with volumes
 */
export function filterAndLimitKeywords(
  keywords: {
    primary: string[];
    secondary: string[];
    nlpTerms: string[];
  },
  pageUrl: string,
  pageTitle?: string,
  searchVolumes?: Map<string, number>
): KeywordWithVolume[] {
  const pageSlug = extractPageSlug(pageUrl);

  console.log(`[keyword-processor] Filtering keywords for page: ${pageSlug}`);

  // Combine all keywords, prioritizing primary > secondary > nlp
  const allKeywords: Array<{ keyword: string; priority: number }> = [];

  // Primary keywords get highest priority
  keywords.primary.forEach((kw, idx) => {
    allKeywords.push({ keyword: kw, priority: 100 - idx });
  });

  // Secondary keywords get medium priority
  keywords.secondary.forEach((kw, idx) => {
    allKeywords.push({ keyword: kw, priority: 50 - idx });
  });

  // NLP terms get lower priority
  keywords.nlpTerms.forEach((kw, idx) => {
    allKeywords.push({ keyword: kw, priority: 20 - idx * 0.5 });
  });

  // Remove duplicates (case-insensitive), keeping highest priority version
  const seen = new Map<string, { keyword: string; priority: number }>();
  for (const item of allKeywords) {
    const keyLower = item.keyword.toLowerCase().trim();
    if (!seen.has(keyLower) || seen.get(keyLower)!.priority < item.priority) {
      seen.set(keyLower, item);
    }
  }

  // Filter out excluded keywords and score remaining
  const scoredKeywords: Array<{
    keyword: string;
    priority: number;
    relevanceScore: number;
    volume: number | null;
  }> = [];

  for (const [, item] of seen) {
    // Skip if keyword should be excluded for this page
    if (shouldExcludeKeyword(item.keyword, pageSlug)) {
      console.log(`[keyword-processor] Excluding: "${item.keyword}" (not relevant to ${pageSlug})`);
      continue;
    }

    // Skip very short or empty keywords
    if (!item.keyword || item.keyword.trim().length < 3) {
      continue;
    }

    const relevanceScore = scoreKeywordRelevance(item.keyword, pageSlug, pageTitle);
    const volume = searchVolumes?.get(item.keyword.toLowerCase()) ?? null;

    scoredKeywords.push({
      keyword: item.keyword,
      priority: item.priority,
      relevanceScore,
      volume,
    });
  }

  // Sort by combined score (relevance + priority)
  scoredKeywords.sort((a, b) => {
    const scoreA = a.relevanceScore + a.priority;
    const scoreB = b.relevanceScore + b.priority;
    return scoreB - scoreA;
  });

  // Take top MAX_DISPLAY_KEYWORDS
  const topKeywords = scoredKeywords.slice(0, MAX_DISPLAY_KEYWORDS);

  console.log(`[keyword-processor] Selected ${topKeywords.length} keywords from ${scoredKeywords.length} candidates`);
  topKeywords.forEach((kw, idx) => {
    console.log(`  ${idx + 1}. "${kw.keyword}" (score: ${kw.relevanceScore + kw.priority}, vol: ${kw.volume ?? 'N/A'})`);
  });

  // Return in KeywordWithVolume format
  return topKeywords.map(kw => ({
    keyword: kw.keyword,
    volume: kw.volume,
    relevance: kw.relevanceScore,
  }));
}

/**
 * Format keywords for display in document
 * Returns a comma-separated string of keywords
 */
export function formatKeywordsForDocument(keywords: KeywordWithVolume[]): string {
  return keywords
    .map(kw => kw.keyword)
    .join(', ');
}
