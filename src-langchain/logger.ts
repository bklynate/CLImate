/**
 * Logger Module for LangChain Agent
 * 
 * Provides structured logging with multiple transports and log levels.
 * Supports both file and console output with color-coded levels.
 */

import winston from 'winston';
import chalk from 'chalk';
import path from 'path';

// Log file paths
const LOG_DIR = process.env.LOG_DIR || '.';
const LOG_FILE = path.join(LOG_DIR, 'langchain-agent.log');
const ERROR_LOG_FILE = path.join(LOG_DIR, 'langchain-agent-error.log');

// Log level from environment or default to 'info'
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Whether to log to console (disable for cleaner CLI output)
const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE !== 'false';

/**
 * Custom format for console output with colors
 */
const consoleFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const ts = chalk.dim(`[${new Date(timestamp as string).toLocaleTimeString()}]`);
  
  let levelStr: string;
  switch (level) {
    case 'error':
      levelStr = chalk.red.bold('ERROR');
      break;
    case 'warn':
      levelStr = chalk.yellow.bold('WARN');
      break;
    case 'info':
      levelStr = chalk.blue('INFO');
      break;
    case 'debug':
      levelStr = chalk.gray('DEBUG');
      break;
    case 'verbose':
      levelStr = chalk.cyan('VERBOSE');
      break;
    default:
      levelStr = level.toUpperCase();
  }

  const metaStr = Object.keys(meta).length > 0 
    ? chalk.dim(` ${JSON.stringify(meta)}`) 
    : '';

  return `${ts} ${levelStr} ${message}${metaStr}`;
});

/**
 * Custom format for file output (JSON structured)
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Create the winston logger instance
 */
const createLogger = () => {
  const transports: winston.transport[] = [
    // Always log to file
    new winston.transports.File({
      filename: LOG_FILE,
      level: LOG_LEVEL,
      format: fileFormat,
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3,
    }),
    // Error-only file
    new winston.transports.File({
      filename: ERROR_LOG_FILE,
      level: 'error',
      format: fileFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ];

  // Optionally add console transport
  if (LOG_TO_CONSOLE) {
    transports.push(
      new winston.transports.Console({
        level: LOG_LEVEL,
        format: winston.format.combine(
          winston.format.timestamp(),
          consoleFormat
        ),
      })
    );
  }

  return winston.createLogger({
    level: LOG_LEVEL,
    transports,
    // Don't exit on error
    exitOnError: false,
  });
};

// Create the logger instance
const logger = createLogger();

/**
 * Log categories for structured logging
 */
export const logCategories = {
  AGENT: 'agent',
  TOOL: 'tool',
  MODEL: 'model',
  MEMORY: 'memory',
  CONFIG: 'config',
  CLI: 'cli',
} as const;

export type LogCategory = typeof logCategories[keyof typeof logCategories];

/**
 * Create a child logger with a specific category
 */
export const createCategoryLogger = (category: LogCategory) => {
  return {
    info: (message: string, meta?: Record<string, unknown>) => 
      logger.info(`[${category}] ${message}`, meta),
    warn: (message: string, meta?: Record<string, unknown>) => 
      logger.warn(`[${category}] ${message}`, meta),
    error: (message: string, error?: Error | unknown) => {
      if (error instanceof Error) {
        logger.error(`[${category}] ${message}`, { error: error.message, stack: error.stack });
      } else {
        logger.error(`[${category}] ${message}`, { error });
      }
    },
    debug: (message: string, meta?: Record<string, unknown>) => 
      logger.debug(`[${category}] ${message}`, meta),
    verbose: (message: string, meta?: Record<string, unknown>) => 
      logger.verbose(`[${category}] ${message}`, meta),
  };
};

// Pre-created category loggers
export const agentLogger = createCategoryLogger(logCategories.AGENT);
export const toolLogger = createCategoryLogger(logCategories.TOOL);
export const modelLogger = createCategoryLogger(logCategories.MODEL);
export const memoryLogger = createCategoryLogger(logCategories.MEMORY);
export const configLogger = createCategoryLogger(logCategories.CONFIG);
export const cliLogger = createCategoryLogger(logCategories.CLI);

export default logger;
