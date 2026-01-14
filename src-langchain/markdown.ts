/**
 * Markdown rendering for terminal output
 * 
 * Uses marked + marked-terminal to render markdown beautifully in the console
 */

import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';

// Configure marked to use the terminal renderer with options
// @ts-expect-error marked-terminal types don't match marked's MarkedExtension type
marked.use(markedTerminal({
  // Customize colors to match our CLI theme
  code: chalk.yellow,
  blockquote: chalk.gray.italic,
  html: chalk.gray,
  heading: chalk.bold.cyan,
  firstHeading: chalk.bold.cyan.underline,
  hr: chalk.dim,
  listitem: chalk.white,
  table: chalk.white,
  paragraph: chalk.white,
  strong: chalk.bold.white,
  em: chalk.italic,
  codespan: chalk.bgGray.yellow,
  del: chalk.strikethrough,
  link: chalk.blue.underline,
  href: chalk.dim,
  // Width for wrapping
  width: 80,
  // Show border around code blocks
  showSectionPrefix: false,
  // Use emoji for lists
  unescape: true,
  emoji: true,
  // Tab size for code
  tab: 2,
}));

/**
 * Render markdown to beautiful terminal output
 */
export function renderMarkdown(markdown: string): string {
  try {
    // Pre-process: handle some edge cases
    let processed = markdown
      // Ensure headers have space after #
      .replace(/^(#{1,6})([^#\s])/gm, '$1 $2')
      // Normalize line endings
      .replace(/\r\n/g, '\n');

    // Render with marked
    const rendered = marked.parse(processed);
    
    // marked.parse returns Promise<string> | string, but with sync renderer it's string
    if (typeof rendered === 'string') {
      return rendered.trim();
    }
    
    // Fallback for async case (shouldn't happen with terminal renderer)
    return markdown;
  } catch (error) {
    // If rendering fails, return original with basic formatting
    console.error('Markdown rendering error:', error);
    return formatBasic(markdown);
  }
}

/**
 * Basic fallback formatting when marked fails
 */
function formatBasic(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, chalk.bold('$1'))
    // Italic
    .replace(/\*(.+?)\*/g, chalk.italic('$1'))
    .replace(/_(.+?)_/g, chalk.italic('$1'))
    // Code spans
    .replace(/`(.+?)`/g, chalk.yellow('$1'))
    // Headers
    .replace(/^### (.+)$/gm, chalk.bold.cyan('$1'))
    .replace(/^## (.+)$/gm, chalk.bold.cyan.underline('$1'))
    .replace(/^# (.+)$/gm, chalk.bold.cyan.underline('$1'))
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, chalk.blue.underline('$1') + chalk.dim(` ($2)`))
    // Horizontal rules
    .replace(/^---+$/gm, chalk.dim('─'.repeat(60)))
    // List items
    .replace(/^[-*] /gm, chalk.cyan('• '));
}

/**
 * Render markdown synchronously (for streaming)
 * This is a lighter version that doesn't do full parsing
 */
export function renderMarkdownLight(text: string): string {
  return formatBasic(text);
}

/**
 * Strip markdown formatting and return plain text
 */
export function stripMarkdown(markdown: string): string {
  return markdown
    // Remove bold/italic
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove code spans
    .replace(/`(.+?)`/g, '$1')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove links, keep text
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    // Remove images
    .replace(/!\[.*?\]\(.+?\)/g, '')
    // Remove horizontal rules
    .replace(/^---+$/gm, '')
    // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
