import 'dotenv/config';
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import figlet from 'figlet';
import boxen from 'boxen';
import { runAgent } from './src/agent';
import { tools } from './src/tools';
import { logMessage, showLoader } from '@src/ui';

// Initialize commander for CLI arguments
const program = new Command();

program
  .name('agent-cli')
  .description('CLI to interact with a chatbot. Type "exit" to stop.')
  .version('1.0.0');

/**
 * Display a welcoming banner at startup using figlet and boxen.
 */
const displayWelcomeBanner = () => {
  const bannerText = figlet.textSync('Agent CLI', {
    font: 'Slant',
    horizontalLayout: 'default',
    verticalLayout: 'default',
  });

  console.log(
    boxen(bannerText, {
      padding: 1,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'cyan',
      align: 'center',
    })
  );

  console.log(
    chalk.greenBright(
      `Welcome to Agent CLI! Your personal assistant is ready to help you.\n`
    )
  );
  console.log(
    chalk.cyanBright(`Type ${chalk.yellow('"exit"')} to stop the program.\n`)
  );
};

/**
 * Handle user interactions in a continuous loop.
 */
const startChat = async () => {
  displayWelcomeBanner(); // Show banner at startup

  while (true) {
    try {
      // Prompt the user for input
      const { userMessage } = await inquirer.prompt([
        {
          type: 'input',
          name: 'userMessage',
          message: chalk.blue(''),
          theme: {
            prefix: chalk.hex('#00aaff')('[👤 USER] >>'),
          },
        },
      ]);

      // Check for exit command
      if (userMessage.trim().toLowerCase() === 'exit') {
        console.log(chalk.yellow('Goodbye! See you next time.'));
        process.exit(0);
      }

      if (!userMessage.trim()) {
        console.log(chalk.red('Please provide a valid message.'));
        continue;
      }

      // Show a spinner while processing the user's input
      const loader = showLoader('Processing your request...');

      try {
        // Process the user's message with the agent
        const response = await runAgent({
          userMessage,
          tools,
        });

        loader.succeed('Response received!');

        if (response && response.length > 0) {
          response.forEach((message) => {
            logMessage(message); // Use the refactored logMessage from ui.ts
          });
        }
      } catch (error) {
        loader.fail('An error occurred while processing your request.');
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : error
        );
      }
    } catch (error) {
      console.error(chalk.red('An unexpected error occurred:'), error);
    }
  }
};

// Define the `start` command
program
  .command('start')
  .description('Start the chatbot assistant')
  .action(() => {
    startChat();
  });

// Auto-run if no CLI arguments are provided
if (!process.argv.slice(2).length) {
  startChat();
} else {
  program.parse(process.argv);
}
