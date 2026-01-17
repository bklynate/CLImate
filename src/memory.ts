/**
 * Memory Module for LangChain Agent
 * 
 * This module provides conversation memory and persistence using:
 * - LangGraph's MemorySaver for in-memory conversation state
 * - LowDB for file-based persistence between sessions
 */

import { MemorySaver } from '@langchain/langgraph';
import { JSONFilePreset } from 'lowdb/node';
import { 
  HumanMessage, 
  AIMessage, 
  SystemMessage,
  ToolMessage,
  type BaseMessage 
} from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';

// Database file path
const DB_FILE = 'db-langchain.json';

/**
 * Stored message format for persistence
 */
export interface StoredMessage {
  id: string;
  type: 'human' | 'ai' | 'system' | 'tool';
  content: string;
  createdAt: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
}

/**
 * Database structure
 */
interface DbData {
  messages: StoredMessage[];
  threadId: string;
}

const defaultData: DbData = { 
  messages: [],
  threadId: uuidv4(),
};

/**
 * Get the LowDB instance for persistence
 */
export const getDb = async () => {
  return JSONFilePreset<DbData>(DB_FILE, defaultData);
};

/**
 * Convert a LangChain message to storable format
 */
export const messageToStored = (message: BaseMessage): StoredMessage => {
  const base = {
    id: uuidv4(),
    content: typeof message.content === 'string' 
      ? message.content 
      : JSON.stringify(message.content),
    createdAt: new Date().toISOString(),
  };

  if (message instanceof HumanMessage) {
    return { ...base, type: 'human' };
  } else if (message instanceof AIMessage) {
    const stored: StoredMessage = { ...base, type: 'ai' };
    // Store tool calls if present
    if (message.tool_calls && message.tool_calls.length > 0) {
      stored.toolCalls = message.tool_calls.map(tc => ({
        id: tc.id || uuidv4(),
        name: tc.name,
        args: tc.args as Record<string, unknown>,
      }));
    }
    return stored;
  } else if (message instanceof SystemMessage) {
    return { ...base, type: 'system' };
  } else if (message instanceof ToolMessage) {
    return { 
      ...base, 
      type: 'tool',
      toolCallId: message.tool_call_id,
    };
  }

  // Default fallback
  return { ...base, type: 'human' };
};

/**
 * Convert a stored message back to a LangChain message
 */
export const storedToMessage = (stored: StoredMessage): BaseMessage => {
  switch (stored.type) {
    case 'human':
      return new HumanMessage(stored.content);
    case 'ai':
      const aiMsg = new AIMessage(stored.content);
      if (stored.toolCalls) {
        aiMsg.tool_calls = stored.toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          args: tc.args,
          type: 'tool_call' as const,
        }));
      }
      return aiMsg;
    case 'system':
      return new SystemMessage(stored.content);
    case 'tool':
      return new ToolMessage({
        content: stored.content,
        tool_call_id: stored.toolCallId || '',
      });
    default:
      return new HumanMessage(stored.content);
  }
};

/**
 * Save messages to the database
 */
export const saveMessages = async (messages: BaseMessage[]) => {
  const db = await getDb();
  const storedMessages = messages.map(messageToStored);
  db.data.messages.push(...storedMessages);
  await db.write();
};

/**
 * Load all messages from the database
 */
export const loadMessages = async (): Promise<BaseMessage[]> => {
  const db = await getDb();
  return db.data.messages.map(storedToMessage);
};

/**
 * Clear all messages from the database
 */
export const clearMessages = async () => {
  const db = await getDb();
  db.data.messages = [];
  db.data.threadId = uuidv4();
  await db.write();
};

/**
 * Get the current thread ID for conversation tracking
 */
export const getThreadId = async (): Promise<string> => {
  const db = await getDb();
  return db.data.threadId;
};

/**
 * Create a new MemorySaver instance for LangGraph
 * This provides in-memory conversation state management
 */
export const createMemorySaver = () => {
  return new MemorySaver();
};

/**
 * ConversationManager class for handling conversation state
 */
export class ConversationManager {
  private memorySaver: MemorySaver;
  private threadId: string;

  constructor() {
    this.memorySaver = new MemorySaver();
    this.threadId = uuidv4(); // Initialize with a new UUID by default
  }

  /**
   * Initialize the conversation manager, loading any existing state
   */
  async initialize() {
    const db = await getDb();
    // Only use existing thread ID if it exists, otherwise keep the generated one
    if (db.data.threadId) {
      this.threadId = db.data.threadId;
    } else {
      // Save the new thread ID to the database
      db.data.threadId = this.threadId;
      await db.write();
    }
  }

  /**
   * Get the memory saver for use with LangGraph
   */
  getCheckpointer() {
    return this.memorySaver;
  }

  /**
   * Get the current thread ID
   */
  getThreadId() {
    return this.threadId;
  }

  /**
   * Get the config object for LangGraph agent invocation
   */
  getConfig() {
    return {
      configurable: {
        thread_id: this.threadId,
      },
    };
  }

  /**
   * Persist current messages to LowDB
   */
  async persistMessages(messages: BaseMessage[]) {
    await saveMessages(messages);
  }

  /**
   * Load persisted messages from LowDB
   */
  async loadPersistedMessages() {
    return loadMessages();
  }

  /**
   * Start a new conversation (clear history)
   */
  async newConversation() {
    await clearMessages();
    this.memorySaver = new MemorySaver();
    this.threadId = await getThreadId();
  }
}

// Export a singleton instance for convenience
export const conversationManager = new ConversationManager();
