/**
 * LangChain Agent - Entry Point
 * 
 * A simple test script to verify the LangChain agent is working.
 * This will be expanded into a full CLI in Phase 4.
 */

import 'dotenv/config';
import { runAgent } from './agent';
import { tools } from './tools';
import { ConversationManager } from './memory';

const testMessage = process.argv[2] || 'Hello! What can you help me with today?';

console.log('='.repeat(60));
console.log('LangChain Agent Test');
console.log('='.repeat(60));
console.log();
console.log(`User: ${testMessage}`);
console.log();
console.log(`[Tools] Loaded ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
console.log();

async function main() {
  try {
    // Initialize conversation manager for memory persistence
    const conversationManager = new ConversationManager();
    await conversationManager.initialize();
    console.log(`[Memory] Thread ID: ${conversationManager.getThreadId()}`);
    console.log();

    const response = await runAgent(testMessage, {
      systemPrompt: 'You are a helpful AI assistant. Be concise and friendly. You have access to tools for getting the current date/time, location, weather, and web search.',
      tools,
      conversationManager,
    });

    console.log('-'.repeat(60));
    console.log('Assistant:');
    console.log(response.content);
    console.log('-'.repeat(60));
    console.log();
    console.log(`Total messages in conversation: ${response.messages.length}`);
  } catch (error) {
    console.error('Error running agent:', error);
    process.exit(1);
  }
}

main();
