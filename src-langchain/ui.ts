/**
 * CLI User Interface for LangChain Agent
 * 
 * Provides an interactive terminal interface using inquirer
 */

import ora from 'ora';
import chalk from 'chalk';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';

/**
 * Create and manage a loading spinner
 */
export const showLoader = (text: string) => {
  const spinner = ora({
    text,
    color: 'cyan',
  }).start();

  return {
    stop: () => spinner.stop(),
    succeed: (text?: string) => spinner.succeed(text),
    fail: (text?: string) => spinner.fail(text),
    update: (text: string) => (spinner.text = text),
  };
};

/**
 * Strip any <think> tags from LLM output (some models include these)
 */
const stripThinkTags = (content: string): string => {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
};

/**
 * Log a message to the console with appropriate formatting
 */
export const logMessage = (message: BaseMessage) => {
  // Don't log tool messages (internal)
  if (message instanceof ToolMessage) {
    return;
  }

  // Don't log system messages (internal)
  if (message instanceof SystemMessage) {
    return;
  }

  // Log user messages
  if (message instanceof HumanMessage) {
    console.log(`\n${chalk.cyan('[YOU]')}`);
    console.log(chalk.white(message.content));
    return;
  }

  // Log assistant messages
  if (message instanceof AIMessage) {
    // If has tool_calls, log the tool being called
    if (message.tool_calls && message.tool_calls.length > 0) {
      message.tool_calls.forEach((tool) => {
        console.log(`\n${chalk.yellow('[TOOL]')} ${chalk.dim(tool.name)}`);
      });
      return;
    }

    // If has content, log it
    if (message.content) {
      const content = typeof message.content === 'string' 
        ? message.content 
        : JSON.stringify(message.content);
      
      console.log(`\n${chalk.green('[ASSISTANT]')}`);
      console.log(chalk.white(stripThinkTags(content)));
    }
  }
};

/**
 * Print a divider line
 */
export const printDivider = (char = '─', length = 60) => {
  console.log(chalk.dim(char.repeat(length)));
};

/**
 * Print the welcome banner
 */
export const printWelcome = () => {
  console.log();
  printDivider('═');
  console.log(chalk.bold.cyan('  🤖 CLImate - LangChain Agent'));
  console.log(chalk.dim('  Your AI assistant powered by LangChain'));
  printDivider('═');
  console.log();
  console.log(chalk.dim('  Commands:'));
  console.log(chalk.dim('  • Type your message and press Enter'));
  console.log(chalk.dim('  • Type "exit" or "quit" to end the session'));
  console.log(chalk.dim('  • Type "clear" to start a new conversation'));
  console.log();
};

/**
 * Print goodbye message
 */
export const printGoodbye = () => {
  console.log();
  console.log(chalk.cyan('👋 Goodbye! Thanks for using CLImate.'));
  console.log();
};

/**
 * Print error message
 */
export const printError = (error: Error | string) => {
  const message = error instanceof Error ? error.message : error;
  console.log(`\n${chalk.red('[ERROR]')} ${message}`);
};

/**
 * Print info message
 */
export const printInfo = (message: string) => {
  console.log(chalk.dim(`ℹ ${message}`));
};

/**
 * Print success message
 */
export const printSuccess = (message: string) => {
  console.log(chalk.green(`✓ ${message}`));
};
