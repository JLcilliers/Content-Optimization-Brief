import puppeteer, { Browser } from 'puppeteer-core';

export interface SurferTerm {
  term: string;
  isNLP: boolean;
  currentCount: number | null;
  recommendedMin: number | null;
  recommendedMax: number | null;
  competitorMin: number | null;
  competitorMax: number | null;
  relevance: number | null;
  action: string | null;
  status: 'missing' | 'low' | 'good' | 'overused' | 'unknown';
}

export interface SurferReportData {
  success: boolean;
  mainKeyword: string;
  url: string;
  auditedUrl: string;
  contentScore: number | null;
  wordCount: number | null;
  terms: SurferTerm[];
  nlpTerms: SurferTerm[];
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

  console.log('[Surfer Parser] getBrowser called');
  console.log('[Surfer Parser] BROWSERLESS_TOKEN exists:', !!browserlessToken);
  console.log('[Surfer Parser] BROWSERLESS_TOKEN length:', browserlessToken?.length || 0);
  console.log('[Surfer Parser] NODE_ENV:', process.env.NODE_ENV);

  // Production: Use Browserless.io cloud browser with stealth mode
  if (browserlessToken) {
    console.log('[Surfer Parser] Connecting to Browserless.io with stealth mode...');
    usingBrowserless = true;

    // Add stealth and block detection params
    const wsEndpoint = `wss://chrome.browserless.io?token=${browserlessToken}&stealth=true&blockAds=true`;

    try {
      const browser = await puppeteer.connect({
        browserWSEndpoint: wsEndpoint,
      });
      console.log('[Surfer Parser] Successfully connected to Browserless.io');
      return browser;
    } catch (connectError) {
      console.error('[Surfer Parser] Failed to connect to Browserless.io:', connectError);
      throw connectError;
    }
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

  console.error('[Surfer Parser] No BROWSERLESS_TOKEN and not in development mode');
  throw new Error('BROWSERLESS_TOKEN environment variable is required in production');
}

export async function parseSurferAuditReport(reportUrl: string): Promise<SurferReportData> {
  // Validate URL
  if (!reportUrl.includes('surferseo.com')) {
    return {
      success: false,
      mainKeyword: '',
      url: reportUrl,
      auditedUrl: '',
      contentScore: null,
      wordCount: null,
      terms: [],
      nlpTerms: [],
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
      // First, specifically look for and click the "Terms to Use" section's "Show details" button
      // This is critical for SurferSEO shared audit pages
      const clickedTermsDetails = await page.evaluate(() => {
        // Find all buttons with "Show details" text
        const buttons = Array.from(document.querySelectorAll('button'));
        let clickedTerms = false;

        for (const btn of buttons) {
          const text = (btn.textContent || '').toLowerCase().trim();

          // Look for "show details" button near "Terms to Use" section
          if (text === 'show details') {
            // Check if this button is in a section related to terms
            const parentSection = btn.closest('[class*="section"], [class*="card"], div');
            const sectionText = parentSection?.textContent || '';

            if (sectionText.includes('Terms to Use') || sectionText.includes('important terms')) {
              try {
                (btn as HTMLElement).click();
                clickedTerms = true;
                console.log('Clicked Terms to Use Show details button');
              } catch (e) {
                // Continue
              }
            }
          }
        }

        // If we didn't find the specific terms button, click all "Show details" buttons
        if (!clickedTerms) {
          for (const btn of buttons) {
            const text = (btn.textContent || '').toLowerCase().trim();
            if (text === 'show details' || text.includes('show detail')) {
              try {
                (btn as HTMLElement).click();
              } catch (e) {
                // Continue
              }
            }
          }
        }

        return clickedTerms;
      });

      // Wait for content to expand
      await new Promise(resolve => setTimeout(resolve, 4000));
      console.log('[Surfer Parser] Clicked expand buttons, waiting for content...');

      // Click any remaining expand buttons
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

    // ============================================
    // DETAILED DEBUGGING: Understand HTML Structure
    // ============================================
    console.log('[Surfer Parser] Starting detailed extraction debug...');

    const debugData = await page.evaluate(() => {
      const debug: {
        ariaRows: Array<{
          index: number;
          cellCount: number;
          rowHTML: string;
          rowClasses: string;
          rowRole: string | null;
          cells: Array<{
            index: number;
            text: string;
            html: string;
            classes: string;
            childTags: string;
          }>;
        }>;
        ariaRowCount: number;
        tableRows: Array<{
          index: number;
          cellCount: number;
          cells: Array<{
            index: number;
            text: string;
          }>;
        }>;
        tableRowCount: number;
        allRoles: string[];
        termClassElements: Array<{
          tag: string;
          classes: string;
          text: string;
          html: string;
        }>;
        termElementCount: number;
        sectionCount: number;
        termsSectionFound: boolean;
        termsSectionHTML: string;
        termsSectionRows: number;
        termsSectionRowSamples: Array<{
          html: string;
          text: string;
        }>;
        flexContainerCount: number;
        termPatternMatches: string[];
        visibleTextSample: string;
      } = {
        ariaRows: [],
        ariaRowCount: 0,
        tableRows: [],
        tableRowCount: 0,
        allRoles: [],
        termClassElements: [],
        termElementCount: 0,
        sectionCount: 0,
        termsSectionFound: false,
        termsSectionHTML: '',
        termsSectionRows: 0,
        termsSectionRowSamples: [],
        flexContainerCount: 0,
        termPatternMatches: [],
        visibleTextSample: ''
      };

      // 1. Log all ARIA rows and their structure
      const ariaRows = document.querySelectorAll('[role="row"]');
      debug.ariaRowCount = ariaRows.length;

      // Sample first 5 rows' HTML structure
      ariaRows.forEach((row, index) => {
        if (index < 5) {
          const cells = row.querySelectorAll('[role="cell"], [role="gridcell"]');
          const rowData = {
            index,
            cellCount: cells.length,
            rowHTML: row.outerHTML.substring(0, 500),
            rowClasses: (row as HTMLElement).className,
            rowRole: row.getAttribute('role'),
            cells: Array.from(cells).slice(0, 4).map((cell, ci) => ({
              index: ci,
              text: (cell.textContent || '').trim().substring(0, 100),
              html: cell.outerHTML.substring(0, 300),
              classes: (cell as HTMLElement).className,
              childTags: Array.from(cell.children).map(c => c.tagName).join(', ')
            }))
          };
          debug.ariaRows.push(rowData);
        }
      });

      // 2. Log traditional table rows
      const tableRows = document.querySelectorAll('tr');
      debug.tableRowCount = tableRows.length;

      tableRows.forEach((row, index) => {
        if (index < 3) {
          const cells = row.querySelectorAll('td, th');
          debug.tableRows.push({
            index,
            cellCount: cells.length,
            cells: Array.from(cells).slice(0, 4).map((cell, ci) => ({
              index: ci,
              text: (cell.textContent || '').trim().substring(0, 100)
            }))
          });
        }
      });

      // 3. Find all unique role attributes on the page
      const allElements = document.querySelectorAll('*');
      const roles = new Set<string>();
      allElements.forEach(el => {
        const role = el.getAttribute('role');
        if (role) roles.add(role);
      });
      debug.allRoles = Array.from(roles);

      // 4. Find elements with "term" in class name
      const termElements = document.querySelectorAll('[class*="term" i], [class*="Term"]');
      debug.termElementCount = termElements.length;

      termElements.forEach((el, index) => {
        if (index < 5) {
          debug.termClassElements.push({
            tag: el.tagName,
            classes: (el as HTMLElement).className,
            text: (el.textContent || '').trim().substring(0, 100),
            html: el.outerHTML.substring(0, 300)
          });
        }
      });

      // 5. Find the "Terms to Use" section specifically
      const sections = document.querySelectorAll('section, [class*="section" i]');
      debug.sectionCount = sections.length;

      sections.forEach((section) => {
        const text = section.textContent || '';
        if (text.includes('Terms') || text.includes('Important')) {
          debug.termsSectionFound = true;
          debug.termsSectionHTML = section.outerHTML.substring(0, 1000);

          // Find all child elements with data
          const innerRows = section.querySelectorAll('[role="row"], tr, [class*="row" i]');
          debug.termsSectionRows = innerRows.length;

          if (innerRows.length > 0 && innerRows.length < 10) {
            debug.termsSectionRowSamples = Array.from(innerRows).slice(0, 3).map(r => ({
              html: r.outerHTML.substring(0, 500),
              text: (r.textContent || '').trim().substring(0, 200)
            }));
          }
        }
      });

      // 6. Look for data in different structures
      // Maybe it's using divs with flex/grid layout
      const flexContainers = document.querySelectorAll('[class*="grid" i], [class*="list" i], [class*="table" i]');
      debug.flexContainerCount = flexContainers.length;

      // 7. Search for any element containing typical term patterns
      // Like "keyword 2/5" or numbers that look like counts
      const bodyText = document.body.innerText;
      const termPatternMatches = bodyText.match(/\b[a-z]{3,20}\s+\d+\s*[\/\-]\s*\d+/gi);
      debug.termPatternMatches = termPatternMatches?.slice(0, 10) || [];

      // 8. Get a sample of visible text that might contain terms
      const visibleText = bodyText.substring(0, 2000);
      debug.visibleTextSample = visibleText;

      return debug;
    });

    // Log the debug data in chunks to avoid truncation
    console.log('[Surfer Parser] Debug - ARIA row count:', debugData.ariaRowCount);
    console.log('[Surfer Parser] Debug - Table row count:', debugData.tableRowCount);
    console.log('[Surfer Parser] Debug - Term element count:', debugData.termElementCount);
    console.log('[Surfer Parser] Debug - All roles on page:', JSON.stringify(debugData.allRoles));
    console.log('[Surfer Parser] Debug - Flex container count:', debugData.flexContainerCount);
    console.log('[Surfer Parser] Debug - Terms section found:', debugData.termsSectionFound);

    if (debugData.ariaRows.length > 0) {
      console.log('[Surfer Parser] Debug - First ARIA row:', JSON.stringify(debugData.ariaRows[0], null, 2));
      if (debugData.ariaRows.length > 1) {
        console.log('[Surfer Parser] Debug - Second ARIA row:', JSON.stringify(debugData.ariaRows[1], null, 2));
      }
    }

    if (debugData.termClassElements.length > 0) {
      console.log('[Surfer Parser] Debug - Term class elements:', JSON.stringify(debugData.termClassElements.slice(0, 3), null, 2));
    }

    console.log('[Surfer Parser] Debug - Term pattern matches:', JSON.stringify(debugData.termPatternMatches));
    console.log('[Surfer Parser] Debug - Visible text sample (first 500 chars):', debugData.visibleTextSample.substring(0, 500));

    // ============================================
    // END DETAILED DEBUGGING
    // ============================================

    console.log('[Surfer Parser] Extracting data with multiple strategies...');

    // Extract all data from the page using multiple strategies
    const extractedData = await page.evaluate(() => {
      const data: {
        mainKeyword: string;
        auditedUrl: string;
        contentScore: number | null;
        wordCount: number | null;
        terms: Array<{
          term: string;
          isNLP: boolean;
          currentCount: number | null;
          recommendedMin: number | null;
          recommendedMax: number | null;
          competitorMin: number | null;
          competitorMax: number | null;
          relevance: number | null;
          action: string | null;
          status: string;
        }>;
        questions: string[];
        headings: string[];
        extractionMethod: string;
      } = {
        mainKeyword: '',
        auditedUrl: '',
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

      // 1. Try to get main keyword from SurferSEO shared audit page
      // The page structure shows: "Audit / [flag] keyword https://url"
      // Look for text between flag image and URL
      const allText = document.body.innerText;

      // Try to extract from page title first (format: "URL | keyword · Audit · Surfer")
      const pageTitle = document.title;
      const titleMatch = pageTitle.match(/\|\s*([^·]+)\s*·\s*Audit/i);
      if (titleMatch && titleMatch[1]) {
        data.mainKeyword = titleMatch[1].trim();
      }

      // Extract audited URL from page title (format: "https://url.com/page | keyword · Audit · Surfer")
      const urlMatch = pageTitle.match(/^(https?:\/\/[^\s|]+)/i);
      if (urlMatch && urlMatch[1]) {
        data.auditedUrl = urlMatch[1].trim();
      }

      // Fallback: Look for keyword in the header area
      if (!data.mainKeyword) {
        // SurferSEO header typically shows "Audit / [flag] keyword URL"
        const headerElement = document.querySelector('[class*="header"], header, nav');
        if (headerElement) {
          const headerText = headerElement.textContent || '';
          // Pattern: after "Audit" and "/" but before "http"
          const auditMatch = headerText.match(/Audit\s*\/\s*([^h]+?)(?:https?:|$)/i);
          if (auditMatch && auditMatch[1]) {
            data.mainKeyword = auditMatch[1].replace(/[^\w\s]/g, ' ').trim();
          }
        }
      }

      // Fallback to other selectors
      if (!data.mainKeyword) {
        const keywordSelectors = ['h1', '[class*="keyword" i]', '[class*="query" i]'];
        for (const sel of keywordSelectors) {
          const text = getText(sel);
          if (text && text.length < 100 && text.length > 2 && !text.includes('\n') && !text.includes('http')) {
            data.mainKeyword = text;
            break;
          }
        }
      }

      // 2. Try to get content score
      // SurferSEO format: "Your Content Score is X." or "Content Score is X"
      const scorePatterns = [
        /Content Score is\s*(\d{1,3})/i,
        /(\d{1,3})\s*\/\s*100/,
        /score[:\s]+(\d{1,3})/i
      ];

      for (const pattern of scorePatterns) {
        const scoreMatch = allText.match(pattern);
        if (scoreMatch) {
          const score = parseInt(scoreMatch[1]);
          if (score >= 0 && score <= 100) {
            data.contentScore = score;
            break;
          }
        }
      }

      // 3. Try to get word count
      // SurferSEO format: "X words in body" or "Add X-Y words in body"
      const wordCountPatterns = [
        /(\d{1,5})\s*words?\s*in\s*body/i,
        /body.*?(\d{1,5})\s*words/i,
        /(\d{1,5})\s*words?\b/i
      ];

      for (const pattern of wordCountPatterns) {
        const wordMatch = allText.match(pattern);
        if (wordMatch) {
          const count = parseInt(wordMatch[1]);
          if (count > 0 && count < 100000) {
            data.wordCount = count;
            break;
          }
        }
      }

      // STRATEGY 0: Extract from SurferSEO's "Terms to Use" section specifically
      // First, find the Terms section container, then extract ONLY from that section
      // This prevents extracting competitor URLs from the wrong table

      // Find the "Terms to Use" or "Important terms" section
      const findTermsSection = (): Element | null => {
        // Look for section headers containing "Terms" or "Important"
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="heading"], [class*="title"], button');
        for (const heading of headings) {
          const text = (heading.textContent || '').toLowerCase();
          if (text.includes('terms to use') || text.includes('important terms') ||
              (text.includes('terms') && !text.includes('competitor'))) {
            // Found the Terms section header - look for the containing section
            // Walk up to find a container that has the table/data
            let parent = heading.parentElement;
            for (let i = 0; i < 10 && parent; i++) {
              // Check if this parent contains ARIA table rows or regular table rows
              const hasDataRows = parent.querySelectorAll('[role="row"], tr').length > 0;
              if (hasDataRows) {
                return parent;
              }
              parent = parent.parentElement;
            }
            // If no table found in parent, return the heading's closest section
            return heading.closest('section, [class*="section"], [class*="card"], article, div[class*="container"]');
          }
        }

        // Fallback: Look for elements that contain term-like text patterns
        // (terms with "Add X" action text nearby)
        const allSections = document.querySelectorAll('section, [class*="section"], [class*="panel"], [class*="card"]');
        for (const section of allSections) {
          const text = section.textContent || '';
          // Check if section has term-like content (action suggestions)
          if (text.includes('Add 1') || text.includes('Add 2') ||
              (text.match(/\bAdd\s+\d+/g)?.length || 0) > 3) {
            // Found a section with many "Add X" patterns - likely the terms section
            return section;
          }
        }

        return null;
      };

      const termsSection = findTermsSection();

      // If we found a terms section, extract ONLY from there
      // Otherwise, fall back to page-wide search (but with better filtering)
      const targetContainer = termsSection || document.body;
      const ariaRows = targetContainer.querySelectorAll('[role="row"]');

      console.log('Terms section found:', !!termsSection, 'ARIA rows in section:', ariaRows.length);

      if (ariaRows.length > 1) {
        data.extractionMethod = termsSection ? 'aria-table-section' : 'aria-table';
        ariaRows.forEach((row, index) => {
          if (index === 0) return; // Skip header row (columnheader)

          // Check if this row has columnheaders (it's a header row)
          if (row.querySelector('[role="columnheader"]')) return;

          const cells = row.querySelectorAll('[role="cell"], [role="gridcell"]');
          if (cells.length >= 2) {
            // SurferSEO table structure (from CSV export):
            // Cell 0: Term (may include "NLP" badge)
            // Cell 1: Examples count OR Competitors range
            // Cell 2: Your count ("You")
            // Cell 3: Suggested count
            // Cell 4: Sentiment (optional)
            // Cell 5: Relevance (%)
            // Cell 6: Search Volume
            // Cell 7: Action (e.g., "Add 1", "Add 2-7")

            const termCell = cells[0];
            const termCellText = termCell?.textContent?.trim() || '';

            // CRITICAL: Skip rows that look like competitor URLs
            if (termCellText.startsWith('http') || termCellText.includes('://') ||
                termCellText.includes('.com/') || termCellText.includes('.org/') ||
                termCellText.includes('.net/') || termCellText.includes('.io/')) {
              return;
            }

            // Check if term has NLP badge
            const isNLP = termCellText.toLowerCase().includes('nlp') ||
                          !!termCell?.querySelector('[class*="nlp" i], [class*="badge" i]');

            // Remove "NLP" badge text from term
            let termText = termCellText.replace(/\s*NLP\s*$/i, '').trim();

            // Get count values from cells - adapt based on cell count
            let yourCountText = '0';
            let suggestedText = '1';
            let relevanceText = '';
            let actionText = '';

            if (cells.length >= 4) {
              // Standard layout: Term | Examples | You | Suggested | ... | Action
              yourCountText = cells[2]?.textContent?.trim() || '0';
              suggestedText = cells[3]?.textContent?.trim() || '1';

              // Look for relevance (percentage) and action in remaining cells
              for (let i = 4; i < cells.length; i++) {
                const cellText = cells[i]?.textContent?.trim() || '';
                if (cellText.includes('%')) {
                  relevanceText = cellText;
                } else if (cellText.toLowerCase().startsWith('add') ||
                           cellText.toLowerCase().includes('remove') ||
                           cellText.toLowerCase().includes('reduce')) {
                  actionText = cellText;
                }
              }
            } else if (cells.length >= 2) {
              // Compact layout: Term | Count/Range
              const countCell = cells[1]?.textContent?.trim() || '';
              const countMatch = countCell.match(/(\d+)\s*\/\s*(\d+)/);
              if (countMatch) {
                yourCountText = countMatch[1];
                suggestedText = countMatch[2];
              }
            }

            // Get "You" count
            const yourCount = parseInt(yourCountText) || 0;

            // Get Relevance
            let relevance: number | null = null;
            if (relevanceText) {
              const relevanceMatch = relevanceText.match(/([\d.]+)%?/);
              if (relevanceMatch) {
                const relValue = parseFloat(relevanceMatch[1]);
                // If value is between 0 and 1, it's already a decimal
                // If value is between 1 and 100, convert to decimal
                relevance = relValue > 1 ? relValue / 100 : relValue;
              }
            }

            // Get Action
            const action = actionText || null;

            if (termText && termText.length > 1 && termText.length < 100 && !termText.match(/^\d+$/)) {
              let recommendedMin: number | null = null;
              let recommendedMax: number | null = null;

              // Parse suggested range (e.g., "2-7" or "1")
              const rangeMatch = suggestedText.match(/(\d+)\s*-\s*(\d+)/);
              if (rangeMatch) {
                recommendedMin = parseInt(rangeMatch[1]);
                recommendedMax = parseInt(rangeMatch[2]);
              } else {
                const singleMatch = suggestedText.match(/(\d+)/);
                if (singleMatch) {
                  const suggested = parseInt(singleMatch[1]);
                  recommendedMin = suggested;
                  recommendedMax = suggested;
                }
              }

              // Determine status based on current vs recommended
              let status = 'missing';
              if (yourCount > 0) {
                if (recommendedMin !== null && recommendedMax !== null) {
                  if (yourCount < recommendedMin) status = 'low';
                  else if (yourCount > recommendedMax) status = 'overused';
                  else status = 'good';
                } else {
                  status = 'good';
                }
              }

              data.terms.push({
                term: termText,
                isNLP,
                currentCount: yourCount,
                recommendedMin,
                recommendedMax,
                competitorMin: null, // Not available in shared audit table view
                competitorMax: null,
                relevance,
                action,
                status
              });
            }
          }
        });
      }

      // STRATEGY 1: Extract from table rows (fallback for traditional HTML tables)
      // Also try to target the Terms section if found
      if (data.terms.length === 0) {
        // Re-use the terms section if found, otherwise search whole document
        const tableContainer = termsSection || document.body;
        const tableRows = tableContainer.querySelectorAll('tr');

        if (tableRows.length > 1) {
          data.extractionMethod = termsSection ? 'table-rows-section' : 'table-rows';
          tableRows.forEach((row, index) => {
            if (index === 0) return; // Skip header row

            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const termCell = cells[0];
              const termCellText = termCell?.textContent?.trim() || '';

              // CRITICAL: Skip rows that look like competitor URLs
              if (termCellText.startsWith('http') || termCellText.includes('://') ||
                  termCellText.includes('.com/') || termCellText.includes('.org/') ||
                  termCellText.includes('.net/') || termCellText.includes('.io/')) {
                return;
              }

              const isNLP = termCellText.toLowerCase().includes('nlp');
              const termText = termCellText.replace(/\s*NLP\s*$/i, '').trim();

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
                  isNLP,
                  currentCount,
                  recommendedMin,
                  recommendedMax,
                  competitorMin: null,
                  competitorMax: null,
                  relevance: null,
                  action: null,
                  status
                });
              }
            }
          });
        }
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
            const term = termMatch[1].replace(/[•\-\*]/g, '').replace(/\s*NLP\s*$/i, '').trim();
            if (term.length < 2) return;

            const isNLP = text.toLowerCase().includes('nlp');
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
              isNLP,
              currentCount,
              recommendedMin,
              recommendedMax,
              competitorMin: null,
              competitorMax: null,
              relevance: null,
              action: null,
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
            const termText = children[0]?.textContent?.trim()?.replace(/\s*NLP\s*$/i, '');
            const countText = children[1]?.textContent?.trim() || '';

            if (termText && termText.length > 1 && termText.length < 80 && !termText.match(/^\d+$/)) {
              const countMatch = countText.match(/(\d+)\s*\/\s*(\d+)/);
              if (countMatch || termText.length < 40) {
                data.terms.push({
                  term: termText,
                  isNLP: false,
                  currentCount: countMatch ? parseInt(countMatch[1]) : null,
                  recommendedMin: null,
                  recommendedMax: countMatch ? parseInt(countMatch[2]) : null,
                  competitorMin: null,
                  competitorMax: null,
                  relevance: null,
                  action: null,
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
                term: match[1].trim().replace(/\s*NLP\s*$/i, ''),
                isNLP: false,
                currentCount: parseInt(match[2]),
                recommendedMin: null,
                recommendedMax: parseInt(match[3]),
                competitorMin: null,
                competitorMax: null,
                relevance: null,
                action: null,
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
              isNLP: false,
              currentCount: parseInt(match[2]),
              recommendedMin: null,
              recommendedMax: parseInt(match[3]),
              competitorMin: null,
              competitorMax: null,
              relevance: null,
              action: null,
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

    // Helper function to check if a string is a URL
    const isUrl = (str: string): boolean => {
      return str.startsWith('http://') ||
             str.startsWith('https://') ||
             str.startsWith('www.') ||
             str.includes('.com/') ||
             str.includes('.pdf') ||
             str.includes('.org/') ||
             str.includes('.net/') ||
             str.includes('.io/') ||
             /^[a-z0-9-]+\.(com|org|net|io|co|edu|gov|pdf)\b/i.test(str);
    };

    // Deduplicate and filter terms
    const seenTerms = new Set<string>();
    const uniqueTerms = extractedData.terms.filter((t) => {
      const key = t.term.toLowerCase();

      // Skip if already seen
      if (seenTerms.has(key)) return false;

      // Skip URLs - they're not real keywords
      if (isUrl(t.term)) {
        console.log(`[Surfer Parser] Filtering out URL: ${t.term.substring(0, 50)}...`);
        return false;
      }

      // Skip if term is too long (likely not a keyword)
      if (t.term.length > 60) return false;

      // Skip if term contains too many special characters
      if (/[<>{}|\[\]\\]/.test(t.term)) return false;

      seenTerms.add(key);
      return true;
    }) as SurferTerm[];

    // Separate NLP terms from regular terms
    const regularTerms = uniqueTerms.filter(t => !t.isNLP);
    const nlpTerms = uniqueTerms.filter(t => t.isNLP);

    // Deduplicate questions
    const uniqueQuestions = [...new Set(extractedData.questions)];

    debugInfo.extractionMethod = extractedData.extractionMethod;
    console.log(`[Surfer Parser] Extraction method: ${extractedData.extractionMethod}`);
    console.log(`[Surfer Parser] Extracted ${regularTerms.length} terms, ${nlpTerms.length} NLP terms, ${uniqueQuestions.length} questions`);

    return {
      success: uniqueTerms.length > 0,
      mainKeyword: extractedData.mainKeyword,
      url: reportUrl,
      auditedUrl: extractedData.auditedUrl,
      contentScore: extractedData.contentScore,
      wordCount: extractedData.wordCount,
      terms: regularTerms,
      nlpTerms: nlpTerms,
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
      auditedUrl: '',
      contentScore: null,
      wordCount: null,
      terms: [],
      nlpTerms: [],
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
