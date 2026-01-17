/**
 * Types for the webScraper module
 * Shared across cleanHTML and related utilities
 */

/**
 * Options for customizing HTML cleaning behavior.
 * All options are optional for backward compatibility.
 */
export interface CleanHtmlOptions {
  /**
   * Output format preference
   * - 'markdown': Full cleaned markdown (default)
   * - 'summary': Aggressively summarized content
   * - 'bullets': Key points as bullet list
   */
  format?: 'markdown' | 'summary' | 'bullets';

  /**
   * Maximum output length in characters.
   * Content will be summarized if it exceeds this limit.
   */
  maxLength?: number;

  /**
   * Whether to preserve hyperlinks in output.
   * Default: true for markdown, false for summary/bullets
   */
  preserveLinks?: boolean;

  /**
   * Force a specific domain classification for content processing.
   * 'auto' uses automatic detection (default).
   */
  domain?: ContentDomain | 'auto';

  /**
   * Minimum content quality score (0-100) to include content.
   * Lower quality sections will be filtered out.
   * Default: 25
   */
  minQualityScore?: number;

  /**
   * Whether to include the page title/heading in output.
   * Default: true
   */
  includeTitle?: boolean;

  /**
   * Custom selectors to remove in addition to defaults.
   */
  additionalSelectorsToRemove?: string[];
}

/**
 * Content domain categories for specialized processing
 */
export type ContentDomain = 
  | 'sports'
  | 'news'
  | 'financial'
  | 'technical'
  | 'entertainment'
  | 'legal'
  | 'scientific'
  | 'ecommerce'
  | 'educational'
  | 'general';

/**
 * Content data structure classification
 */
export type ContentDataType = 'structured' | 'narrative' | 'mixed';

/**
 * Priority level for content processing
 */
export type ContentPriority = 'high' | 'medium' | 'low';

/**
 * Classification result for analyzed content
 */
export interface ContentClassification {
  /** Primary domain category */
  domain: ContentDomain;
  
  /** Subtype within the domain (e.g., 'betting' for sports) */
  subtype: string;
  
  /** Processing priority based on content quality signals */
  priority: ContentPriority;
  
  /** Whether content is structured, narrative, or mixed */
  dataType: ContentDataType;
  
  /** Key entities extracted from content (people, orgs, places) */
  keyEntities: string[];
  
  /** Confidence score for the classification (0-100) */
  confidenceScore: number;
}

/**
 * Result from content quality assessment
 */
export interface QualityAssessment {
  /** Overall quality score (0-100) */
  score: number;
  
  /** Word count of the content */
  wordCount: number;
  
  /** Whether content passes minimum quality threshold */
  passesThreshold: boolean;
  
  /** Specific quality indicators */
  indicators: {
    hasNumbers: boolean;
    hasProperNouns: boolean;
    hasCompleteStructure: boolean;
    vocabularyRatio: number;
    repetitiveContent: boolean;
    promotionalContent: boolean;
  };
}

/**
 * Internal processing result for a content section
 */
export interface ProcessedSection {
  /** The cleaned/summarized content */
  content: string;
  
  /** Quality assessment for the section */
  quality: QualityAssessment;
  
  /** Classification for the section */
  classification: ContentClassification;
  
  /** Whether section was summarized */
  wasSummarized: boolean;
}

/**
 * Metadata extracted from HTML document
 */
export interface DocumentMetadata {
  /** Page title from <title> or <h1> */
  title?: string;
  
  /** Meta description */
  description?: string;
  
  /** Open Graph type */
  ogType?: string;
  
  /** Article section/category */
  articleSection?: string;
  
  /** Publication date */
  publishedDate?: string;
  
  /** Author name(s) */
  authors?: string[];
  
  /** URL-derived domain hints */
  urlHints?: Partial<ContentClassification>;
}

/**
 * Default options for cleanHtml
 */
export const DEFAULT_CLEAN_HTML_OPTIONS: Required<Omit<CleanHtmlOptions, 'additionalSelectorsToRemove'>> = {
  format: 'markdown',
  maxLength: 0, // 0 means no limit
  preserveLinks: true,
  domain: 'auto',
  minQualityScore: 25,
  includeTitle: true,
};
