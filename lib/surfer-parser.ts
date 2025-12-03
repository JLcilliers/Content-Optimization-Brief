import puppeteer, { Browser } from 'puppeteer-core';

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
  debug?: {
    pageTitle?: string;
    url?: string;
    extractionMethod?: string;
    pageContent?: {
      bodyLength: number;
      hasTable: boolean;
      hasTr: number;
      hasTermClass: number;
      hasRowClass: number;
      visibleTextSample: string;
    };
  };
}

// Track if we're using Browserless.io (for proper cleanup)
let usingBrowserless = false;

async function getBrowser(): Promise<Browser> {
  const browserlessToken = process.env.BROWSERLESS_TOKEN;

  // Production: Use Browserless.io cloud browser with stealth mode
  if (browserlessToken) {
    console.log('[Surfer Parser] Connecting to Browserless.io with stealth mode...');
    usingBrowserless = true;

    // Add stealth and block detection params
    const wsEndpoint = `wss://chrome.browserless.io?token=${browserlessToken}&stealth=true&blockAds=true`;

    return puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
    });
  }

  // Local development: Use local Puppeteer
  if (process.env.NODE_ENV === 'development') {
    console.log('[Surfer Parser] Using local Puppeteer for development...');
    usingBrowserless = false;
    // Dynamic import for dev only (puppeteer is a dev dependency)
    const puppeteerFull = await import('puppeteer');
    return puppeteerFull.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }

  throw new Error('BROWSERLESS_TOKEN environment variable is required in production');
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
  const debugInfo: SurferReportData['debug'] = {};

  try {
    console.log('[Surfer Parser] Launching browser...');

    browser = await getBrowser();

    const page = await browser.newPage();

    // Enhanced stealth settings
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    // Set extra headers to appear more human
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // Mask webdriver detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      // @ts-ignore
      window.chrome = { runtime: {} };
    });

    console.log('[Surfer Parser] Navigating to:', reportUrl);

    // Navigate with extended timeout - use networkidle0 for better SPA support
    await page.goto(reportUrl, {
      waitUntil: 'networkidle0',
      timeout: 45000
    });

    // IMPORTANT: Wait longer for SPA to fully render
    console.log('[Surfer Parser] Waiting for SPA to render...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Wait for content to load
    console.log('[Surfer Parser] Waiting for content to load...');

    await Promise.race([
      page.waitForSelector('button', { timeout: 15000 }),
      page.waitForSelector('main', { timeout: 15000 }),
      page.waitForSelector('table', { timeout: 15000 }),
      page.waitForSelector('[class*="term"]', { timeout: 15000 })
    ]).catch(() => console.log('[Surfer Parser] Initial selectors not found, continuing...'));

    // Extra wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try multiple strategies to click expand/show details buttons
    console.log('[Surfer Parser] Looking for expand buttons...');

    try {
      // Click all buttons that might expand content
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        let clicked = 0;

        for (const btn of buttons) {
          const text = (btn.textContent || '').toLowerCase();
          const ariaExpanded = btn.getAttribute('aria-expanded');

          // Click buttons that look like expand buttons
          if (
            text.includes('show') ||
            text.includes('expand') ||
            text.includes('detail') ||
            text.includes('more') ||
            ariaExpanded === 'false'
          ) {
            try {
              (btn as HTMLElement).click();
              clicked++;
            } catch (e) {
              // Continue
            }
          }
        }

        return clicked;
      });

      // Wait for content to expand
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('[Surfer Parser] Clicked expand buttons, waiting for content...');
    } catch (err) {
      console.log('[Surfer Parser] Could not click expand buttons:', err);
    }

    // Debug: Get page info
    debugInfo.pageTitle = await page.title();
    debugInfo.url = page.url();

    // Debug: Check what's on the page
    const pageDebugInfo = await page.evaluate(() => {
      return {
        bodyLength: document.body?.innerHTML?.length || 0,
        hasTable: !!document.querySelector('table'),
        hasTr: document.querySelectorAll('tr').length,
        hasTermClass: document.querySelectorAll('[class*="term" i]').length,
        hasRowClass: document.querySelectorAll('[class*="row" i]').length,
        visibleTextSample: (document.body?.innerText || '').substring(0, 500)
      };
    });

    debugInfo.pageContent = pageDebugInfo;
    console.log('[Surfer Parser] Page debug - Table rows:', pageDebugInfo.hasTr, 'Term elements:', pageDebugInfo.hasTermClass);

    console.log('[Surfer Parser] Extracting data with multiple strategies...');

    // Extract all data from the page using multiple strategies
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
        extractionMethod: string;
      } = {
        mainKeyword: '',
        contentScore: null,
        wordCount: null,
        terms: [],
        questions: [],
        headings: [],
        extractionMethod: 'none'
      };

      // Helper to safely get text
      const getText = (selector: string): string => {
        const el = document.querySelector(selector);
        return el?.textContent?.trim() || '';
      };

      // 1. Try to get main keyword from SurferSEO header
      const headerText = document.querySelector('header, nav, [class*="header"]')?.textContent || '';
      const headerKeywordMatch = headerText.match(/\/\s*[^\s]*\s+([^h]+?)(?:https?:|$)/i);
      if (headerKeywordMatch && headerKeywordMatch[1]) {
        data.mainKeyword = headerKeywordMatch[1].trim();
      }

      // Fallback to other selectors
      if (!data.mainKeyword) {
        const keywordSelectors = ['h1', '[class*="keyword" i]', '[class*="query" i]'];
        for (const sel of keywordSelectors) {
          const text = getText(sel);
          if (text && text.length < 100 && !text.includes('\n') && !text.includes('http')) {
            data.mainKeyword = text;
            break;
          }
        }
      }

      // 2. Try to get content score
      const scoreMatch = document.body.innerText.match(/(\d{1,2})\s*\/\s*100/);
      if (scoreMatch) {
        data.contentScore = parseInt(scoreMatch[1]);
      }

      // 3. Try to get word count
      const wordCountRegex = /(\d{1,5})\s*words?/i;
      const bodyText = document.body.textContent || '';
      const wordMatch = bodyText.match(wordCountRegex);
      if (wordMatch) {
        data.wordCount = parseInt(wordMatch[1]);
      }

      // STRATEGY 1: Extract from table rows (most reliable for SurferSEO)
      const tableRows = document.querySelectorAll('tr');
      if (tableRows.length > 1) {
        data.extractionMethod = 'table-rows';
        tableRows.forEach((row, index) => {
          if (index === 0) return; // Skip header row

          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const termCell = cells[0];
            const termText = termCell?.textContent?.trim().replace('NLP', '').trim() || '';

            // Get count from various cell positions
            let yourCount = '0';
            let suggestedCount = '1';

            if (cells.length >= 4) {
              yourCount = cells[2]?.textContent?.trim() || '0';
              suggestedCount = cells[3]?.textContent?.trim() || '1';
            } else if (cells.length >= 2) {
              const countText = cells[1]?.textContent?.trim() || '';
              const countMatch = countText.match(/(\d+)\s*\/\s*(\d+)/);
              if (countMatch) {
                yourCount = countMatch[1];
                suggestedCount = countMatch[2];
              }
            }

            if (termText && termText.length > 1 && termText.length < 100 && !termText.match(/^\d+$/)) {
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
      }

      // STRATEGY 2: Look for elements with "term" in class name
      if (data.terms.length === 0) {
        data.extractionMethod = 'class-term';
        const termContainers = document.querySelectorAll(
          '[class*="term" i], [class*="Term"], [class*="phrase" i], [class*="keyword-item"], li[class*="item"]'
        );

        termContainers.forEach(container => {
          const text = container.textContent?.trim() || '';
          if (text.length < 2 || text.length > 200) return;

          const termMatch = text.match(/^(.+?)\s*(?:(\d+)\s*\/\s*(\d+)|(\d+)\s*-\s*(\d+)|\((\d+)\s*-\s*(\d+)\))?$/);

          if (termMatch) {
            const term = termMatch[1].replace(/[•\-\*]/g, '').trim();
            if (term.length < 2) return;

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

            let status = 'unknown';
            const classList = container.className.toLowerCase();
            if (classList.includes('missing') || classList.includes('red')) {
              status = 'missing';
            } else if (classList.includes('low') || classList.includes('yellow')) {
              status = 'low';
            } else if (classList.includes('good') || classList.includes('green')) {
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
      }

      // STRATEGY 3: Look for divs with row-like structure
      if (data.terms.length === 0) {
        data.extractionMethod = 'div-rows';
        const rowDivs = document.querySelectorAll('[class*="row" i], [class*="Row"], [class*="item" i], [class*="Item"]');
        rowDivs.forEach(row => {
          const children = row.querySelectorAll('div, span');
          if (children.length >= 2) {
            const termText = children[0]?.textContent?.trim();
            const countText = children[1]?.textContent?.trim() || '';

            if (termText && termText.length > 1 && termText.length < 80 && !termText.match(/^\d+$/)) {
              const countMatch = countText.match(/(\d+)\s*\/\s*(\d+)/);
              if (countMatch || termText.length < 40) {
                data.terms.push({
                  term: termText,
                  currentCount: countMatch ? parseInt(countMatch[1]) : null,
                  recommendedMin: null,
                  recommendedMax: countMatch ? parseInt(countMatch[2]) : null,
                  status: 'unknown'
                });
              }
            }
          }
        });
      }

      // STRATEGY 4: List items
      if (data.terms.length === 0) {
        data.extractionMethod = 'list-items';
        const listItems = document.querySelectorAll('li');
        listItems.forEach(li => {
          const text = li.textContent?.trim();
          if (text && text.length > 2 && text.length < 80 && !text.includes('http')) {
            const match = text.match(/^(.+?)\s*(\d+)\s*\/\s*(\d+)$/);
            if (match) {
              data.terms.push({
                term: match[1].trim(),
                currentCount: parseInt(match[2]),
                recommendedMin: null,
                recommendedMax: parseInt(match[3]),
                status: 'unknown'
              });
            }
          }
        });
      }

      // STRATEGY 5: Regex search in page text for "word X/Y" patterns
      if (data.terms.length === 0) {
        data.extractionMethod = 'regex';
        const pageText = document.body.innerText;
        const termPattern = /([a-zA-Z][a-zA-Z\s]{1,40}?)\s+(\d{1,3})\s*\/\s*(\d{1,3})/g;
        let match;
        const seenTerms = new Set<string>();
        while ((match = termPattern.exec(pageText)) !== null) {
          const term = match[1].trim();
          const termLower = term.toLowerCase();
          if (term.length > 1 && !seenTerms.has(termLower)) {
            seenTerms.add(termLower);
            data.terms.push({
              term,
              currentCount: parseInt(match[2]),
              recommendedMin: null,
              recommendedMax: parseInt(match[3]),
              status: 'unknown'
            });
          }
        }
      }

      // Extract questions
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

      // Fallback: extract questions from page text
      if (data.questions.length === 0) {
        const allText = document.body.innerText;
        const questionMatches = allText.match(/([A-Z][^.!?\n]{10,100}\?)/g);
        if (questionMatches) {
          data.questions = [...new Set(questionMatches)].slice(0, 10);
        }
      }

      // Extract heading suggestions
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
    const seenTerms = new Set<string>();
    const uniqueTerms = extractedData.terms.filter((t) => {
      const key = t.term.toLowerCase();
      if (seenTerms.has(key)) return false;
      seenTerms.add(key);
      return true;
    }) as SurferTerm[];

    // Deduplicate questions
    const uniqueQuestions = [...new Set(extractedData.questions)];

    debugInfo.extractionMethod = extractedData.extractionMethod;
    console.log(`[Surfer Parser] Extraction method: ${extractedData.extractionMethod}`);
    console.log(`[Surfer Parser] Extracted ${uniqueTerms.length} terms, ${uniqueQuestions.length} questions`);

    return {
      success: uniqueTerms.length > 0,
      mainKeyword: extractedData.mainKeyword,
      url: reportUrl,
      contentScore: extractedData.contentScore,
      wordCount: extractedData.wordCount,
      terms: uniqueTerms,
      questions: uniqueQuestions,
      headings: extractedData.headings,
      debug: debugInfo
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
      error: errorMessage,
      debug: debugInfo
    };
  } finally {
    if (browser) {
      try {
        // For Browserless.io, disconnect instead of close
        if (usingBrowserless) {
          await browser.disconnect();
        } else {
          await browser.close();
        }
      } catch (e) {
        console.log('[Surfer Parser] Browser cleanup error:', e);
      }
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
