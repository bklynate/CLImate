import puppeteer from 'puppeteer-extra';
import type { Browser, Page } from 'puppeteer';
import randomUseragent from 'random-useragent';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import logger from '@utils/logger';

// Configure puppeteer with stealth plugin
puppeteer.use(StealthPlugin());

interface BrowserInstance {
  browser: Browser;
  id: string;
  createdAt: number;
  lastUsed: number;
  pageCount: number;
  isHealthy: boolean;
}

interface PageInstance {
  page: Page;
  browserId: string;
  createdAt: number;
  isInUse: boolean;
}

interface BrowserPoolOptions {
  maxBrowsers: number;
  maxPagesPerBrowser: number;
  maxIdleTime: number; // ms
  maxBrowserAge: number; // ms
  resourceOptimization: boolean;
  headless: boolean;
}

/**
 * High-performance browser pool with resource optimization
 */
export class BrowserPool {
  private static shutdownListenersSet = false;
  private browsers: Map<string, BrowserInstance> = new Map();
  private pages: Map<string, PageInstance> = new Map();
  private readonly options: BrowserPoolOptions;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(options: Partial<BrowserPoolOptions> = {}) {
    this.options = {
      maxBrowsers: 3,
      maxPagesPerBrowser: 5,
      maxIdleTime: 5 * 60 * 1000, // 5 minutes
      maxBrowserAge: 30 * 60 * 1000, // 30 minutes
      resourceOptimization: true,
      headless: true,
      ...options
    };

    // Start cleanup routine
    this.startCleanupRoutine();

    // Graceful shutdown handling (only set up once)
    if (!BrowserPool.shutdownListenersSet) {
      process.on('exit', () => this.shutdown());
      process.on('SIGINT', () => {
        this.shutdown().then(() => process.exit(0));
      });
      process.on('SIGTERM', () => {
        this.shutdown().then(() => process.exit(0));
      });
      BrowserPool.shutdownListenersSet = true;
    }
  }

  /**
   * Get an optimized browser instance
   */
  async getBrowser(): Promise<Browser> {
    if (this.isShuttingDown) {
      throw new Error('Browser pool is shutting down');
    }

    // Try to find a healthy browser with capacity
    for (const [id, instance] of this.browsers) {
      if (instance.isHealthy && instance.pageCount < this.options.maxPagesPerBrowser) {
        instance.lastUsed = Date.now();
        return instance.browser;
      }
    }

    // Create new browser if under limit
    if (this.browsers.size < this.options.maxBrowsers) {
      return await this.createBrowser();
    }

    // Find least used browser and evict if necessary
    const oldestBrowser = Array.from(this.browsers.values())
      .sort((a, b) => a.lastUsed - b.lastUsed)[0];

    if (oldestBrowser) {
      await this.closeBrowser(oldestBrowser.id);
      return await this.createBrowser();
    }

    throw new Error('Unable to acquire browser from pool');
  }

  /**
   * Get an optimized page instance
   */
  async getPage(): Promise<Page> {
    const browser = await this.getBrowser();
    const browserId = this.getBrowserId(browser);
    
    if (!browserId) {
      throw new Error('Browser not found in pool');
    }

    // Try to reuse existing page
    const availablePage = Array.from(this.pages.values())
      .find(p => p.browserId === browserId && !p.isInUse);

    if (availablePage) {
      availablePage.isInUse = true;
      return availablePage.page;
    }

    // Create new page
    const page = await browser.newPage();
    const pageId = `${browserId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Apply optimizations
    await this.optimizePage(page);

    // Track page
    this.pages.set(pageId, {
      page,
      browserId,
      createdAt: Date.now(),
      isInUse: true
    });

    // Update browser page count
    const browserInstance = this.browsers.get(browserId);
    if (browserInstance) {
      browserInstance.pageCount++;
    }

    return page;
  }

  /**
   * Release a page back to the pool
   */
  async releasePage(page: Page): Promise<void> {
    const pageEntry = Array.from(this.pages.entries())
      .find(([_, p]) => p.page === page);

    if (!pageEntry) {
      // Page not from pool, just close it
      try {
        await page.close();
      } catch (error) {
        logger.warn('Error closing untracked page:', error);
      }
      return;
    }

    const [pageId, pageInstance] = pageEntry;

    try {
      // Reset page state for reuse
      await this.resetPage(page);
      pageInstance.isInUse = false;
    } catch (error) {
      logger.warn('Error resetting page, removing from pool:', error);
      await this.removePage(pageId);
    }
  }

  /**
   * Create an optimized browser instance
   */
  private async createBrowser(): Promise<Browser> {
    const browserId = `browser_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const launchOptions: any = {
      headless: this.options.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-default-apps',
        '--disable-sync',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-client-side-phishing-detection',
        '--disable-component-extensions-with-background-pages',
        '--disable-permissions-api',
        '--disable-background-networking'
      ]
    };

    // Additional optimizations for resource-constrained environments
    if (this.options.resourceOptimization) {
      launchOptions.args.push(
        '--disable-images',
        '--disable-javascript', // Can be enabled per-page if needed
        '--disable-plugins',
        '--disable-extensions',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--memory-pressure-off'
      );
    }

    try {
      const browser = await puppeteer.launch(launchOptions);
      
      // Track browser
      this.browsers.set(browserId, {
        browser,
        id: browserId,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        pageCount: 0,
        isHealthy: true
      });

      // Monitor browser health
      browser.on('disconnected', () => {
        logger.warn(`Browser ${browserId} disconnected`);
        this.markBrowserUnhealthy(browserId);
      });

      logger.info(`Created browser ${browserId} (pool size: ${this.browsers.size})`);
      return browser;
    } catch (error) {
      logger.error('Failed to create browser:', error);
      throw error;
    }
  }

  /**
   * Apply optimizations to a page
   */
  private async optimizePage(page: Page): Promise<void> {
    try {
      // Set user agent
      await page.setUserAgent(randomUseragent.getRandom());

      // Set viewport for consistency
      await page.setViewport({ width: 1920, height: 1080 });

      // Block unnecessary resources if optimization enabled
      if (this.options.resourceOptimization) {
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
          const resourceType = request.resourceType();
          const url = request.url();

          // Block unnecessary resources
          if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            request.abort();
          } else if (resourceType === 'script') {
            // Block analytics and ads
            if (url.includes('google-analytics') || 
                url.includes('gtag') || 
                url.includes('facebook.net') ||
                url.includes('doubleclick') ||
                url.includes('googlesyndication')) {
              request.abort();
            } else {
              request.continue();
            }
          } else {
            request.continue();
          }
        });
      }

      // Set timeouts
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

    } catch (error) {
      logger.warn('Error optimizing page:', error);
    }
  }

  /**
   * Reset page state for reuse
   */
  private async resetPage(page: Page): Promise<void> {
    try {
      // Clear any timers or intervals
      await page.evaluate(() => {
        for (let i = 1; i < 99999; i++) {
          window.clearTimeout(i);
          window.clearInterval(i);
        }
      });

      await page.goto('about:blank', { waitUntil: 'load', timeout: 5_000 });
    } catch (error: any) {
      throw new Error(`Failed to reset page: ${error.message}`);
    }
  }

  /**
   * Get browser ID from browser instance
   */
  private getBrowserId(browser: Browser): string | undefined {
    for (const [id, instance] of this.browsers) {
      if (instance.browser === browser) {
        return id;
      }
    }
    return undefined;
  }

  /**
   * Mark browser as unhealthy
   */
  private markBrowserUnhealthy(browserId: string): void {
    const browser = this.browsers.get(browserId);
    if (browser) {
      browser.isHealthy = false;
    }
  }

  /**
   * Close a specific browser and its pages
   */
  private async closeBrowser(browserId: string): Promise<void> {
    const browserInstance = this.browsers.get(browserId);
    if (!browserInstance) return;

    try {
      // Close all pages from this browser
      const browserPages = Array.from(this.pages.entries())
        .filter(([_, page]) => page.browserId === browserId);

      for (const [pageId, _] of browserPages) {
        await this.removePage(pageId);
      }

      // Close browser
      await browserInstance.browser.close();
      this.browsers.delete(browserId);
      
      logger.info(`Closed browser ${browserId}`);
    } catch (error) {
      logger.warn(`Error closing browser ${browserId}:`, error);
      this.browsers.delete(browserId); // Remove anyway
    }
  }

  /**
   * Remove a page from the pool
   */
  private async removePage(pageId: string): Promise<void> {
    const pageInstance = this.pages.get(pageId);
    if (!pageInstance) return;

    try {
      await pageInstance.page.close();
      
      // Update browser page count
      const browserInstance = this.browsers.get(pageInstance.browserId);
      if (browserInstance) {
        browserInstance.pageCount = Math.max(0, browserInstance.pageCount - 1);
      }
      
      this.pages.delete(pageId);
    } catch (error) {
      logger.warn(`Error removing page ${pageId}:`, error);
      this.pages.delete(pageId); // Remove anyway
    }
  }

  /**
   * Start cleanup routine for old browsers and pages
   */
  private startCleanupRoutine(): void {
    this.cleanupInterval = setInterval(async () => {
      if (this.isShuttingDown) return;

      const now = Date.now();
      
      // Clean up old browsers
      for (const [id, browser] of this.browsers) {
        const age = now - browser.createdAt;
        const idleTime = now - browser.lastUsed;
        
        if (!browser.isHealthy || 
            age > this.options.maxBrowserAge || 
            idleTime > this.options.maxIdleTime) {
          await this.closeBrowser(id);
        }
      }

      // Clean up idle pages
      for (const [pageId, page] of this.pages) {
        if (!page.isInUse) {
          const idleTime = now - page.createdAt;
          if (idleTime > this.options.maxIdleTime / 2) { // Pages timeout faster
            await this.removePage(pageId);
          }
        }
      }

    }, 60000); // Run every minute
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    browsers: number;
    pages: number;
    healthyBrowsers: number;
    pagesInUse: number;
  } {
    const healthyBrowsers = Array.from(this.browsers.values())
      .filter(b => b.isHealthy).length;
    
    const pagesInUse = Array.from(this.pages.values())
      .filter(p => p.isInUse).length;

    return {
      browsers: this.browsers.size,
      pages: this.pages.size,
      healthyBrowsers,
      pagesInUse
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    logger.info('Shutting down browser pool...');

    // Stop cleanup routine
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all browsers
    const closePromises = Array.from(this.browsers.keys())
      .map(id => this.closeBrowser(id));
    
    await Promise.allSettled(closePromises);
    
    logger.info('Browser pool shutdown complete');
  }

  /**
   * Reset pool state (for recovery after shutdown)
   */
  reset(): void {
    this.isShuttingDown = false;
    logger.info('Browser pool reset - ready for new requests');
  }
}

// Export singleton instance
export const browserPool = new BrowserPool({
  maxBrowsers: 3,
  maxPagesPerBrowser: 5,
  resourceOptimization: true,
  headless: true
});
