import Anthropic from '@anthropic-ai/sdk';
import type { CrawledData, KeywordData, Settings, OptimizedContent, FAQ, SchemaRecommendation, CustomInstructions } from '@/types';
import { filterAndLimitKeywords } from './keyword-processor';

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

export async function optimizeContent(
  crawledData: CrawledData,
  keywords: KeywordData,
  settings: Settings,
  customInstructions?: CustomInstructions
): Promise<OptimizedContent> {
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const client = new Anthropic({ apiKey: anthropicApiKey });

  // The key change: Prompt focuses on PRESERVING original content with MINIMAL changes
  // Output uses structured markers for clean document generation
  const systemPrompt = `You are an SEO content optimizer. Your job is to make MINIMAL, GRAMMATICALLY CORRECT changes to existing content.

## CRITICAL RULES - READ CAREFULLY

### Rule 1: PRESERVE ORIGINAL CONTENT
- Keep 85-95% of the original content EXACTLY as written
- Do NOT rewrite paragraphs
- Do NOT change the content structure
- Do NOT add new sections unless absolutely necessary

### Rule 2: GRAMMAR IS MANDATORY
- NEVER append keywords to sentence ends without proper grammar
- NEVER create run-on sentences
- NEVER create grammatically incorrect text
- Every optimized sentence must read naturally aloud

### Rule 3: ONE KEYWORD PER SENTENCE
- Do NOT stack multiple keywords in one sentence
- Distribute keywords throughout the content naturally
- Maximum 10-15 keyword insertions total

### Rule 4: VARIATIONS OVER REPETITION
- Use synonyms and variations of keywords
- Don't repeat the exact same keyword phrase more than 2-3 times

## GRAMMAR EXAMPLES

CORRECT keyword integration:
"While many school districts offer teachers a form of educator's insurance, they don't provide [[KEYWORD: liability insurance coverage]] if the district takes action against you."

WRONG - keyword appended without grammar:
"While many school districts offer teachers a form of educator's insurance, they don't provide coverage if the district takes action against you teacher liability insurance coverage."

WRONG - multiple keywords stacked:
"Our [[KEYWORD: teacher liability insurance]] provides [[KEYWORD: professional liability coverage]] with [[KEYWORD: educator protection]]."

## WHAT YOU CAN CHANGE
✅ Insert a keyword into an existing sentence (grammatically correct)
✅ Add a brief clarifying phrase containing a keyword
✅ Slightly rephrase to include a keyword (preserve meaning)
✅ Add 1-2 new sentences if content is very thin (mark with [[NEW]])
✅ Add FAQ section at end only (mark with [[NEW FAQ SECTION]])

## WHAT YOU CANNOT CHANGE
❌ Rewrite entire paragraphs
❌ Change content meaning or intent
❌ Append keywords to sentence ends without grammar
❌ Stack multiple keywords in one sentence
❌ Add keywords from unrelated page topics
❌ Create duplicate sections (like FAQ appearing twice)
❌ Use markdown or HTML

## OUTPUT FORMAT

Use ONLY these structured markers:

Headings:
- [H1] Heading text (only ONE H1 allowed)
- [H2] Subheading text
- [H3] Sub-subheading text

Content:
- [PARA] Paragraph text
- [BULLET] Bullet point text

Change markers (embed within text):
- [[KEYWORD: term]] - inserted keyword (will be highlighted green)
- [[ADJUSTED: original → new]] - rephrased content
- [[NEW]] - entirely new content

Example output:
[H1] Comprehensive [[KEYWORD: Professional Liability Insurance]] for Educators
[PARA] We have been protecting educators with [[KEYWORD: professional liability insurance]] for over 30 years. Our dedicated team understands the unique challenges you face.
[H2] Why Choose Our Coverage
[PARA] Our team helps [[ADJUSTED: teachers → educators and teachers]] with [[KEYWORD: liability coverage]] every day.
[BULLET] Coverage for legal defense costs
[BULLET] Protection against student claims

Content Tone: ${settings.tone}
Brand Name: ${settings.brandName || 'The business'}`;

  // Build custom instructions section if any are provided
  let customInstructionsSection = '';
  if (customInstructions) {
    const sections: string[] = [];

    if (customInstructions.thingsToAvoid?.trim()) {
      sections.push(`### Things to Avoid (DO NOT include these):\n${customInstructions.thingsToAvoid.trim()}`);
    }

    if (customInstructions.focusAreas?.trim()) {
      sections.push(`### Focus Areas (Emphasize these):\n${customInstructions.focusAreas.trim()}`);
    }

    if (customInstructions.toneAndStyle?.trim()) {
      sections.push(`### Tone & Style Guidelines:\n${customInstructions.toneAndStyle.trim()}`);
    }

    if (customInstructions.additionalInstructions?.trim()) {
      sections.push(`### Additional Instructions:\n${customInstructions.additionalInstructions.trim()}`);
    }

    if (sections.length > 0) {
      customInstructionsSection = `\n\n## CUSTOM INSTRUCTIONS FROM USER\nFollow these specific guidelines provided by the user:\n\n${sections.join('\n\n')}`;
    }
  }

  // Filter keywords to only those relevant to this page BEFORE sending to AI
  const filteredKeywords = filterAndLimitKeywords(
    keywords,
    crawledData.url,
    crawledData.title
  );

  // Get primary keyword (first one) and secondary keywords (rest)
  const primaryKeyword = filteredKeywords[0]?.keyword || keywords.primary[0] || '';
  const secondaryKeywords = filteredKeywords.slice(1).map(k => k.keyword);

  console.log('[content-optimizer] Filtered keywords for AI:', filteredKeywords.map(k => k.keyword));

  // First, send the original content to get the preserved + optimized version
  const contentOptimizationPrompt = `Optimize this webpage content with MINIMAL, GRAMMATICALLY CORRECT changes.

## PAGE CONTEXT
URL: ${crawledData.url}
Page Topic: ${crawledData.title}

## ORIGINAL PAGE CONTENT
"""
${crawledData.bodyContent.substring(0, 8000)}
"""

## CURRENT META ELEMENTS
- Title: ${crawledData.title}
- Description: ${crawledData.metaDescription}
- H1: ${crawledData.h1.join(', ') || 'None'}

## TARGET KEYWORDS (Pre-filtered for this page)
PRIMARY KEYWORD (integrate 2-3 times): ${primaryKeyword || 'None provided'}
SECONDARY KEYWORDS (integrate 1-2 times each): ${secondaryKeywords.join(', ') || 'None provided'}

Note: These keywords have been pre-filtered to match this specific page. Do NOT use other keywords.
${customInstructionsSection}

## YOUR TASK
1. Read through the original content carefully
2. Insert keywords into existing sentences WITH PROPER GRAMMAR
3. Do NOT append keywords to sentence ends
4. Do NOT stack multiple keywords in one sentence
5. Aim for 10-15 total keyword insertions maximum
6. Mark changes with [[KEYWORD: term]], [[ADJUSTED:]], or [[NEW]]

## RESPOND WITH JSON
{
  "metaTitle": "50-60 chars, primary keyword in first 30 chars${settings.brandName ? `, end with ' | ${settings.brandName}'` : ''}",
  "metaDescription": "150-160 chars, include primary keyword and a call-to-action",
  "h1": "Similar to original H1 with primary keyword added naturally (must differ from title)",
  "fullContent": "Structured content using [H1], [H2], [H3], [PARA], [BULLET]. Only ONE [H1]. Keep 85-95% identical to original.",
  "changesSummary": "List of specific changes made",
  "faqs": [
    {"question": "Relevant FAQ?", "answer": "Answer based on page content"}
  ]
}

## VALIDATION CHECKLIST (verify before responding)
- [ ] Only ONE [H1] in fullContent
- [ ] No duplicate FAQ sections
- [ ] All keyword insertions are grammatically correct
- [ ] No keywords appended to sentence ends
- [ ] No multiple keywords in same sentence
- [ ] No markdown or HTML
- [ ] Title tag differs from H1`;

  console.log('[content-optimizer] Sending preservation-focused prompt to Claude...');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: contentOptimizationPrompt,
      },
    ],
    system: systemPrompt,
  });

  // Extract text content from response
  const textContent = response.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from AI');
  }

  // Parse JSON response
  let optimizedData;
  try {
    let jsonString = textContent.text.trim();
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.slice(7);
    }
    if (jsonString.startsWith('```')) {
      jsonString = jsonString.slice(3);
    }
    if (jsonString.endsWith('```')) {
      jsonString = jsonString.slice(0, -3);
    }
    optimizedData = JSON.parse(jsonString.trim());

    console.log('[content-optimizer] Changes summary:', optimizedData.changesSummary);
  } catch {
    console.error('Failed to parse AI response:', textContent.text);
    throw new Error('Failed to parse AI optimization response');
  }

  // Clean the change markers from fullContent for display
  // But store them for the document generator to use for highlighting
  const fullContentWithMarkers = optimizedData.fullContent || '';

  // Generate schema recommendations
  const schemaRecommendations = settings.includeSchemaRecommendations
    ? generateSchemaRecommendations(crawledData, optimizedData)
    : [];

  return {
    metaTitle: optimizedData.metaTitle || '',
    metaDescription: optimizedData.metaDescription || '',
    h1: optimizedData.h1 || '',
    fullContent: fullContentWithMarkers,
    faqs: optimizedData.faqs || [],
    schemaRecommendations,
  };
}

function generateSchemaRecommendations(
  crawledData: CrawledData,
  optimizedData: { faqs?: FAQ[] }
): SchemaRecommendation[] {
  const recommendations: SchemaRecommendation[] = [];
  const url = crawledData.url.toLowerCase();
  const content = crawledData.bodyContent.toLowerCase();
  const existingSchemaTypes = crawledData.schemaMarkup.map((s) => s.type.toLowerCase());

  // FAQPage schema if FAQs exist
  if (optimizedData.faqs && optimizedData.faqs.length > 0 && !existingSchemaTypes.includes('faqpage')) {
    const faqSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: optimizedData.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    };

    recommendations.push({
      type: 'FAQPage',
      reason: 'Add FAQ schema to enable rich FAQ snippets in search results',
      jsonLd: JSON.stringify(faqSchema, null, 2),
    });
  }

  // Article/BlogPosting schema for blog-like content
  if (
    (url.includes('/blog') || url.includes('/article') || url.includes('/news') || url.includes('/post')) &&
    !existingSchemaTypes.includes('article') &&
    !existingSchemaTypes.includes('blogposting')
  ) {
    recommendations.push({
      type: 'Article/BlogPosting',
      reason: 'Add Article schema for blog posts to improve search visibility',
      jsonLd: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: optimizedData.faqs ? 'Your Article Title' : crawledData.title,
        description: crawledData.metaDescription,
        author: { '@type': 'Organization', name: 'Your Organization' },
        publisher: { '@type': 'Organization', name: 'Your Organization' },
        datePublished: new Date().toISOString().split('T')[0],
      }, null, 2),
    });
  }

  // Service schema for service pages
  if (
    (url.includes('/service') || url.includes('/what-we-do') || content.includes('our services')) &&
    !existingSchemaTypes.includes('service')
  ) {
    recommendations.push({
      type: 'Service',
      reason: 'Add Service schema to highlight your offerings in search results',
      jsonLd: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: 'Service Name',
        description: 'Service description',
        provider: { '@type': 'Organization', name: 'Your Organization' },
      }, null, 2),
    });
  }

  // LocalBusiness schema for location-based pages
  if (
    (url.includes('/location') || url.includes('/contact') || content.includes('visit us') || content.includes('our location')) &&
    !existingSchemaTypes.includes('localbusiness')
  ) {
    recommendations.push({
      type: 'LocalBusiness',
      reason: 'Add LocalBusiness schema to appear in local search results and Google Maps',
      jsonLd: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: 'Business Name',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '123 Main St',
          addressLocality: 'City',
          addressRegion: 'State',
          postalCode: '12345',
        },
        telephone: '+1-xxx-xxx-xxxx',
      }, null, 2),
    });
  }

  // HowTo schema for instructional content
  if (
    (content.includes('how to') || content.includes('step 1') || content.includes('step by step')) &&
    !existingSchemaTypes.includes('howto')
  ) {
    recommendations.push({
      type: 'HowTo',
      reason: 'Add HowTo schema for instructional content to get enhanced search snippets',
      jsonLd: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: 'How to...',
        step: [
          { '@type': 'HowToStep', text: 'Step 1 description' },
          { '@type': 'HowToStep', text: 'Step 2 description' },
        ],
      }, null, 2),
    });
  }

  return recommendations;
}
