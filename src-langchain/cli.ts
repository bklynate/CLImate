#!/usr/bin/env node
/**
 * CLImate - LangChain Agent CLI
 * 
 * Interactive command-line interface for the LangChain-powered AI assistant.
 * Supports both streaming and non-streaming modes.
 */

import 'dotenv/config';
import { input } from '@inquirer/prompts';
import { runAgent, runAgentStreaming } from './agent';
import { tools } from './tools';
import { ConversationManager } from './memory';
import { getSystemPrompt } from './systemPrompt';
import { cliLogger } from './logger';
import chalk from 'chalk';
import { 
  printWelcome, 
  printGoodbye, 
  printDivider, 
  printError, 
  printInfo,
  printSuccess,
  showLoader,
} from './ui';

// Check if streaming is enabled via environment
const STREAMING_ENABLED = process.env.CLI_STREAMING !== 'false';

/**
 * Main CLI loop
 */
async function main() {
  // Initialize conversation manager
  const conversationManager = new ConversationManager();
  await conversationManager.initialize();

  cliLogger.info('CLI started', { 
    threadId: conversationManager.getThreadId(),
    streaming: STREAMING_ENABLED 
  });

  // Print welcome message
  printWelcome();
  printInfo(`Thread ID: ${conversationManager.getThreadId()}`);
  printInfo(`Loaded ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
  if (STREAMING_ENABLED) {
    printInfo('Streaming mode: enabled');
  }
  console.log();

  // Main conversation loop
  while (true) {
    try {
      // Get user input
      const userInput = await input({ message: '→' });

      const trimmedInput = userInput.trim();

      // Handle empty input
      if (!trimmedInput) {
        continue;
      }

      // Handle exit commands
      if (['exit', 'quit', 'q', 'bye'].includes(trimmedInput.toLowerCase())) {
        cliLogger.info('User exited');
        printGoodbye();
        process.exit(0);
      }

      // Handle clear command
      if (['clear', 'reset', 'new'].includes(trimmedInput.toLowerCase())) {
        await conversationManager.newConversation();
        cliLogger.info('Conversation cleared');
        console.clear();
        printWelcome();
        printSuccess('Started new conversation');
        printInfo(`New Thread ID: ${conversationManager.getThreadId()}`);
        console.log();
        continue;
      }

      // Handle help command
      if (['help', '?'].includes(trimmedInput.toLowerCase())) {
        console.log();
        printInfo('Available commands:');
        console.log('  exit, quit, q, bye  - Exit the application');
        console.log('  clear, reset, new   - Start a new conversation');
        console.log('  help, ?             - Show this help message');
        console.log('  config              - Show current configuration');
        console.log();
        continue;
      }

      // Handle config command
      if (trimmedInput.toLowerCase() === 'config') {
        const { printConfigSummary } = await import('./config');
        printConfigSummary();
        continue;
      }

      try {
        if (STREAMING_ENABLED) {
          // Streaming mode
          printDivider();
          process.stdout.write(chalk.green('Assistant: '));
          
          const response = await runAgentStreaming(trimmedInput, {
            systemPrompt: getSystemPrompt(),
            tools,
            conversationManager,
            onToken: (token) => {
              process.stdout.write(token);
            },
            onToolCall: (toolName, args) => {
              console.log();
              console.log(chalk.yellow(`  ⚙ Using tool: ${toolName}`));
            },
          });

          console.log(); // New line after streaming
          printDivider();
          console.log();
        } else {
          // Non-streaming mode with loader
          const loader = showLoader('Thinking...');

          const response = await runAgent(trimmedInput, {
            systemPrompt: getSystemPrompt(),
            tools,
            conversationManager,
          });

          loader.stop();

          // Display the response
          printDivider();
          console.log(response.content);
          printDivider();
          console.log();
        }

      } catch (error) {
        cliLogger.error('Agent error', error);
        if (error instanceof Error) {
          printError(error);
        } else {
          printError('An unexpected error occurred');
        }
        console.log();
      }

    } catch (error) {
      // Handle inquirer errors (e.g., Ctrl+C)
      if (error instanceof Error && error.message.includes('User force closed')) {
        cliLogger.info('User force closed');
        printGoodbye();
        process.exit(0);
      }
      throw error;
    }
  }
}

// Run the CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
