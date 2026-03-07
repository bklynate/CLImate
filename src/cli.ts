#!/usr/bin/env node
/**
 * CLImate - LangChain Agent CLI
 * 
 * Interactive command-line interface for the LangChain-powered AI assistant.
 * Supports both streaming and non-streaming modes.
 * 
 * Usage:
 *   npm start -- --provider=ollama --model=llama4:scout
 *   npm start -- --provider=lmstudio
 *   npm start -- --provider=openai --model=gpt-4o
 *   npm start                          (interactive prompt)
 */

import 'dotenv/config';
import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import { runAgent, runAgentStreaming } from './agent';
import type { ModelConfig } from './ai';
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
  printWarning,
  showLoader,
} from './ui';
import { renderMarkdown } from './markdown';

// ── CLI argument parsing ────────────────────────────────────────────────────

const program = new Command()
  .name('climate')
  .description('CLImate – LangChain-powered AI assistant')
  .option('--provider <name>', 'LLM provider: ollama | lmstudio | openai')
  .option('--model <name>', 'Model name (required for ollama/openai, ignored for lmstudio)')
  .allowUnknownOption()   // don't choke on npm/tsx flags
  .parse(process.argv);

const cliOpts = program.opts<{ provider?: string; model?: string }>();

// ── Provider resolution ─────────────────────────────────────────────────────

type ProviderChoice = 'ollama' | 'lmstudio' | 'openai';

const VALID_PROVIDERS = ['ollama', 'lmstudio', 'openai'] as const;

/**
 * Resolve provider + model from CLI flags, falling back to an interactive
 * prompt when no --provider flag is given.
 */
async function resolveProviderConfig(): Promise<Partial<ModelConfig>> {
  let provider: ProviderChoice;
  let model: string | undefined = cliOpts.model;

  // ─── Determine provider ───────────────────────────────────────────────
  if (cliOpts.provider) {
    const raw = cliOpts.provider.toLowerCase().trim();
    if (!VALID_PROVIDERS.includes(raw as ProviderChoice)) {
      console.error(
        chalk.red(`Invalid provider "${cliOpts.provider}". Must be one of: ${VALID_PROVIDERS.join(', ')}`)
      );
      process.exit(1);
    }
    provider = raw as ProviderChoice;
  } else {
    // Interactive prompt
    provider = await select<ProviderChoice>({
      message: 'Select an LLM provider',
      choices: [
        { name: 'Ollama   (local)', value: 'ollama' },
        { name: 'LM Studio (local)', value: 'lmstudio' },
        { name: 'OpenAI   (cloud)', value: 'openai' },
      ],
    });
  }

  // ─── LM Studio: model is irrelevant ──────────────────────────────────
  if (provider === 'lmstudio') {
    if (model) {
      printWarning('--model is ignored for LM Studio (the model is set inside LM Studio).');
    }
    return { provider: 'lmstudio' };
  }

  // ─── Ollama / OpenAI: resolve model ──────────────────────────────────
  if (!model) {
    const defaultModel = provider === 'openai'
      ? (process.env.LLM_MODEL || 'gpt-4o')
      : (process.env.LLM_MODEL || 'llama4:scout');

    model = await input({
      message: `Enter the model name for ${provider}`,
      default: defaultModel,
    });
  }

  // ─── OpenAI: require API key ─────────────────────────────────────────
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    console.error(
      chalk.red('OPENAI_API_KEY environment variable is required for the OpenAI provider.')
    );
    process.exit(1);
  }

  return { provider, model };
}

// Check if streaming is enabled via environment
const STREAMING_ENABLED = process.env.CLI_STREAMING !== 'false';

// ── Timezone detection ──────────────────────────────────────────────────────

/**
 * Detect the user's IANA timezone via IP geolocation (ipapi.co).
 * Called once at startup and cached for the session.
 * Falls back to America/New_York on any error.
 */
async function detectTimezone(): Promise<string> {
  const fallback = 'America/New_York';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const resp = await fetch('https://ipapi.co/json/', {
      headers: { 'User-Agent': 'nodejs-climate-tz-detect/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) return fallback;
    const data = (await resp.json()) as Record<string, unknown>;
    const tz = data.timezone as string | undefined;
    return tz || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Main CLI loop
 */
async function main() {
  // Resolve provider/model from flags or interactive prompt
  const modelConfig = await resolveProviderConfig();

  // Detect user timezone via IP geolocation (one-time, cached for session)
  const userTimezone = await detectTimezone();

  // Initialize conversation manager
  const conversationManager = new ConversationManager();
  await conversationManager.initialize();

  cliLogger.info('CLI started', { 
    threadId: conversationManager.getThreadId(),
    streaming: STREAMING_ENABLED,
    provider: modelConfig.provider,
    model: modelConfig.model,
    timezone: userTimezone,
  });

  // Print welcome message
  printWelcome();
  printInfo(`Provider: ${chalk.bold(modelConfig.provider)}${modelConfig.model ? ` | Model: ${chalk.bold(modelConfig.model)}` : ''}`);
  printInfo(`Timezone: ${chalk.bold(userTimezone)}`);
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
          // Streaming mode - collect response silently, then render markdown at end
          printDivider();
          console.log(chalk.gray('Assistant:'));
          console.log();
          
          let fullResponse = '';
          
          const response = await runAgentStreaming(trimmedInput, {
            modelConfig,
            systemPrompt: getSystemPrompt(userTimezone),
            tools,
            conversationManager,
            onToken: (token) => {
              fullResponse += token;
              // Show a simple dot for progress indication
              process.stdout.write(chalk.gray('.'));
            },
            onToolCall: (toolName, args) => {
              console.log();
              console.log(chalk.yellow(`  ⚙ Using tool: ${chalk.bold(toolName)}`));
            },
          });

          // Clear the dots and show rendered markdown
          process.stdout.write('\r\x1b[K'); // Clear line
          console.log(renderMarkdown(fullResponse));
          console.log();
          printDivider();
          console.log();
        } else {
          // Non-streaming mode with loader
          const loader = showLoader('Thinking...');

          const response = await runAgent(trimmedInput, {
            modelConfig,
            systemPrompt: getSystemPrompt(userTimezone),
            tools,
            conversationManager,
          });

          loader.stop();

          // Display the response with pretty markdown rendering
          printDivider();
          console.log(chalk.gray('Assistant:'));
          console.log();
          console.log(renderMarkdown(response.content));
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
