import Anthropic from '@anthropic-ai/sdk';
import type { CrawledData, KeywordData, Settings, OptimizedContent, FAQ, SchemaRecommendation } from '@/types';

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

export async function optimizeContent(
  crawledData: CrawledData,
  keywords: KeywordData,
  settings: Settings
): Promise<OptimizedContent> {
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const client = new Anthropic({ apiKey: anthropicApiKey });

  // The key change: Prompt focuses on PRESERVING original content with MINIMAL changes
  const systemPrompt = `You are an SEO content optimizer. Your job is to make MINIMAL, SURGICAL changes to existing content to improve SEO rankings.

## CRITICAL RULES - READ CAREFULLY:

1. **PRESERVE 90%+ of the original content EXACTLY as written**
2. **DO NOT rewrite paragraphs** - only insert keywords into existing sentences
3. **DO NOT change the content structure** - keep the same sections and flow
4. **DO NOT change the brand voice** or writing style
5. **Make surgical, targeted changes** - not wholesale rewrites

## WHAT YOU CAN CHANGE:
✅ Insert a target keyword naturally into an existing sentence
✅ Slightly adjust a phrase to include a keyword (keep meaning identical)
✅ Add a keyword to an existing heading
✅ Add 1-2 NEW sentences ONLY if content is very thin on a topic (mark with [[NEW]])
✅ Suggest adding an FAQ section at the end (mark entire section with [[NEW FAQ SECTION]])

## WHAT YOU CANNOT CHANGE:
❌ Rewrite entire paragraphs
❌ Change the meaning or intent of any sentence
❌ Add new sections in the middle of existing content
❌ Remove or significantly alter existing content
❌ Change the brand's voice, tone, or style
❌ Restructure the page layout

## OUTPUT FORMAT:
Return the optimized content with change markers:
- Use [[KEYWORD: term]] to mark where you inserted a keyword
- Use [[ADJUSTED: original → new]] for slight phrase adjustments
- Use [[NEW]] for any new sentences added
- Use [[NEW FAQ SECTION]] to mark FAQs you've added

Example of correct optimization:
ORIGINAL: "We have been protecting educators for over 30 years."
OPTIMIZED: "We have been protecting educators with [[KEYWORD: professional liability insurance]] for over 30 years."

ORIGINAL: "Our team helps teachers every day."
OPTIMIZED: "Our team helps [[ADJUSTED: teachers → educators and teachers]] with [[KEYWORD: liability coverage]] every day."

Content Tone: ${settings.tone}
Brand Name: ${settings.brandName || 'The business'}`;

  // First, send the original content to get the preserved + optimized version
  const contentOptimizationPrompt = `Optimize this webpage content with MINIMAL changes. Preserve the original text and only insert keywords where they fit naturally.

## ORIGINAL PAGE CONTENT:
"""
${crawledData.bodyContent.substring(0, 8000)}
"""

## CURRENT META ELEMENTS:
- Title: ${crawledData.title}
- Description: ${crawledData.metaDescription}
- H1: ${crawledData.h1.join(', ') || 'None'}

## TARGET KEYWORDS TO INTEGRATE:
Primary Keywords (MUST include 2-3 times): ${keywords.primary.slice(0, 5).join(', ') || 'None provided'}
Secondary Keywords (include 1-2 times each): ${keywords.secondary.slice(0, 10).join(', ') || 'None provided'}
NLP Terms (sprinkle naturally): ${keywords.nlpTerms.slice(0, 15).join(', ') || 'None provided'}

## YOUR TASK:
1. Read through the original content carefully
2. Identify natural places to insert keywords WITHOUT changing the meaning
3. Return the content with minimal changes marked using [[KEYWORD: term]], [[ADJUSTED:]], or [[NEW]]
4. Count your changes - aim for 10-20 keyword insertions across the entire content, not a complete rewrite

## RESPOND WITH JSON:
{
  "metaTitle": "Optimized title (50-60 chars, add primary keyword to existing title style if possible${settings.brandName ? `, keep " | ${settings.brandName}" at end` : ''})",
  "metaDescription": "Keep similar to original but add primary keyword and a CTA (150-160 chars)",
  "h1": "Similar to original H1 but with primary keyword added naturally",
  "fullContent": "The ORIGINAL content with MINIMAL keyword insertions marked. Keep 90%+ identical to original.",
  "changesSummary": "Brief list of the specific changes you made",
  "faqs": [
    {"question": "Relevant FAQ 1?", "answer": "Answer based on page content"},
    {"question": "Relevant FAQ 2?", "answer": "Answer based on page content"},
    {"question": "Relevant FAQ 3?", "answer": "Answer based on page content"}
  ]
}

CRITICAL: The fullContent should be recognizably the SAME content as the original, just with keywords inserted. If you rewrite it, you have failed the task.`;

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
