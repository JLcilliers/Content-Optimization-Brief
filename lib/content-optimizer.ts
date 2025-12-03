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

  const systemPrompt = `You are an expert SEO content specialist with deep knowledge of Google's algorithms, E-E-A-T principles, and modern AI search optimization. You write content that:

1. Ranks well in traditional search
2. Gets featured in AI overviews and featured snippets
3. Sounds natural and human-written
4. Provides genuine value to readers
5. Integrates keywords seamlessly without stuffing
6. Follows the client's brand voice and industry terminology

NEVER:
- Stuff keywords unnaturally
- Write generic filler content
- Use clickbait or misleading statements
- Ignore the existing page's purpose
- Create duplicate content

ALWAYS:
- Maintain the page's original intent
- Improve upon existing good content
- Add value through better structure and clarity
- Consider the user's search intent
- Include actionable information

Content Tone: ${settings.tone}
Brand Name: ${settings.brandName || 'Not specified'}`;

  const userPrompt = `Analyze and optimize this webpage for SEO:

URL: ${crawledData.url}
Current Title: ${crawledData.title}
Current Meta Description: ${crawledData.metaDescription}
Current H1: ${crawledData.h1.join(', ') || 'None'}
Word Count: ${crawledData.wordCount}

Current Content (excerpt):
${crawledData.bodyContent.substring(0, 3000)}

Target Keywords:
Primary: ${keywords.primary.join(', ') || 'None provided'}
Secondary: ${keywords.secondary.join(', ') || 'None provided'}
NLP Terms: ${keywords.nlpTerms.join(', ') || 'None provided'}
Question Keywords: ${keywords.questions.join(', ') || 'None provided'}

Please provide optimized content in the following JSON format ONLY (no additional text):
{
  "metaTitle": "Optimized title (50-60 chars, primary keyword in first 30 chars${settings.brandName ? `, end with " | ${settings.brandName}"` : ''})",
  "metaDescription": "Compelling description (150-160 chars, include primary keyword and CTA)",
  "h1": "New H1 (different from title, includes primary keyword naturally)",
  "fullContent": "Complete optimized page content with proper markdown formatting using ## for H2, ### for H3, bullet points, etc. The content should be well-structured, include natural keyword integration, and provide value to readers. Include 2-4 H2 sections with relevant H3 subsections.",
  "faqs": [
    {"question": "FAQ question 1?", "answer": "Detailed answer 1"},
    {"question": "FAQ question 2?", "answer": "Detailed answer 2"},
    {"question": "FAQ question 3?", "answer": "Detailed answer 3"}
  ]
}

Important requirements:
1. Meta title MUST be between 50-60 characters
2. Meta description MUST be between 150-160 characters
3. H1 MUST be different from the meta title
4. Include primary keyword early in title and naturally in H1
5. Full content should be comprehensive and well-structured
6. FAQs should be relevant to the topic and include keywords naturally
7. Respond ONLY with the JSON object, no other text`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: userPrompt,
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
    // Try to extract JSON from the response (handle potential markdown code blocks)
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
  } catch {
    console.error('Failed to parse AI response:', textContent.text);
    throw new Error('Failed to parse AI optimization response');
  }

  // Generate schema recommendations
  const schemaRecommendations = settings.includeSchemaRecommendations
    ? generateSchemaRecommendations(crawledData, optimizedData)
    : [];

  return {
    metaTitle: optimizedData.metaTitle || '',
    metaDescription: optimizedData.metaDescription || '',
    h1: optimizedData.h1 || '',
    fullContent: optimizedData.fullContent || '',
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
