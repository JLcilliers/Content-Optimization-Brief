/**
 * Content Differ - Parses AI-marked changes and extracts them for highlighting
 *
 * The AI marks changes with:
 * - [[KEYWORD: term]] - A keyword was inserted
 * - [[ADJUSTED: original → new]] - A phrase was adjusted
 * - [[NEW]] - New sentence added
 * - [[NEW FAQ SECTION]] - New FAQ section
 */

import * as Diff from 'diff';

export interface ContentChange {
  type: 'keyword' | 'adjusted' | 'new' | 'faq';
  text: string;
  reason?: string;
}

export interface ParsedContent {
  // The clean content without markers (for display)
  cleanContent: string;
  // Array of all changes for summary
  changes: ContentChange[];
  // Map of text segments that should be highlighted
  highlightSegments: string[];
}

/**
 * Parse content with AI change markers and extract changes
 */
export function parseMarkedContent(markedContent: string): ParsedContent {
  const changes: ContentChange[] = [];
  const highlightSegments: string[] = [];

  let cleanContent = markedContent;

  // Pattern for [[KEYWORD: term]]
  const keywordPattern = /\[\[KEYWORD:\s*([^\]]+)\]\]/g;
  let match;

  while ((match = keywordPattern.exec(markedContent)) !== null) {
    const keyword = match[1].trim();
    changes.push({ type: 'keyword', text: keyword });
    highlightSegments.push(keyword);
  }
  cleanContent = cleanContent.replace(keywordPattern, '$1');

  // Pattern for [[ADJUSTED: original → new]]
  const adjustedPattern = /\[\[ADJUSTED:\s*([^→]+)→\s*([^\]]+)\]\]/g;
  while ((match = adjustedPattern.exec(markedContent)) !== null) {
    const newText = match[2].trim();
    changes.push({
      type: 'adjusted',
      text: newText,
      reason: `Changed from "${match[1].trim()}" to "${newText}"`
    });
    highlightSegments.push(newText);
  }
  cleanContent = cleanContent.replace(adjustedPattern, '$2');

  // Pattern for [[NEW]] markers (the sentence before [[NEW]])
  const newPattern = /([^.!?]*[.!?])\s*\[\[NEW\]\]/g;
  while ((match = newPattern.exec(markedContent)) !== null) {
    const newSentence = match[1].trim();
    changes.push({ type: 'new', text: newSentence });
    highlightSegments.push(newSentence);
  }
  cleanContent = cleanContent.replace(/\[\[NEW\]\]/g, '');

  // Pattern for [[NEW FAQ SECTION]]
  if (markedContent.includes('[[NEW FAQ SECTION]]')) {
    changes.push({ type: 'faq', text: 'FAQ Section Added' });
  }
  cleanContent = cleanContent.replace(/\[\[NEW FAQ SECTION\]\]/g, '');

  // Clean up any remaining double brackets
  cleanContent = cleanContent.replace(/\[\[|\]\]/g, '');

  // Clean up extra whitespace
  cleanContent = cleanContent.replace(/\s+/g, ' ').trim();

  return {
    cleanContent,
    changes,
    highlightSegments
  };
}

/**
 * Check if a text segment should be highlighted based on the highlight segments list
 */
export function shouldHighlight(text: string, highlightSegments: string[]): boolean {
  const textLower = text.toLowerCase().trim();

  for (const segment of highlightSegments) {
    const segmentLower = segment.toLowerCase().trim();
    if (textLower.includes(segmentLower) || segmentLower.includes(textLower)) {
      return true;
    }
  }

  return false;
}

/**
 * Split text into segments, marking which ones should be highlighted
 * Returns array of { text, highlight } objects
 */
export function splitIntoHighlightSegments(
  text: string,
  highlightSegments: string[]
): Array<{ text: string; highlight: boolean }> {
  if (highlightSegments.length === 0) {
    return [{ text, highlight: false }];
  }

  const result: Array<{ text: string; highlight: boolean }> = [];
  let remaining = text;

  // Sort segments by length (longest first) to avoid partial matches
  const sortedSegments = [...highlightSegments].sort((a, b) => b.length - a.length);

  // Create a case-insensitive pattern for all highlight segments
  const escapedSegments = sortedSegments.map(s =>
    s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  const pattern = new RegExp(`(${escapedSegments.join('|')})`, 'gi');

  const parts = text.split(pattern);

  for (const part of parts) {
    if (!part) continue;

    const isHighlight = sortedSegments.some(
      seg => part.toLowerCase() === seg.toLowerCase()
    );

    result.push({ text: part, highlight: isHighlight });
  }

  return result;
}

/**
 * Compare original and optimized content using diff library
 * Returns segments with highlight info for word-level changes
 */
export function diffContent(
  original: string,
  optimized: string
): Array<{ text: string; highlight: boolean; type: 'same' | 'added' | 'removed' }> {
  const result: Array<{ text: string; highlight: boolean; type: 'same' | 'added' | 'removed' }> = [];

  // Use word-level diff for more granular changes
  const diffs = Diff.diffWords(original, optimized);

  for (const part of diffs) {
    if (part.added) {
      result.push({ text: part.value, highlight: true, type: 'added' });
    } else if (part.removed) {
      // Skip removed content (we don't show it)
      result.push({ text: '', highlight: false, type: 'removed' });
    } else {
      result.push({ text: part.value, highlight: false, type: 'same' });
    }
  }

  // Filter out empty segments
  return result.filter(r => r.text.length > 0);
}

/**
 * Generate a summary of changes made
 */
export function generateChangesSummary(changes: ContentChange[]): string {
  if (changes.length === 0) {
    return 'No changes made to original content.';
  }

  const keywordCount = changes.filter(c => c.type === 'keyword').length;
  const adjustedCount = changes.filter(c => c.type === 'adjusted').length;
  const newCount = changes.filter(c => c.type === 'new').length;
  const hasFaq = changes.some(c => c.type === 'faq');

  const parts: string[] = [];

  if (keywordCount > 0) {
    parts.push(`${keywordCount} keyword insertion${keywordCount > 1 ? 's' : ''}`);
  }
  if (adjustedCount > 0) {
    parts.push(`${adjustedCount} phrase adjustment${adjustedCount > 1 ? 's' : ''}`);
  }
  if (newCount > 0) {
    parts.push(`${newCount} new sentence${newCount > 1 ? 's' : ''}`);
  }
  if (hasFaq) {
    parts.push('FAQ section added');
  }

  return `Changes: ${parts.join(', ')}.`;
}
