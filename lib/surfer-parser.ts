import puppeteer, { Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export interface SurferTerm {
  term: string;
  currentCount: number | null;
  recommendedMin: number | null;
  recommendedMax: number | null;
  status: 'missing' | 'low' | 'good' | 'overused' | 'unknown';
}

export interface SurferReportData {
  success: boolean;
  mainKeyword: string;
  url: string;
  contentScore: number | null;
  wordCount: number | null;
  terms: SurferTerm[];
  questions: string[];
  headings: string[];
  error?: string;
}

export async function parseSurferAuditReport(reportUrl: string): Promise<SurferReportData> {
  // Validate URL
  if (!reportUrl.includes('surferseo.com')) {
    return {
      success: false,
      mainKeyword: '',
      url: reportUrl,
      contentScore: null,
      wordCount: null,
      terms: [],
      questions: [],
      headings: [],
      error: 'Invalid URL. Must be a SurferSEO audit link.'
    };
  }

  let browser: Browser | null = null;

  try {
    console.log('[Surfer Parser] Launching browser...');

    // Use @sparticuz/chromium for Vercel serverless compatibility
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    console.log('[Surfer Parser] Navigating to:', reportUrl);

    // Navigate with extended timeout
    await page.goto(reportUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for content to load
    console.log('[Surfer Parser] Waiting for content to load...');

    await Promise.race([
      page.waitForSelector('button', { timeout: 15000 }),
      page.waitForSelector('main', { timeout: 15000 })
    ]).catch(() => console.log('[Surfer Parser] Initial selectors not found, continuing...'));

    // Extra wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Click "Show details" button for Terms to Use section to reveal the terms table
    console.log('[Surfer Parser] Looking for Terms to Use section...');

    try {
      // Find and click the Show details button for Terms to Use
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        // Find button that's near "Terms to Use" text
        for (let i = 0; i < buttons.length; i++) {
          const btn = buttons[i];
          const parent = btn.closest('section, div');
          const parentText = parent?.textContent || '';
          if (parentText.includes('Terms to Use') && btn.textContent?.includes('Show details')) {
            (btn as HTMLButtonElement).click();
            return true;
          }
        }
        // Fallback: click the button at index 4 (usually Terms to Use based on page structure)
        if (buttons.length > 4 && buttons[4].textContent?.includes('Show details')) {
          (buttons[4] as HTMLButtonElement).click();
          return true;
        }
        return false;
      });

      // Wait for table to load after clicking
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('[Surfer Parser] Clicked Show details, waiting for table...');
    } catch (err) {
      console.log('[Surfer Parser] Could not click Show details button:', err);
    }

    console.log('[Surfer Parser] Extracting data...');

    // Extract all data from the page
    const extractedData = await page.evaluate(() => {
      const data: {
        mainKeyword: string;
        contentScore: number | null;
        wordCount: number | null;
        terms: Array<{
          term: string;
          currentCount: number | null;
          recommendedMin: number | null;
          recommendedMax: number | null;
          status: string;
        }>;
        questions: string[];
        headings: string[];
      } = {
        mainKeyword: '',
        contentScore: null,
        wordCount: null,
        terms: [],
        questions: [],
        headings: []
      };

      // Helper to safely get text
      const getText = (selector: string): string => {
        const el = document.querySelector(selector);
        return el?.textContent?.trim() || '';
      };

      // 1. Try to get main keyword from SurferSEO header
      // The header shows: "Audit / [flag] teacher liability insurance https://..."
      // Look for the keyword in header/nav area
      const headerText = document.querySelector('header, nav, [class*="header"]')?.textContent || '';

      // Try to extract keyword from header by looking for text between "/ " and "http"
      const headerKeywordMatch = headerText.match(/\/\s*[^\s]*\s+([^h]+?)(?:https?:|$)/i);
      if (headerKeywordMatch && headerKeywordMatch[1]) {
        data.mainKeyword = headerKeywordMatch[1].trim();
      }

      // Fallback to other selectors
      if (!data.mainKeyword) {
        const keywordSelectors = [
          'h1',
          '[class*="keyword" i]',
          '[class*="query" i]',
          '[data-testid*="keyword"]',
          '.audit-keyword'
        ];

        for (const sel of keywordSelectors) {
          const text = getText(sel);
          if (text && text.length < 100 && !text.includes('\n') && !text.includes('http')) {
            data.mainKeyword = text;
            break;
          }
        }
      }

      // 2. Try to get content score
      const scoreRegex = /(\d{1,3})(?:\s*\/\s*100|\s*%)?/;
      const scoreSelectors = [
        '[class*="score" i]',
        '[class*="Score"]',
        '[data-testid*="score"]'
      ];

      for (const sel of scoreSelectors) {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
          const text = el.textContent || '';
          const match = text.match(scoreRegex);
          if (match && parseInt(match[1]) <= 100) {
            data.contentScore = parseInt(match[1]);
            break;
          }
        }
        if (data.contentScore) break;
      }

      // 3. Try to get word count
      const wordCountRegex = /(\d{1,5})\s*words?/i;
      const bodyText = document.body.textContent || '';
      const wordMatch = bodyText.match(wordCountRegex);
      if (wordMatch) {
        data.wordCount = parseInt(wordMatch[1]);
      }

      // 4. Extract terms/keywords - this is the main data we need
      // SurferSEO displays terms in a list with usage counts
      const termContainers = document.querySelectorAll(
        '[class*="term" i], [class*="Term"], [class*="phrase" i], [class*="keyword-item"], li[class*="item"]'
      );

      termContainers.forEach(container => {
        const text = container.textContent?.trim() || '';

        // Skip if too long or too short
        if (text.length < 2 || text.length > 200) return;

        // Try to parse "term 2/5" or "term (2-5)" format
        const termMatch = text.match(/^(.+?)\s*(?:(\d+)\s*\/\s*(\d+)|(\d+)\s*-\s*(\d+)|\((\d+)\s*-\s*(\d+)\))?$/);

        if (termMatch) {
          const term = termMatch[1].replace(/[•\-\*]/g, '').trim();
          if (term.length < 2) return;

          // Determine counts
          let currentCount: number | null = null;
          let recommendedMin: number | null = null;
          let recommendedMax: number | null = null;

          if (termMatch[2] && termMatch[3]) {
            currentCount = parseInt(termMatch[2]);
            recommendedMax = parseInt(termMatch[3]);
            recommendedMin = Math.max(1, recommendedMax - 2);
          } else if (termMatch[4] && termMatch[5]) {
            recommendedMin = parseInt(termMatch[4]);
            recommendedMax = parseInt(termMatch[5]);
          } else if (termMatch[6] && termMatch[7]) {
            recommendedMin = parseInt(termMatch[6]);
            recommendedMax = parseInt(termMatch[7]);
          }

          // Determine status based on styling or content
          let status = 'unknown';
          const classList = container.className.toLowerCase();
          const style = window.getComputedStyle(container);
          const color = style.color;

          if (classList.includes('missing') || classList.includes('red') || color.includes('255, 0') || color.includes('239, 68')) {
            status = 'missing';
          } else if (classList.includes('low') || classList.includes('yellow') || classList.includes('warning')) {
            status = 'low';
          } else if (classList.includes('good') || classList.includes('green') || classList.includes('success')) {
            status = 'good';
          } else if (classList.includes('over') || classList.includes('high')) {
            status = 'overused';
          }

          data.terms.push({
            term,
            currentCount,
            recommendedMin,
            recommendedMax,
            status
          });
        }
      });

      // 5. Extract from SurferSEO's table format (tr/td structure)
      // This is the primary extraction method for audit reports
      const tableRows = document.querySelectorAll('tr');
      tableRows.forEach((row, index) => {
        if (index === 0) return; // Skip header row

        const cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
          // Column structure: term | example | you | suggested | sentiment | relevance | search volume | action
          const termCell = cells[0];
          const termText = termCell?.textContent?.trim().replace('NLP', '').trim() || '';
          const yourCount = cells[2]?.textContent?.trim() || '0';
          const suggestedCount = cells[3]?.textContent?.trim() || '1';

          if (termText && termText.length > 1 && termText.length < 100) {
            // Parse suggested count (can be "1" or "2-7" format)
            let recommendedMin: number | null = null;
            let recommendedMax: number | null = null;

            const rangeMatch = suggestedCount.match(/(\d+)\s*-\s*(\d+)/);
            if (rangeMatch) {
              recommendedMin = parseInt(rangeMatch[1]);
              recommendedMax = parseInt(rangeMatch[2]);
            } else {
              const singleMatch = suggestedCount.match(/(\d+)/);
              if (singleMatch) {
                recommendedMin = 1;
                recommendedMax = parseInt(singleMatch[1]);
              }
            }

            const currentCount = parseInt(yourCount) || 0;

            // Determine status based on current vs recommended
            let status = 'missing';
            if (currentCount > 0) {
              if (recommendedMin && recommendedMax) {
                if (currentCount < recommendedMin) status = 'low';
                else if (currentCount > recommendedMax) status = 'overused';
                else status = 'good';
              } else {
                status = 'good';
              }
            }

            data.terms.push({
              term: termText,
              currentCount,
              recommendedMin,
              recommendedMax,
              status
            });
          }
        }
      });

      // 6. Extract questions (often in a separate section)
      const questionSelectors = [
        '[class*="question" i] li',
        '[class*="Question"] li',
        '[class*="heading-suggestion"]'
      ];

      questionSelectors.forEach(sel => {
        try {
          const elements = document.querySelectorAll(sel);
          elements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.includes('?') && text.length < 200) {
              data.questions.push(text);
            }
          });
        } catch {
          // Selector not supported
        }
      });

      // Also check for any text containing question marks
      if (data.questions.length === 0) {
        const allText = document.body.innerText;
        const questionRegex = /([A-Z][^.!?]*\?)/g;
        const matches = allText.match(questionRegex);
        if (matches) {
          data.questions = matches
            .filter(q => q.length > 10 && q.length < 150)
            .slice(0, 10);
        }
      }

      // 7. Extract heading suggestions
      const headingSelectors = [
        '[class*="heading" i] li',
        '[class*="Heading"] li',
        '[class*="h2-suggestion"]',
        '[class*="structure"] li'
      ];

      headingSelectors.forEach(sel => {
        try {
          const elements = document.querySelectorAll(sel);
          elements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length > 3 && text.length < 100) {
              data.headings.push(text);
            }
          });
        } catch {
          // Selector not supported
        }
      });

      return data;
    });

    // Deduplicate terms
    const uniqueTerms = Array.from(
      new Map(extractedData.terms.map((t) => [t.term.toLowerCase(), t])).values()
    ) as SurferTerm[];

    // Deduplicate questions
    const uniqueQuestions = [...new Set(extractedData.questions)];

    console.log(`[Surfer Parser] Extracted ${uniqueTerms.length} terms, ${uniqueQuestions.length} questions`);

    return {
      success: true,
      mainKeyword: extractedData.mainKeyword,
      url: reportUrl,
      contentScore: extractedData.contentScore,
      wordCount: extractedData.wordCount,
      terms: uniqueTerms,
      questions: uniqueQuestions,
      headings: extractedData.headings
    };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Surfer Parser] Error:', errorMessage);
    return {
      success: false,
      mainKeyword: '',
      url: reportUrl,
      contentScore: null,
      wordCount: null,
      terms: [],
      questions: [],
      headings: [],
      error: errorMessage
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Helper function to combine multiple Surfer reports
export function combineSurferReports(reports: SurferReportData[]): {
  allTerms: SurferTerm[];
  allQuestions: string[];
  primaryKeywords: string[];
} {
  const termMap = new Map<string, SurferTerm>();
  const allQuestions: string[] = [];
  const primaryKeywords: string[] = [];

  for (const report of reports) {
    if (!report.success) continue;

    if (report.mainKeyword) {
      primaryKeywords.push(report.mainKeyword);
    }

    for (const term of report.terms) {
      const key = term.term.toLowerCase();
      if (!termMap.has(key)) {
        termMap.set(key, term);
      }
    }

    allQuestions.push(...report.questions);
  }

  return {
    allTerms: Array.from(termMap.values()),
    allQuestions: [...new Set(allQuestions)],
    primaryKeywords: [...new Set(primaryKeywords)]
  };
}
