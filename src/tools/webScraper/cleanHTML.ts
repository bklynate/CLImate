/* eslint-disable no-control-regex */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { addMessages } from '@src/memory';
import { pipeline } from '@xenova/transformers';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import nlp from 'compromise';
import natural from 'natural';

process.env.ORT_LOG_SEVERITY_LEVEL = '3';

/* ------------------------------------------------------------------ */
/*  Summarizer singleton                                               */
/* ------------------------------------------------------------------ */

let summarizerPromise: Promise<any> | null = null;

async function getSummarizer() {
  if (!summarizerPromise) {
    summarizerPromise = (async () => {
      try {
        return await pipeline('summarization', 'Xenova/bart-large-cnn');
      } catch (error) {
        console.warn('Failed to load BART-large-cnn, falling back to distilbart:', error);
        return pipeline('summarization', 'Xenova/distilbart-cnn-12-6');
      }
    })();
  }
  return summarizerPromise;
}

/* ------------------------------------------------------------------ */
/*  DOM pre/post sanitization                                          */
/* ------------------------------------------------------------------ */

const UNWANTED = [
  // Core content filtering
  '.share', '.social', '.ad', '.promo', '.footer', '.related', '.tags',
  '.author-box', 'nav', 'form', '[hidden]', '[aria-hidden="true"]',

  // Cookie/Privacy/Consent
  '[class*="cookie"]', '[id*="cookie"]', '[class*="consent"]', '[class*="gdpr"]',
  '[class*="privacy"]', '[class*="banner"]',

  // Popups/Modals
  '[class*="popup"]', '[class*="modal"]', '[class*="overlay"]', '[class*="lightbox"]',
  '[role="dialog"]', '[aria-modal="true"]',

  // Advertising
  '[class*="ad-"]', '[class*="ads"]', '[data-ad]', '[data-google-ad]',
  'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',

  // Social/Engagement
  '[class*="follow"]', '[class*="subscribe"]', '[class*="newsletter"]', '[class*="signup"]',

  // Navigation/UI
  '[class*="breadcrumb"]', '[class*="pagination"]', '[class*="sidebar"]', '[class*="widget"]',
  'header', 'aside', '.header', '.sidebar',

  // Comments/User Content
  '[class*="comment"]', '[class*="discuss"]'
];

function removeBoilerplate(node: Element) {
  UNWANTED.forEach((sel) => {
    node.querySelectorAll(sel).forEach((el) => el.remove());
  });
}

function preSanitize(doc: Document) {
  doc.querySelectorAll('script,style,noscript,svg,canvas,iframe,template').forEach(n => n.remove());
  doc.querySelectorAll('[role="banner"],header,footer,[class*="cookie"],[class*="consent"]').forEach(n => n.remove());
}

/* ------------------------------------------------------------------ */
/*  Turndown rules                                                     */
/* ------------------------------------------------------------------ */

const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

turndownService.addRule('headingHR', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: (_content, node) => {
    const level = Number((node as Element).tagName.substring(1));
    const text = (node as Element).textContent?.trim() || '';
    return text ? `\n\n---\n\n${'#'.repeat(level)} ${text}\n\n` : '';
  },
});

// Simple HTMLTableElement -> Markdown converter
function tableElementToMarkdown(tableEl: HTMLTableElement): string {
  const rows = Array.from(tableEl.querySelectorAll('tr')).map(tr =>
    Array.from(tr.querySelectorAll('th,td')).map(td =>
      td.textContent?.trim().replace(/\s+/g, ' ') || ''
    )
  ).filter(r => r.length > 0);

  if (!rows.length) return '';
  const header = rows[0];
  const body = rows.slice(1);

  const toRow = (cols: string[]) => `| ${cols.join(' | ')} |`;
  const sep = `| ${header.map(() => '---').join(' | ')} |`;

  return [toRow(header), sep, ...body.map(toRow)].join('\n');
}

turndownService.addRule('tableToMarkdown', {
  filter: 'table',
  replacement: (_content, node) => {
    try {
      const md = tableElementToMarkdown(node as HTMLTableElement);
      return md ? `\n\n${md}\n\n` : '';
    } catch {
      const txt = (node as Element).textContent?.trim() || '';
      return txt ? `\n\n${txt}\n\n` : '';
    }
  },
});

function isUsableUrl(href?: string | null) {
  if (!href) return false;
  try {
    const u = new URL(href, 'https://example.com');
    if (!/^https?:$/.test(u.protocol)) return false;
    return !!u.hostname;
  } catch {
    return false;
  }
}

turndownService.addRule('cleanLinks', {
  filter: 'a',
  replacement: (content, node) => {
    const href = (node as Element).getAttribute('href');
    const text = content.trim();
    if (!text) return '';
    if (!isUsableUrl(href)) return text;
    if ((href || '').length > 150) return text; // avoid clutter
    return `[${text}](${href})`;
  },
});

/* ------------------------------------------------------------------ */
/*  Markdown cleanup via Remark                                        */
/* ------------------------------------------------------------------ */

function remarkCleanMarkdown() {
  return (tree: any) => {
    visit(tree, (node: any, index: number | null, parent: any) => {
      // Sanitize link nodes
      if (node.type === 'link') {
        const url = node.url || '';
        const bad =
          !url ||
          url.includes('\n') ||
          url.includes(' ') ||
          url.startsWith('javascript:') ||
          /^https?:\/\/[^\s\/]+$/.test(url) ||
          url.length > 150;

        if (bad) {
          const textContent = (node.children || [])
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.value)
            .join('');
          if (parent && typeof index === 'number') {
            parent.children.splice(index, 1, {
              type: 'text',
              value: textContent || '',
            });
          }
          return;
        }
      }

      // Remove broken images
      if (node.type === 'image') {
        const url = node.url || '';
        const alt = (node.alt || '').trim();
        const bad =
          !url ||
          url.includes('\n') ||
          url.includes(' ') ||
          url.startsWith('data:') ||
          !alt;
        if (bad && parent && typeof index === 'number') {
          parent.children.splice(index, 1);
          return;
        }
      }

      // Clean up empty or minimal headers
      if (node.type === 'heading') {
        const textContent = (node.children || [])
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.value)
          .join('')
          .trim();
        if (!textContent || textContent.length < 3) {
          if (parent && typeof index === 'number') parent.children.splice(index, 1);
          return;
        }
      }

      // Remove empty list items
      if (node.type === 'listItem') {
        const hasContent = (node.children || []).some((child: any) => {
          if (child.type === 'paragraph') {
            const text = (child.children || [])
              .filter((gc: any) => gc.type === 'text')
              .map((gc: any) => gc.value)
              .join('')
              .trim();
            return text && text.length > 3;
          }
          return child.type === 'list' || child.type === 'blockquote';
        });
        if (!hasContent && parent && typeof index === 'number') {
          parent.children.splice(index, 1);
          return;
        }
      }

      // Clean up text nodes
      if (node.type === 'text') {
        node.value = String(node.value || '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\\\>/g, '>')
          .replace(/[ \t]{3,}/g, '  ');
        if (node.value.trim().length === 0 || /^[,.;:!? \-]*$/.test(node.value)) {
          if (parent && typeof index === 'number') parent.children.splice(index, 1);
          return;
        }
      }
    });
  };
}

async function cleanMarkdownArtifacts(markdown: string): Promise<string> {
  try {
    const processor = remark().use(remarkGfm).use(remarkCleanMarkdown);
    const result = await processor.process(markdown);
    let cleaned = String(result);
    cleaned = cleaned
      .replace(/\n{4,}/g, '\n\n\n') // cap to 3 newlines
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
    return cleaned;
  } catch (error) {
    console.warn('Remark processing failed, falling back to original:', error);
    return markdown;
  }
}

/* ------------------------------------------------------------------ */
/*  String utilities                                                   */
/* ------------------------------------------------------------------ */

function prettyWhitespace(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\*{2,}/gm, '*')
    .replace(/^[·•]/gm, '*')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/ /g, ' ')
    .replace(/\.{3,}/g, '…');
}

function dedupeContent(markdown: string): string {
  const paragraphs = markdown.split(/\n\s*\n/);
  const seenContent = new Set<string>();
  const seenSentences = new Set<string>();
  const uniqueParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#') || trimmed.startsWith('**') || trimmed.startsWith('```')) {
      uniqueParagraphs.push(trimmed);
      continue;
    }

    const normalized = trimmed
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (seenContent.has(normalized)) continue;

    const sentences = trimmed
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);

    const uniqueSentences: string[] = [];
    for (const sentence of sentences) {
      const normalizedSentence = sentence
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (normalizedSentence.length > 20 && !seenSentences.has(normalizedSentence)) {
        uniqueSentences.push(sentence);
        seenSentences.add(normalizedSentence);
      }
    }

    if (uniqueSentences.length > 0) {
      const rebuilt = uniqueSentences.join('. ').replace(/\.\s*$/, '') + '.';
      uniqueParagraphs.push(rebuilt);
      seenContent.add(normalized);
    }
  }

  return uniqueParagraphs.join('\n\n');
}

/* ------------------------------------------------------------------ */
/*  Classification + extractive utils                                  */
/* ------------------------------------------------------------------ */

interface ContentClassification {
  domain: 'sports' | 'news' | 'financial' | 'technical' | 'entertainment' | 'general';
  subtype: string;
  priority: 'high' | 'medium' | 'low';
  dataType: 'structured' | 'narrative' | 'mixed';
  keyEntities: string[];
  confidenceScore: number;
}

function classifyContent(text: string): ContentClassification {
  const doc = nlp(text);
  const people = doc.people().out('array');
  const places = doc.places().out('array');
  const organizations = doc.organizations().out('array');
  const numbers = doc.numbers().out('array');

  const tokenizer = new natural.WordTokenizer();
  const tokens = tokenizer.tokenize(text.toLowerCase());
  const stemmed = tokens.map((t: string) => natural.PorterStemmer.stem(t));

  const sportsTerms = ['game', 'team', 'player', 'score', 'season', 'coach', 'championship', 'league', 'stadium', 'playoff'];
  const financialTerms = ['stock', 'market', 'price', 'earnings', 'revenue', 'profit', 'investment', 'trading', 'dollar'];
  const newsTerms = ['breaking', 'report', 'announced', 'statement', 'official', 'according', 'source', 'investigate'];
  const techTerms = ['software', 'technology', 'app', 'system', 'platform', 'digital', 'algorithm', 'data', 'api'];

  const scores = {
    sports: sportsTerms.filter(term => stemmed.includes(natural.PorterStemmer.stem(term))).length,
    financial: financialTerms.filter(term => stemmed.includes(natural.PorterStemmer.stem(term))).length,
    news: newsTerms.filter(term => stemmed.includes(natural.PorterStemmer.stem(term))).length,
    technical: techTerms.filter(term => stemmed.includes(natural.PorterStemmer.stem(term))).length,
  };

  const maxScore = Math.max(...Object.values(scores));
  const domain = maxScore > 1
    ? (Object.entries(scores).find(([_, s]) => s === maxScore)?.[0] as ContentClassification['domain']) || 'general'
    : 'general';

  let subtype = 'standard';
  if (domain === 'sports') {
    if (doc.has('betting') || doc.has('odds')) subtype = 'betting';
    else if (doc.has('statistics') || doc.has('analytics')) subtype = 'statistics';
    else if (doc.has('trade') || doc.has('roster')) subtype = 'transactions';
  } else if (domain === 'financial') {
    if (doc.has('earnings') || doc.has('quarterly')) subtype = 'earnings';
    else if (doc.has('merger') || doc.has('acquisition')) subtype = 'corporate';
  }

  const hasList = /\n[-*+]\s/.test(text);
  const hasTable = /\|.+\|/.test(text) || /\*\*Table\*\*/.test(text);
  const hasNumbers = numbers.length > 0;

  let dataType: ContentClassification['dataType'] = 'narrative';
  if (hasNumbers && (hasList || hasTable)) dataType = 'structured';
  else if (hasNumbers || hasList) dataType = 'mixed';

  const allEntities = [...new Set([...people, ...places, ...organizations])];
  const keyEntities = allEntities.slice(0, 6);

  const entityBonus = keyEntities.length * 5;
  const numberBonus = numbers.length > 0 ? 10 : 0;
  const confidenceScore = Math.min(100, (maxScore * 20) + entityBonus + numberBonus + 30);

  return {
    domain,
    subtype,
    priority: maxScore >= 3 ? 'high' : maxScore >= 1 ? 'medium' : 'low',
    dataType,
    keyEntities,
    confidenceScore,
  };
}

function naturalExtractiveSummary(text: string, maxSentences = 3): string {
  const doc = nlp(text);
  const sentences = doc.sentences().out('array');
  if (sentences.length <= maxSentences) return text;

  const scored = sentences.map((s: string) => {
    const d = nlp(s);
    let score = 0;
    score += d.numbers().length * 2;
    // @ts-ignore
    score += (d as any).percentages?.().length ? (d as any).percentages().length * 2 : 0;
    // @ts-ignore
    score += (d as any).money?.().length ? (d as any).money().length * 2 : 0;
    score += d.people().length;
    score += d.organizations().length;
    score += d.verbs().length * 0.5;
    if (s.split(' ').length < 5) score -= 2;
    return { s, score };
  });

  const top = scored.sort((a: any, b: any) => b.score - a.score).slice(0, maxSentences).map((x: any) => x.s);
  return top.join(' ');
}

/* ------------------------------------------------------------------ */
/*  Token-aware-ish chunking + MMR                                     */
/* ------------------------------------------------------------------ */

function estimateTokens(text: string) {
  // quick heuristic ~4 chars/token
  return Math.ceil(text.length / 4);
}

function chunkByTokens(text: string, maxTokens = 900) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let buf: string[] = [];
  let count = 0;

  for (const s of sentences) {
    const t = estimateTokens(s);
    if (count + t > maxTokens && buf.length) {
      chunks.push(buf.join(' '));
      buf = [s];
      count = t;
    } else {
      buf.push(s);
      count += t;
    }
  }
  if (buf.length) chunks.push(buf.join(' '));
  return chunks;
}

function jaccard(a: string, b: string) {
  const A = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const B = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  const inter = [...A].filter(x => B.has(x)).length;
  return inter / (A.size + B.size - inter);
}

function scoreChunk(c: string) {
  let score = 0;
  if (/#/.test(c)) score += 2;
  if (/\d/.test(c)) score += 1.5;
  if (/\b[A-Z][a-z]{2,}\b/.test(c)) score += 1;
  return score + Math.min(1, c.length / 1000);
}

function mmrPick(chunks: string[], k = 4) {
  const picked: string[] = [];
  const pool = [...chunks];
  while (picked.length < k && pool.length) {
    pool.sort((a, b) => scoreChunk(b) - scoreChunk(a));
    const candidate = pool.shift()!;
    const simToPicked = picked.length ? Math.max(...picked.map(p => jaccard(candidate, p))) : 0;
    if (simToPicked < 0.6) picked.push(candidate);
  }
  return picked.length ? picked : chunks.slice(0, k);
}

/* ------------------------------------------------------------------ */
/*  Summarization pipeline                                             */
/* ------------------------------------------------------------------ */

function postProcessSummary(summary: string): string {
  let s = summary;
  const fillers = [
    /\baccording to (the )?report[s]?\b/gi,
    /\bthe article (states|mentions|says|reports)\b/gi,
    /\bin addition to\b/gi,
    /\bit is important to note that\b/gi,
    /\bit should be noted that\b/gi,
    /\bas previously mentioned\b/gi,
    /\bfor example,?\b/gi,
    /\bfor instance,?\b/gi,
    /\bin conclusion,?\b/gi,
    /\bto summarize,?\b/gi,
    /\boverall,?\b/gi,
    /\bin summary,?\b/gi,
  ];
  fillers.forEach(re => { s = s.replace(re, ''); });

  s = s
    .replace(/\bmore than\b/gi, '>')
    .replace(/\bless than\b/gi, '<')
    .replace(/\bapproximately\b/gi, '~')
    .replace(/\babout\b/gi, '~')
    .replace(/\bdollars?\b/gi, '$')
    .replace(/\bpercent\b/gi, '%')
    .replace(/\bmillion\b/gi, 'M')
    .replace(/\bbillion\b/gi, 'B')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*\.\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*,/g, ',')
    .trim();

  return s;
}

async function abstractiveSummarize(text: string, targetWords = 150) {
  const model = await getSummarizer();
  const maxLen = Math.floor(targetWords * 1.8); // token-ish
  const minLen = Math.floor(targetWords * 0.8);
  const out = await model(text, {
    max_length: Math.max(60, maxLen),
    min_length: Math.max(30, minLen),
    no_repeat_ngram_size: 3,
    do_sample: false,
    early_stopping: true,
  });
  const summary = out?.[0]?.summary_text?.trim() || '';
  return postProcessSummary(summary);
}

async function twoStageSummarize(markdown: string): Promise<string> {
  const classification = classifyContent(markdown);
  const tokens = estimateTokens(markdown);
  if (tokens < 1200) return markdown; // small enough, keep as-is

  const chunks = chunkByTokens(markdown, 900);
  const top = mmrPick(chunks, 4);

  const extracts = top.map(c => naturalExtractiveSummary(c, 3)).join('\n');
  const final = await abstractiveSummarize(extracts, 160);
  return final || markdown;
}

/* ------------------------------------------------------------------ */
/*  Meta extraction + main export                                      */
/* ------------------------------------------------------------------ */

function extractMeta(doc: Document) {
  const title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    doc.querySelector('title')?.textContent?.trim() ||
    '';

  const published =
    doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
    doc.querySelector('time[datetime]')?.getAttribute('datetime') ||
    '';

  const lang = doc.documentElement.getAttribute('lang') || '';
  return { title, published, lang };
}

export async function cleanHtml(rawHtml: string, url: string): Promise<string> {
  try {
    // Pre-sanitize before Readability
    const dom = new JSDOM(rawHtml, { url });
    preSanitize(dom.window.document);

    const reader = new Readability(dom.window.document, { charThreshold: 500 });
    const article = reader.parse();

    if (!article?.content) {
      await addMessages([{ role: 'assistant', content: `No readable content found at ${url}.` }]);
      return '';
    }

    // Post-sanitize inside the extracted article
    const bodyDom = new JSDOM(article.content, { url });
    const body = bodyDom.window.document.body;
    removeBoilerplate(body);

    // Convert to Markdown
    let markdown = turndownService.turndown(body.innerHTML);
    markdown = dedupeContent(prettyWhitespace(markdown));
    markdown = await cleanMarkdownArtifacts(markdown);

    // Summarize if oversized (two-stage: extractive -> abstractive)
    const cleaned = await twoStageSummarize(markdown);

    // Add lightweight frontmatter for the agent
    const meta = extractMeta(dom.window.document);
    return [
      '---',
      `source_url: ${url}`,
      `title: "${meta.title.replace(/"/g, '\\"')}"`,
      `published: "${meta.published}"`,
      `lang: "${meta.lang}"`,
      '---',
      '',
      cleaned,
    ].join('\n');
  } catch (error: any) {
    console.error(`Failed to clean HTML from ${url}:`, error?.message || error);
    throw new Error(`Error cleaning HTML from ${url}`);
  }
}
