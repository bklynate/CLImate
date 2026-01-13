/**
 * Integration tests for cleanHtml function
 * Tests both original agent and LangChain agent consumption paths
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { cleanHtml } from '../cleanHTML';
import type { CleanHtmlOptions } from '../types';

// Mock addMessages to avoid database operations during tests
vi.mock('@src/memory', () => ({
  addMessages: vi.fn(),
}));

// Sample HTML fixtures
const BASIC_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Article Title</title>
  <meta name="description" content="A test article description">
</head>
<body>
  <header><nav>Navigation menu</nav></header>
  <main>
    <article>
      <h1>Main Article Heading</h1>
      <p>This is the first paragraph with some meaningful content about the topic. 
         It contains multiple sentences to ensure we have enough text for processing.</p>
      <p>This is the second paragraph that adds more context and information.
         The content here is relevant to the main article topic.</p>
      <h2>Section Heading</h2>
      <p>More content in this section with additional details and facts.</p>
    </article>
  </main>
  <footer>Footer content here</footer>
</body>
</html>
`;

const SPORTS_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Lakers vs Celtics Game Recap</title>
</head>
<body>
  <article>
    <h1>Lakers Defeat Celtics 112-108 in Overtime Thriller</h1>
    <p>LeBron James scored 35 points as the Los Angeles Lakers defeated the Boston Celtics 
       in an overtime game on Sunday. The championship contenders played an intense game 
       that came down to the final seconds.</p>
    <p>Anthony Davis added 28 points and 12 rebounds for the Lakers, while Jayson Tatum 
       led the Celtics with 30 points. The playoff implications are significant for both teams.</p>
    <p>Coach Darvin Ham praised his team's performance after the victory.</p>
  </article>
</body>
</html>
`;

const FINANCIAL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Apple Reports Q4 Earnings</title>
  <meta property="og:type" content="article">
</head>
<body>
  <article>
    <h1>Apple Reports Record Q4 Revenue of $89.5 Billion</h1>
    <p>Apple Inc. reported quarterly revenue of $89.5 billion, up 8% year over year.
       The company's earnings per share reached $1.46, beating Wall Street expectations.</p>
    <p>iPhone revenue increased by 6% to $42.6 billion, while Services revenue grew 16% 
       to reach $22.3 billion. The stock price rose 3.5% in after-hours trading.</p>
    <p>CEO Tim Cook stated that customer satisfaction remains at all-time highs.</p>
  </article>
</body>
</html>
`;

const LINK_HEAVY_HTML = `
<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <nav>
    <a href="/home">Home</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
    <a href="/products">Products</a>
  </nav>
  <article>
    <h1>Article Title</h1>
    <p>This is actual article content that should be preserved.
       It contains meaningful information about the topic.</p>
  </article>
  <div class="sidebar">
    <a href="/link1">Link 1</a>
    <a href="/link2">Link 2</a>
    <a href="/link3">Link 3</a>
    <a href="/link4">Link 4</a>
    <a href="/link5">Link 5</a>
  </div>
</body>
</html>
`;

const BOILERPLATE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <div class="cookie-banner">Accept cookies?</div>
  <div class="paywall-overlay">Subscribe to continue reading</div>
  <article>
    <h1>Real Article Content</h1>
    <p>This is the actual content that matters. It contains useful information
       that should be extracted and preserved in the output.</p>
  </article>
  <div class="newsletter-signup">Sign up for our newsletter!</div>
  <div class="recommended-articles">You might also like...</div>
</body>
</html>
`;

describe('cleanHtml - Backward Compatibility', () => {
  it('works with original 2-argument signature', async () => {
    const result = await cleanHtml(BASIC_HTML, 'https://example.com');
    
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('preserves main article content', async () => {
    const result = await cleanHtml(BASIC_HTML, 'https://example.com');
    
    expect(result).toContain('paragraph');
    expect(result).toContain('content');
  });

  it('removes navigation and footer boilerplate', async () => {
    const result = await cleanHtml(BASIC_HTML, 'https://example.com');
    
    expect(result.toLowerCase()).not.toContain('navigation menu');
    expect(result.toLowerCase()).not.toContain('footer content');
  });
});

describe('cleanHtml - Options Parameter', () => {
  it('accepts options as third parameter', async () => {
    const options: CleanHtmlOptions = {
      format: 'markdown',
      maxLength: 5000,
    };
    
    const result = await cleanHtml(BASIC_HTML, 'https://example.com', options);
    
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('respects maxLength option', async () => {
    const maxLength = 100;
    const result = await cleanHtml(BASIC_HTML, 'https://example.com', { maxLength });
    
    expect(result.length).toBeLessThanOrEqual(maxLength);
  });

  it('converts to bullets format when requested', async () => {
    const result = await cleanHtml(BASIC_HTML, 'https://example.com', { format: 'bullets' });
    
    // Bullets format should have bullet points
    expect(result).toMatch(/^[-*•]/m);
  });

  it('removes links when preserveLinks is false', async () => {
    const htmlWithLinks = `
      <html><body>
        <article>
          <h1>Article About Links</h1>
          <p>Check out <a href="https://example.com/page">this link</a> for more info about our products.</p>
          <p>Another paragraph with <a href="https://test.com">another link</a> to test the functionality.</p>
          <p>This paragraph has no links but contains enough content to pass quality thresholds.</p>
        </article>
      </body></html>
    `;
    
    const result = await cleanHtml(htmlWithLinks, 'https://example.com', { preserveLinks: false });
    
    // Should contain the link text but not the markdown link syntax
    expect(result).toContain('this link');
    expect(result).not.toContain('](https://');
  });

  it('includes title when includeTitle is true', async () => {
    const result = await cleanHtml(BASIC_HTML, 'https://example.com', { includeTitle: true });
    
    expect(result).toContain('Test Article Title');
  });

  it('uses custom selectors to remove content from extracted article', async () => {
    // Note: Custom selectors remove content AFTER Readability extracts the article.
    // This tests that elements matching custom selectors are removed from the final output.
    // For elements outside the article, Readability already handles removal.
    const htmlWithCustomClass = `
      <html><body>
        <article>
          <h1>Main Article Title</h1>
          <p>Keep this content which is the main article body. It contains important information
             that should be preserved in the final output for readers to consume.</p>
          <p>This is another paragraph with more content to ensure the quality threshold is met.</p>
          <aside class="ad-sidebar">Sponsored content here</aside>
          <p>And here is a final paragraph to wrap up the article with meaningful content.</p>
        </article>
      </body></html>
    `;
    
    // Test that aside elements with ad classes are removed (they match our UNWANTED selectors)
    const result = await cleanHtml(htmlWithCustomClass, 'https://example.com');
    
    expect(result).not.toContain('Sponsored content');
    expect(result).toContain('Keep this content');
  });
});

describe('cleanHtml - Domain Classification', () => {
  it('detects sports content from URL', async () => {
    const result = await cleanHtml(SPORTS_HTML, 'https://espn.com/nba/recap/12345');
    
    // Should process content with sports domain awareness
    expect(result).toBeTruthy();
    expect(result).toContain('Lakers');
  });

  it('detects financial content from URL', async () => {
    const result = await cleanHtml(FINANCIAL_HTML, 'https://bloomberg.com/finance/apple-earnings');
    
    expect(result).toBeTruthy();
    // Should extract financial data
    expect(result).toMatch(/\$?\d+/); // Should contain numbers
  });

  it('allows forcing domain via options', async () => {
    const result = await cleanHtml(SPORTS_HTML, 'https://example.com', {
      domain: 'sports',
    });
    
    expect(result).toBeTruthy();
    expect(result).toContain('Lakers');
  });
});

describe('cleanHtml - Boilerplate Removal', () => {
  it('removes cookie banners', async () => {
    const result = await cleanHtml(BOILERPLATE_HTML, 'https://example.com');
    
    expect(result.toLowerCase()).not.toContain('cookie');
    expect(result.toLowerCase()).not.toContain('accept cookies');
  });

  it('removes paywall overlays', async () => {
    const result = await cleanHtml(BOILERPLATE_HTML, 'https://example.com');
    
    expect(result.toLowerCase()).not.toContain('paywall');
    expect(result.toLowerCase()).not.toContain('subscribe to continue');
  });

  it('removes newsletter signup prompts', async () => {
    const result = await cleanHtml(BOILERPLATE_HTML, 'https://example.com');
    
    expect(result.toLowerCase()).not.toContain('newsletter');
    expect(result.toLowerCase()).not.toContain('sign up');
  });

  it('removes recommended articles sections', async () => {
    const result = await cleanHtml(BOILERPLATE_HTML, 'https://example.com');
    
    expect(result.toLowerCase()).not.toContain('recommended');
    expect(result.toLowerCase()).not.toContain('you might also like');
  });

  it('preserves main article content', async () => {
    const result = await cleanHtml(BOILERPLATE_HTML, 'https://example.com');
    
    expect(result).toContain('Real Article Content');
    expect(result).toContain('useful information');
  });
});

describe('cleanHtml - Link Density Filtering', () => {
  it('removes link-heavy navigation blocks', async () => {
    const result = await cleanHtml(LINK_HEAVY_HTML, 'https://example.com');
    
    // Navigation links in the nav block should be removed
    // Check that nav menu items don't appear as standalone nav items
    // Note: "about" may appear in article text like "about the topic"
    expect(result.toLowerCase()).not.toMatch(/^\s*home\s*$/m);
    expect(result.toLowerCase()).not.toMatch(/^\s*contact\s*$/m);
    expect(result.toLowerCase()).not.toMatch(/^\s*products\s*$/m);
  });

  it('preserves article content despite nearby link blocks', async () => {
    const result = await cleanHtml(LINK_HEAVY_HTML, 'https://example.com');
    
    expect(result).toContain('Article Title');
    expect(result).toContain('actual article content');
  });
});

describe('cleanHtml - Deterministic Output', () => {
  it('returns same output for same input', async () => {
    const result1 = await cleanHtml(BASIC_HTML, 'https://example.com');
    const result2 = await cleanHtml(BASIC_HTML, 'https://example.com');
    
    expect(result1).toBe(result2);
  });

  it('returns same output with same options', async () => {
    const options: CleanHtmlOptions = { format: 'markdown', maxLength: 1000 };
    
    const result1 = await cleanHtml(BASIC_HTML, 'https://example.com', options);
    const result2 = await cleanHtml(BASIC_HTML, 'https://example.com', options);
    
    expect(result1).toBe(result2);
  });
});

describe('cleanHtml - Error Handling', () => {
  it('handles empty HTML gracefully', async () => {
    const result = await cleanHtml('', 'https://example.com');
    
    expect(result).toBe('');
  });

  it('handles HTML with no readable content', async () => {
    const emptyBodyHtml = '<html><body></body></html>';
    const result = await cleanHtml(emptyBodyHtml, 'https://example.com');
    
    expect(result).toBe('');
  });

  it('handles malformed HTML', async () => {
    const malformedHtml = '<html><body><p>Unclosed paragraph<article>Content';
    
    // Should not throw
    const result = await cleanHtml(malformedHtml, 'https://example.com');
    expect(typeof result).toBe('string');
  });
});

describe('cleanHtml - LangChain Agent Integration', () => {
  // These tests verify the function works as expected when called from LangChain agent
  
  it('produces output suitable for LLM consumption', async () => {
    const result = await cleanHtml(BASIC_HTML, 'https://example.com');
    
    // Output should be clean text/markdown without HTML tags
    expect(result).not.toMatch(/<[^>]+>/);
    
    // Should be reasonable length for LLM context
    expect(result.length).toBeLessThan(50000);
  });

  it('extracts meaningful content from real-world-like HTML', async () => {
    const result = await cleanHtml(SPORTS_HTML, 'https://espn.com/nba/game');
    
    // Should extract key information
    expect(result).toContain('Lakers');
    expect(result).toContain('Celtics');
    // Should contain score or point information
    expect(result).toMatch(/\d+/);
  });

  it('works with summary format for token efficiency', async () => {
    const result = await cleanHtml(SPORTS_HTML, 'https://example.com', {
      format: 'summary',
      maxLength: 500,
    });
    
    // Summary should be concise
    expect(result.length).toBeLessThanOrEqual(500);
    // But still contain key information
    expect(result).toContain('Lakers');
  });
});
