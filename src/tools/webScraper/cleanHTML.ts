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

let summarizer: any;

async function getSummarizer() {
  if (!summarizer) {
    // Using BART-large-cnn for better quality (confirmed available in Xenova)
    // Fallback to distilbart if large model fails to load
    try {
      summarizer = await pipeline('summarization', 'Xenova/bart-large-cnn');
    } catch (error) {
      console.warn('Failed to load BART-large-cnn, falling back to distilbart:', error);
      summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6');
    }
  }
  return summarizer;
}

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

const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

turndownService.addRule('headingHR', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: (content, node) => {
    const level = Number((node as Element).tagName.substring(1));
    return `\n\n---\n\n${'#'.repeat(level)} ${content}\n\n`;
  },
});

turndownService.addRule('preserveTable', {
  filter: 'table',
  replacement: (content, node) => {
    // Extract text content from table instead of converting to JSON
    const textContent = (node as Element).textContent?.trim() || '';
    
    // Skip empty tables or tables with minimal content
    if (textContent.length < 10) {
      return '';
    }
    
    // Limit table content to prevent noise, clean up whitespace
    const cleanedContent = textContent
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, 300); // Limit length
    
    return `\n\n**Table**: ${cleanedContent}${textContent.length > 300 ? '...' : ''}\n\n`;
  },
});

turndownService.addRule('cleanLinks', {
  filter: 'a',
  replacement: (content, node) => {
    const href = (node as Element).getAttribute('href');
    const text = content.trim();
    
    // Skip empty links
    if (!text) return '';
    
    // Skip if URL is malformed or incomplete
    if (!href || href.startsWith('javascript:') || href === '#' || href.length < 10) {
      return text;
    }
    
    // Skip if URL looks incomplete (common in scraped content)
    if (href.match(/^https?:\/\/[^\s\/]+$/) || href.includes('\n') || href.includes(' ')) {
      return text;
    }
    
    // For very long URLs, just return the text to avoid clutter
    if (href.length > 100) {
      return text;
    }
    
    return `[${text}](${href})`;
  },
});

function dedupeContent(markdown: string): string {
  // Split into paragraphs and sentences for better deduplication
  const paragraphs = markdown.split(/\n\s*\n/);
  const seenContent = new Set<string>();
  const seenSentences = new Set<string>();
  const uniqueParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    
    // Skip empty paragraphs
    if (!trimmed) continue;
    
    // Always keep headers and special formatting
    if (trimmed.startsWith('#') || trimmed.startsWith('**') || trimmed.startsWith('```')) {
      uniqueParagraphs.push(trimmed);
      continue;
    }

    // Normalize content for comparison (remove punctuation, lowercase, collapse whitespace)
    const normalized = trimmed
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Skip if we've seen this content before
    if (seenContent.has(normalized)) {
      continue;
    }

    // Check for sentence-level duplication within the paragraph
    const sentences = trimmed.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
    const uniqueSentences: string[] = [];
    
    for (const sentence of sentences) {
      const normalizedSentence = sentence
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Keep sentence if it's new and substantial
      if (normalizedSentence.length > 20 && !seenSentences.has(normalizedSentence)) {
        uniqueSentences.push(sentence);
        seenSentences.add(normalizedSentence);
      }
    }

    // Add paragraph if it has unique sentences
    if (uniqueSentences.length > 0) {
      const rebuiltParagraph = uniqueSentences.join('. ').replace(/\.\s*$/, '') + '.';
      uniqueParagraphs.push(rebuiltParagraph);
      seenContent.add(normalized);
    }
  }

  return uniqueParagraphs.join('\n\n');
}

function prettyWhitespace(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, '\n') // trailing spaces
    .replace(/\n{3,}/g, '\n\n') // collapse ≥3 newlines
    .replace(/^\*{2,}/gm, '*') // "***" → "*"
    .replace(/^[·•]/gm, '*') // normalize bullets
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/ /g, ' ') // narrow space
    .replace(/\.{3,}/g, '…'); // long ellipses
}


// Remark transformer to clean up malformed markdown
function remarkCleanMarkdown() {
  return (tree: any) => {
    visit(tree, (node, index, parent) => {
      // Fix malformed links
      if (node.type === 'link') {
        // Remove links with invalid URLs
        if (!node.url || 
            node.url.includes('\n') || 
            node.url.includes(' ') ||
            node.url.startsWith('javascript:') ||
            node.url === '#' ||
            node.url.match(/^https?:\/\/[^\s\/]+$/)) {
          
          // Replace with text content
          if (node.children && node.children.length > 0) {
            const textContent = node.children
              .filter((child: any) => child.type === 'text')
              .map((child: any) => child.value)
              .join('');
            
            if (textContent.trim()) {
              parent?.children.splice(index, 1, {
                type: 'text',
                value: textContent
              });
            } else {
              parent?.children.splice(index, 1);
            }
          } else {
            parent?.children.splice(index, 1);
          }
          return;
        }
        
        // Remove very long URLs that clutter the output
        if (node.url.length > 100) {
          const textContent = node.children
            .filter((child: any) => child.type === 'text')
            .map((child: any) => child.value)
            .join('');
          
          parent?.children.splice(index, 1, {
            type: 'text',
            value: textContent || 'link'
          });
          return;
        }
      }
      
      // Remove broken images
      if (node.type === 'image') {
        if (!node.url || 
            node.url.includes('data:image') ||
            node.url.includes('\n') ||
            node.url.includes(' ') ||
            !node.alt?.trim()) {
          parent?.children.splice(index, 1);
          return;
        }
      }
      
      // Clean up empty or minimal headers
      if (node.type === 'heading') {
        const textContent = node.children
          ?.filter((child: any) => child.type === 'text')
          ?.map((child: any) => child.value)
          ?.join('')
          ?.trim();
        
        if (!textContent || textContent.length < 3) {
          parent?.children.splice(index, 1);
          return;
        }
      }
      
      // Remove empty list items
      if (node.type === 'listItem') {
        const hasContent = node.children?.some((child: any) => {
          if (child.type === 'paragraph') {
            const text = child.children
              ?.filter((grandchild: any) => grandchild.type === 'text')
              ?.map((grandchild: any) => grandchild.value)
              ?.join('')
              ?.trim();
            return text && text.length > 3;
          }
          return child.type === 'list' || child.type === 'blockquote';
        });
        
        if (!hasContent) {
          parent?.children.splice(index, 1);
          return;
        }
      }
      
      // Clean up text nodes
      if (node.type === 'text') {
        // Fix HTML entities
        node.value = node.value
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\\\>/g, '>')
          .replace(/[ \t]{3,}/g, '  '); // Limit excessive spaces
        
        // Remove if just whitespace or minimal content
        if (node.value.trim().length === 0 || 
            /^[,\.\;\:\!\?\s—–\-]*$/.test(node.value)) {
          parent?.children.splice(index, 1);
          return;
        }
      }
    });
  };
}

async function cleanMarkdownArtifacts(markdown: string): Promise<string> {
  try {
    const processor = remark()
      .use(remarkGfm)
      .use(remarkCleanMarkdown);
    
    const result = await processor.process(markdown);
    let cleaned = String(result);
    
    // Final cleanup for whitespace
    cleaned = cleaned
      .replace(/\n{4,}/g, '\n\n\n') // Limit to max 3 newlines
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Normalize paragraph spacing
      .trim();
    
    return cleaned;
  } catch (error) {
    console.warn('Remark processing failed, falling back to original:', error);
    return markdown; // Fallback to original if remark fails
  }
}

function assessContentQuality(text: string): number {
  let score = 50; // Base score
  
  const trimmed = text.trim();
  if (!trimmed) return 0;
  
  // Word count scoring - optimal range gives bonus points
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount >= 30 && wordCount <= 300) {
    score += 20;
  } else if (wordCount >= 10 && wordCount < 30) {
    score += 10;
  } else if (wordCount < 10) {
    score -= 25;
  } else if (wordCount > 500) {
    score -= 10; // Very long might be repetitive
  }
  
  // Information density indicators
  const hasNumbers = /\d+/.test(trimmed);
  const hasProperNouns = /\b[A-Z][a-z]+\b/.test(trimmed);
  const hasCompleteStructure = /[.!?]/.test(trimmed);
  const sentenceCount = trimmed.split(/[.!?]+/).length - 1;
  
  if (hasNumbers) score += 10;
  if (hasProperNouns) score += 10;
  if (hasCompleteStructure && sentenceCount >= 2) score += 15;
  
  // Content richness - diverse vocabulary
  const uniqueWords = new Set(trimmed.toLowerCase().split(/\s+/));
  const vocabularyRatio = uniqueWords.size / wordCount;
  if (vocabularyRatio > 0.7) score += 10;
  else if (vocabularyRatio < 0.3) score -= 15;
  
  // Low-value content patterns (decrease score)
  const promotionalPatterns = /\b(subscribe|follow|buy now|click here|sign up|download|register|join now)\b/gi;
  const navigationPatterns = /\b(home|about|contact|menu|search|login|profile|settings)\b/gi;
  const metadataPatterns = /\b(posted|updated|published|tags|categories|share|tweet|like)\b/gi;
  const loadingPatterns = /\b(loading|please wait|error|404|not found|unavailable)\b/gi;
  
  const promotionalMatches = (trimmed.match(promotionalPatterns) || []).length;
  const navigationMatches = (trimmed.match(navigationPatterns) || []).length;
  const metadataMatches = (trimmed.match(metadataPatterns) || []).length;
  const loadingMatches = (trimmed.match(loadingPatterns) || []).length;
  
  score -= (promotionalMatches * 8);
  score -= (navigationMatches * 6);
  score -= (metadataMatches * 4);
  score -= (loadingMatches * 15);
  
  // Repetitive content detection
  const words = trimmed.toLowerCase().split(/\s+/);
  const wordFreq = new Map<string, number>();
  words.forEach(word => {
    if (word.length > 3) { // Only count meaningful words
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  });
  
  // Check for excessive repetition
  let repetitiveWords = 0;
  wordFreq.forEach(count => {
    if (count > Math.max(3, wordCount * 0.1)) {
      repetitiveWords += count;
    }
  });
  
  if (repetitiveWords > wordCount * 0.3) {
    score -= 20;
  }
  
  // Bonus for informational content
  const informationalPatterns = /\b(analysis|data|study|research|report|statistics|findings|results)\b/gi;
  const factualPatterns = /\b(according to|based on|study shows|data indicates|research suggests)\b/gi;
  
  if (informationalPatterns.test(trimmed)) score += 8;
  if (factualPatterns.test(trimmed)) score += 10;
  
  // Ensure score stays within bounds
  return Math.max(0, Math.min(100, score));
}

function intelligentChunk(markdown: string, maxChunkWords = 700): string[] {
  // First split by explicit separators (headers with ---) 
  const majorSections = markdown.split(/\n---\n/);
  const chunks: string[] = [];
  
  for (const section of majorSections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    
    const wordCount = trimmed.split(/\s+/).length;
    
    // If section is small enough, keep as-is
    if (wordCount <= maxChunkWords) {
      chunks.push(trimmed);
      continue;
    }
    
    // Split large sections at semantic boundaries
    // Priority: headers > paragraphs > sentences
    let subChunks: string[] = [];
    
    // Try splitting by headers first
    const headerSplit = trimmed.split(/\n(#{1,6}\s+[^\n]+)\n/);
    if (headerSplit.length > 1) {
      let currentChunk = '';
      
      for (let i = 0; i < headerSplit.length; i++) {
        const part = headerSplit[i];
        if (!part.trim()) continue;
        
        const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + part;
        const potentialWordCount = potentialChunk.split(/\s+/).length;
        
        if (potentialWordCount <= maxChunkWords) {
          currentChunk = potentialChunk;
        } else {
          if (currentChunk) {
            subChunks.push(currentChunk);
          }
          currentChunk = part;
        }
      }
      
      if (currentChunk) {
        subChunks.push(currentChunk);
      }
    } else {
      // Fall back to paragraph splitting
      const paragraphs = trimmed.split(/\n\s*\n/);
      let currentChunk = '';
      
      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) continue;
        
        const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraph;
        const potentialWordCount = potentialChunk.split(/\s+/).length;
        
        if (potentialWordCount <= maxChunkWords) {
          currentChunk = potentialChunk;
        } else {
          if (currentChunk) {
            subChunks.push(currentChunk);
          }
          
          // If single paragraph is too long, split by sentences
          const paragraphWordCount = paragraph.split(/\s+/).length;
          if (paragraphWordCount > maxChunkWords) {
            const sentences = paragraph.split(/(?<=[.!?])\s+/);
            let sentenceChunk = '';
            
            for (const sentence of sentences) {
              const potentialSentenceChunk = sentenceChunk + (sentenceChunk ? ' ' : '') + sentence;
              const sentenceWordCount = potentialSentenceChunk.split(/\s+/).length;
              
              if (sentenceWordCount <= maxChunkWords) {
                sentenceChunk = potentialSentenceChunk;
              } else {
                if (sentenceChunk) {
                  subChunks.push(sentenceChunk);
                }
                sentenceChunk = sentence;
              }
            }
            
            if (sentenceChunk) {
              subChunks.push(sentenceChunk);
            }
          } else {
            currentChunk = paragraph;
          }
        }
      }
      
      if (currentChunk) {
        subChunks.push(currentChunk);
      }
    }
    
    chunks.push(...subChunks);
  }
  
  return chunks.filter(chunk => chunk.trim().length > 0);
}

// STAGE 1: CLASSIFY - Identify content type and characteristics
interface ContentClassification {
  domain: 'sports' | 'news' | 'financial' | 'technical' | 'entertainment' | 'general';
  subtype: string;
  priority: 'high' | 'medium' | 'low';
  dataType: 'structured' | 'narrative' | 'mixed';
  keyEntities: string[];
  confidenceScore: number;
}

function classifyContent(text: string): ContentClassification {
  // Use Compromise for smart entity extraction
  const doc = nlp(text);
  const people = doc.people().out('array');
  const places = doc.places().out('array');
  const organizations = doc.organizations().out('array');
  const numbers = doc.numbers().out('array');
  
  // Use Natural for token analysis
  const tokenizer = new natural.WordTokenizer();
  const tokens = tokenizer.tokenize(text.toLowerCase());
  const stemmed = tokens.map((token: string) => natural.PorterStemmer.stem(token));
  
  // Enhanced domain detection using both libraries
  const sportsTerms = ['game', 'team', 'player', 'score', 'season', 'coach', 'championship', 'league', 'stadium', 'playoff'];
  const financialTerms = ['stock', 'market', 'price', 'earnings', 'revenue', 'profit', 'investment', 'trading', 'dollar'];
  const newsTerms = ['breaking', 'report', 'announced', 'statement', 'official', 'according', 'source', 'investigate'];
  const techTerms = ['software', 'technology', 'app', 'system', 'platform', 'digital', 'algorithm', 'data', 'api'];
  
  // Score domains using stemmed tokens for better matching
  const domainScores = {
    sports: sportsTerms.filter(term => stemmed.includes(natural.PorterStemmer.stem(term))).length,
    financial: financialTerms.filter(term => stemmed.includes(natural.PorterStemmer.stem(term))).length,
    news: newsTerms.filter(term => stemmed.includes(natural.PorterStemmer.stem(term))).length,
    technical: techTerms.filter(term => stemmed.includes(natural.PorterStemmer.stem(term))).length
  };
  
  const maxScore = Math.max(...Object.values(domainScores));
  const domain = maxScore > 1 ? 
    (Object.entries(domainScores).find(([_, score]) => score === maxScore)?.[0] as ContentClassification['domain']) || 'general' 
    : 'general';
  
  // Smart subtype detection using Compromise
  let subtype = 'standard';
  if (domain === 'sports') {
    if (doc.has('betting') || doc.has('odds')) subtype = 'betting';
    else if (doc.has('statistics') || doc.has('analytics')) subtype = 'statistics';
    else if (doc.has('trade') || doc.has('roster')) subtype = 'transactions';
  } else if (domain === 'financial') {
    if (doc.has('earnings') || doc.has('quarterly')) subtype = 'earnings';
    else if (doc.has('merger') || doc.has('acquisition')) subtype = 'corporate';
  }
  
  // Enhanced data structure detection
  const hasNumbers = numbers.length > 0 || doc.numbers().out('array').length > 0;
  const hasList = doc.match('#List').length > 2;
  const hasTable = /\*\*Table\*\*/.test(text);
  
  let dataType: ContentClassification['dataType'] = 'narrative';
  if (hasNumbers && (hasList || hasTable)) dataType = 'structured';
  else if (hasNumbers || hasList) dataType = 'mixed';
  
  // Combine entities from both libraries
  const allEntities = [...new Set([...people, ...places, ...organizations])];
  const keyEntities = allEntities.slice(0, 6);
  
  // Enhanced confidence calculation
  const entityBonus = keyEntities.length * 5;
  const numberBonus = numbers.length > 0 ? 10 : 0;
  const confidenceScore = Math.min(100, (maxScore * 20) + entityBonus + numberBonus + 30);
  
  return {
    domain,
    subtype,
    priority: maxScore >= 3 ? 'high' : maxScore >= 1 ? 'medium' : 'low',
    dataType,
    keyEntities,
    confidenceScore
  };
}

// STAGE 2: EXTRACT - Enhanced domain-specific information extraction using Natural + Compromise
function extractDomainSpecificInfo(text: string, classification: ContentClassification): string[] {
  const doc = nlp(text);
  const extracted: string[] = [];
  
  switch (classification.domain) {
    case 'sports':
      // Use Compromise for smart extraction
      const scores = doc.match('#Value [dash] #Value').out('array'); // Scores like "3-2"
      const stats = doc.numbers().out('array').slice(0, 5); // Numbers in context
      const people = doc.people().out('array').slice(0, 4); // Player names
      const organizations = doc.organizations().out('array').slice(0, 3); // Team names
      
      extracted.push(...scores.slice(0, 3));
      extracted.push(...stats);
      extracted.push(...people);
      extracted.push(...organizations);
      break;
      
    case 'financial':
      // Enhanced financial extraction
      const money = doc.money().out('array').slice(0, 4); // $1.2B, $500M etc
      const percentages = doc.percentages().out('array').slice(0, 4); // 15%, +3.2%
      const companies = doc.organizations().out('array').slice(0, 3);
      const numbers = doc.numbers().out('array').slice(0, 3); // General numeric values
      
      extracted.push(...money);
      extracted.push(...percentages);
      extracted.push(...companies);
      extracted.push(...numbers);
      break;
      
    case 'news':
      // Smart news extraction
      const quotes = doc.quotations().out('array').slice(0, 2);
      const newsPersons = doc.people().out('array').slice(0, 3);
      const places = doc.places().out('array').slice(0, 3);
      const topics = doc.topics().out('array').slice(0, 2); // Main topics
      
      extracted.push(...quotes);
      extracted.push(...newsPersons);
      extracted.push(...places);
      extracted.push(...topics);
      break;
      
    default:
      // General intelligent extraction
      const allNumbers = doc.numbers().out('array').slice(0, 4);
      const allPeople = doc.people().out('array').slice(0, 3);
      const allPlaces = doc.places().out('array').slice(0, 3);
      const dates = doc.match('#Date').out('array').slice(0, 2);
      
      extracted.push(...allNumbers);
      extracted.push(...allPeople);
      extracted.push(...allPlaces);
      extracted.push(...dates);
  }
  
  return extracted.filter(item => item && item.length > 0);
}

// Post-process summary to make it more concise
function postProcessSummary(summary: string, classification?: ContentClassification): string {
  let processed = summary;
  
  // Remove common filler phrases
  const fillerPhrases = [
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
  
  fillerPhrases.forEach(pattern => {
    processed = processed.replace(pattern, '');
  });
  
  // Convert passive voice to active when possible
  processed = processed
    .replace(/\bwas (scored|achieved|completed|announced)\b/gi, '$1')
    .replace(/\bwere (awarded|given|presented)\b/gi, 'received')
    .replace(/\bis expected to\b/gi, 'will')
    .replace(/\bwill be able to\b/gi, 'can');
  
  // Compress common phrases
  processed = processed
    .replace(/\bmore than\b/gi, '>')
    .replace(/\bless than\b/gi, '<')
    .replace(/\bapproximately\b/gi, '~')
    .replace(/\babout\b/gi, '~')
    .replace(/\bdollars?\b/gi, '$')
    .replace(/\bpercent\b/gi, '%')
    .replace(/\bmillion\b/gi, 'M')
    .replace(/\bbillion\b/gi, 'B');
  
  // Clean up extra whitespace and punctuation
  processed = processed
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*\.\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*,/g, ',')
    .trim();
  
  return processed;
}

// STAGE 4: COMPRESS - Intelligent multi-stage summarization with domain awareness
async function intelligentSummarization(text: string, targetLength: number, classification: ContentClassification): Promise<string> {
  const summarizerPipeline = await getSummarizer();
  
  try {
    // Extract domain-specific information first
    const keyInfo = extractDomainSpecificInfo(text, classification);
    
    // Determine compression strategy based on classification
    let strategy = {
      firstPassRatio: 1.8,
      compressionLevel: 'moderate' as 'aggressive' | 'moderate' | 'gentle',
      preserveStructure: false,
      maxIterations: 2
    };
    
    // Adapt strategy based on domain and data type
    if (classification.domain === 'sports' && classification.subtype === 'betting') {
      strategy = { firstPassRatio: 1.4, compressionLevel: 'aggressive', preserveStructure: true, maxIterations: 3 };
    } else if (classification.domain === 'financial') {
      strategy = { firstPassRatio: 1.6, compressionLevel: 'gentle', preserveStructure: true, maxIterations: 2 };
    } else if (classification.dataType === 'structured') {
      strategy = { firstPassRatio: 1.5, compressionLevel: 'moderate', preserveStructure: true, maxIterations: 2 };
    } else if (classification.priority === 'low') {
      strategy = { firstPassRatio: 1.2, compressionLevel: 'aggressive', preserveStructure: false, maxIterations: 1 };
    }
    
    // Stage 1: Domain-aware initial summarization
    const firstPassParams = {
      max_length: Math.floor(targetLength * strategy.firstPassRatio),
      min_length: Math.floor(targetLength * 1.1),
      no_repeat_ngram_size: strategy.compressionLevel === 'aggressive' ? 4 : 3,
      do_sample: classification.dataType === 'narrative',
      early_stopping: true,
    };
    
    const firstPass = await summarizerPipeline(text, firstPassParams);
    let firstSummary = firstPass?.[0]?.summary_text?.trim();
    
    if (!firstSummary || firstSummary.length < 50) {
      // Intelligent fallback: create domain-specific summary from extracted info
      if (keyInfo.length > 0) {
        const fallbackSummary = createDomainSpecificFallback(keyInfo, classification);
        return fallbackSummary;
      }
      return text.substring(0, targetLength * 8) + (text.length > targetLength * 8 ? '...' : '');
    }
    
    // Apply domain-aware post-processing
    firstSummary = postProcessSummary(firstSummary, classification);
    
    // Check if we need further compression
    const firstWordCount = firstSummary.split(/\s+/).length;
    if (firstWordCount <= targetLength || strategy.maxIterations === 1) {
      return firstSummary;
    }
    
    // Stage 2: Targeted compression based on domain
    const secondPassParams = {
      max_length: targetLength,
      min_length: Math.floor(targetLength * (strategy.compressionLevel === 'aggressive' ? 0.5 : 0.7)),
      no_repeat_ngram_size: 4,
      do_sample: false,
      early_stopping: true,
    };
    
    const secondPass = await summarizerPipeline(firstSummary, secondPassParams);
    let finalSummary = secondPass?.[0]?.summary_text?.trim();
    
    if (finalSummary) {
      finalSummary = postProcessSummary(finalSummary, classification);
      
      // Stage 3: Final optimization if still too long and strategy allows
      if (strategy.maxIterations === 3 && finalSummary.split(/\s+/).length > targetLength * 1.2) {
        const finalPassParams = {
          max_length: Math.floor(targetLength * 0.9),
          min_length: Math.floor(targetLength * 0.5),
          no_repeat_ngram_size: 5,
          do_sample: false,
          early_stopping: true,
        };
        
        const finalPass = await summarizerPipeline(finalSummary, finalPassParams);
        const ultraCompressed = finalPass?.[0]?.summary_text?.trim();
        
        if (ultraCompressed && ultraCompressed.length > 30) {
          return postProcessSummary(ultraCompressed, classification);
        }
      }
    }
    
    return finalSummary || firstSummary;
    
  } catch (error) {
    console.warn('Intelligent summarization failed, using Natural fallback:', error);
    // Use Natural-based extractive summarization as fallback
    const naturalSummary = naturalExtractiveSummary(text, Math.ceil(targetLength / 20));
    if (naturalSummary.length > 50) {
      return naturalSummary;
    }
    
    // Ultimate fallback: domain-specific key info
    const keyInfo = extractDomainSpecificInfo(text, classification);
    if (keyInfo.length > 0) {
      return createDomainSpecificFallback(keyInfo, classification);
    }
    return text.substring(0, targetLength * 8) + (text.length > targetLength * 8 ? '...' : '');
  }
}

// Enhanced intelligent fallback using Natural's extractive summarization
function createDomainSpecificFallback(keyInfo: string[], classification: ContentClassification): string {
  switch (classification.domain) {
    case 'sports':
      return `${classification.keyEntities.slice(0, 2).join(' vs ')}: ${keyInfo.slice(0, 4).join(', ')}.`;
    case 'financial':
      return `${classification.keyEntities[0] || 'Market'}: ${keyInfo.slice(0, 5).join(', ')}.`;
    case 'news':
      return `Breaking: ${keyInfo.slice(0, 4).join('; ')}.`;
    default:
      return keyInfo.slice(0, 6).join('; ') + '.';
  }
}

// Natural-based extractive summarization as ultimate fallback
function naturalExtractiveSummary(text: string, maxSentences = 3): string {
  const doc = nlp(text);
  const sentences = doc.sentences().out('array');
  
  if (sentences.length <= maxSentences) return text;
  
  // Score sentences based on key indicators
  const scoredSentences = sentences.map((sentence: string) => {
    const sentenceDoc = nlp(sentence);
    let score = 0;
    
    // Boost sentences with numbers/values
    score += sentenceDoc.numbers().length * 2;
    score += sentenceDoc.percentages().length * 2;
    score += sentenceDoc.money().length * 2;
    
    // Boost sentences with people/organizations
    score += sentenceDoc.people().length;
    score += sentenceDoc.organizations().length;
    
    // Boost sentences with action words
    score += sentenceDoc.verbs().length * 0.5;
    
    // Penalize very short sentences
    if (sentence.split(' ').length < 5) score -= 2;
    
    return { sentence, score };
  });
  
  // Return top-scored sentences
  const topSentences = scoredSentences
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, maxSentences)
    .map((item: any) => item.sentence);
  
  return topSentences.join(' ');
}

async function summarizeMarkdown(markdown: string, maxChunkWords = 700): Promise<string> {
  // Assess overall content quality to determine optimal chunk size
  const overallQuality = assessContentQuality(markdown);
  
  // Adjust chunk size based on quality
  // Higher quality content gets larger chunks to preserve context
  let adaptiveChunkSize = maxChunkWords;
  if (overallQuality >= 70) {
    adaptiveChunkSize = Math.floor(maxChunkWords * 1.4); // 980 words for high-quality
  } else if (overallQuality >= 50) {
    adaptiveChunkSize = Math.floor(maxChunkWords * 1.2); // 840 words for medium-quality
  } else if (overallQuality < 30) {
    adaptiveChunkSize = Math.floor(maxChunkWords * 0.8); // 560 words for low-quality
  }
  
  // Use intelligent chunking with adaptive sizing
  const sections = intelligentChunk(markdown, adaptiveChunkSize);
  const summaries: string[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    
    // Assess content quality before processing
    const qualityScore = assessContentQuality(trimmed);
    
    // Skip low-quality content entirely
    if (qualityScore < 25) {
      continue;
    }
    
    const wordCount = trimmed.split(/\s+/).length;
    
    // Determine target length for multi-stage summarization
    let targetLength = 60; // Default target length in words
    let shouldSummarize = false;
    
    // Content type detection for specialized parameters
    const hasTabularData = /\*\*Table\*\*/.test(trimmed);
    const hasNumericData = (trimmed.match(/\d+/g) || []).length > wordCount * 0.1;
    const hasListStructure = (trimmed.match(/^[-*+]\s/gm) || []).length > 3;
    const isNarrative = /\b(story|narrative|article|report)\b/i.test(trimmed);
    
    if (qualityScore >= 70) {
      // High-quality: summarize if over 300 words (reduced threshold)
      shouldSummarize = wordCount > 300;
      targetLength = hasTabularData || hasNumericData ? 90 : 70;
      
    } else if (qualityScore >= 50) {
      // Medium-quality: summarize if over 500 words
      shouldSummarize = wordCount > 500;
      targetLength = hasListStructure ? 50 : 60;
      
    } else {
      // Low-quality (25-49): only summarize if very long
      shouldSummarize = wordCount > adaptiveChunkSize;
      targetLength = 40; // Very concise for low-quality content
    }
    
    if (shouldSummarize) {
      // STAGE 1: CLASSIFY the content before summarizing
      const classification = classifyContent(trimmed);
      
      // STAGE 4: COMPRESS using intelligent summarization
      const summary = await intelligentSummarization(trimmed, targetLength, classification);
      if (summary && summary.length > 20) {
        summaries.push(summary);
      } else {
        // If summarization failed, keep original but truncated
        summaries.push(trimmed.substring(0, 600) + (trimmed.length > 600 ? '...' : ''));
      }
    } else {
      summaries.push(trimmed);
    }
  }

  return summaries.join('\n\n---\n\n');
}

export async function cleanHtml(rawHtml: string, url: string): Promise<string> {
  try {
    const dom = new JSDOM(rawHtml, { url });
    const reader = new Readability(dom.window.document, { charThreshold: 500 });
    const article = reader.parse();

    if (!article?.content) {
      await addMessages([
        {
          role: 'assistant',
          content: `No readable content found at ${url}.`,
        },
      ]);
      return '';
    }

    // Remove junk inside article body
    const bodyDom = new JSDOM(article.content, { url });
    const body = bodyDom.window.document.body;
    removeBoilerplate(body);

    // Convert to Markdown
    let markdown = turndownService.turndown(body.innerHTML);
    markdown = dedupeContent(prettyWhitespace(markdown));

    // Clean up markdown conversion artifacts using remark
    markdown = await cleanMarkdownArtifacts(markdown);

    // Summarize if oversized
    const cleaned = await summarizeMarkdown(markdown);

    return cleaned;
  } catch (error: any) {
    console.error(`Failed to clean HTML from ${url}:`, error?.message || error);
    throw new Error(`Error cleaning HTML from ${url}`);
  }
}
