import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { getModel, type ModelConfig } from './ai';
import { ConversationManager } from './memory';
import { agentLogger } from './logger';

/**
 * Agent configuration options
 */
export interface AgentConfig {
  /** Model configuration */
  modelConfig?: Partial<ModelConfig>;
  /** Tools available to the agent */
  tools?: StructuredToolInterface[];
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Conversation manager for persistence */
  conversationManager?: ConversationManager;
  /** Enable streaming output */
  streaming?: boolean;
  /** Callback for streaming tokens */
  onToken?: (token: string) => void;
  /** Callback for tool calls */
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
}

/**
 * Agent response type
 */
export interface AgentResponse {
  content: string;
  messages: (HumanMessage | AIMessage | SystemMessage)[];
}

/**
 * Creates a LangChain agent with the specified configuration.
 * 
 * This uses the ReAct (Reasoning + Acting) pattern from LangGraph,
 * which handles the tool calling loop automatically.
 * 
 * @param config - Agent configuration options
 * @returns An agent instance that can be invoked with messages
 */
export const createAgent = async (config?: AgentConfig) => {
  const model = await getModel(config?.modelConfig);
  const tools = config?.tools ?? [];
  
  // Get the checkpointer from conversation manager if available
  const checkpointer = config?.conversationManager?.getCheckpointer();

  // Create the ReAct agent using LangGraph prebuilt
  const agent = createReactAgent({
    llm: model,
    tools,
    checkpointSaver: checkpointer,
  });

  return agent;
};

/**
 * Run the agent with a user message.
 * 
 * @param userMessage - The user's input message
 * @param config - Optional agent configuration
 * @returns The agent's response
 */
export const runAgent = async (
  userMessage: string,
  config?: AgentConfig
): Promise<AgentResponse> => {
  const agent = await createAgent(config);

  // Build the messages array
  const messages: (HumanMessage | SystemMessage)[] = [];
  
  // Add system prompt if provided
  if (config?.systemPrompt) {
    messages.push(new SystemMessage(config.systemPrompt));
  }
  
  // Add the user message
  messages.push(new HumanMessage(userMessage));

  agentLogger.debug('Processing message', { messageLength: userMessage.length });

  // Build invoke config with thread ID if conversation manager provided
  const invokeConfig = config?.conversationManager 
    ? config.conversationManager.getConfig()
    : undefined;

  // Invoke the agent
  const result = await agent.invoke({
    messages,
  }, invokeConfig);

  // Extract the final response
  const responseMessages = result.messages;
  const lastMessage = responseMessages[responseMessages.length - 1];
  
  // Get the content from the last AI message
  let content = '';
  if (lastMessage && 'content' in lastMessage) {
    content = typeof lastMessage.content === 'string' 
      ? lastMessage.content 
      : JSON.stringify(lastMessage.content);
  }

  agentLogger.debug('Response generated', { 
    messageCount: responseMessages.length,
    contentLength: content.length 
  });

  // Persist messages to LowDB if conversation manager provided
  if (config?.conversationManager) {
    await config.conversationManager.persistMessages(responseMessages);
    agentLogger.debug('Messages persisted to database');
  }

  return {
    content,
    messages: responseMessages,
  };
};

/**
 * Run the agent with streaming output.
 * 
 * @param userMessage - The user's input message
 * @param config - Agent configuration with streaming callbacks
 * @returns The agent's final response
 */
export const runAgentStreaming = async (
  userMessage: string,
  config: AgentConfig & { 
    onToken: (token: string) => void;
    onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  }
): Promise<AgentResponse> => {
  const agent = await createAgent(config);

  // Build the messages array
  const messages: (HumanMessage | SystemMessage)[] = [];
  
  if (config.systemPrompt) {
    messages.push(new SystemMessage(config.systemPrompt));
  }
  messages.push(new HumanMessage(userMessage));

  agentLogger.debug('Starting streaming response');

  // Build invoke config
  const invokeConfig = config.conversationManager 
    ? config.conversationManager.getConfig()
    : undefined;

  // Use streamEvents for streaming with tool visibility
  let finalContent = '';
  let allMessages: (HumanMessage | AIMessage | SystemMessage)[] = [];

  const stream = agent.streamEvents(
    { messages },
    { version: 'v2', ...invokeConfig }
  );

  for await (const event of stream) {
    // Handle streaming tokens from the LLM
    if (event.event === 'on_chat_model_stream') {
      const chunk = event.data.chunk;
      if (chunk?.content) {
        const token = typeof chunk.content === 'string' 
          ? chunk.content 
          : '';
        if (token) {
          config.onToken(token);
          finalContent += token;
        }
      }
    }

    // Handle tool calls
    if (event.event === 'on_tool_start' && config.onToolCall) {
      const toolName = event.name || 'unknown';
      const toolArgs = event.data?.input || {};
      config.onToolCall(toolName, toolArgs);
      agentLogger.debug('Tool called', { toolName, args: toolArgs });
    }

    // Capture final messages
    if (event.event === 'on_chain_end' && event.name === 'LangGraph') {
      allMessages = event.data?.output?.messages || [];
    }
  }

  agentLogger.debug('Streaming complete', { 
    contentLength: finalContent.length,
    messageCount: allMessages.length 
  });

  // Persist messages if conversation manager provided
  if (config.conversationManager && allMessages.length > 0) {
    await config.conversationManager.persistMessages(allMessages);
  }

  return {
    content: finalContent,
    messages: allMessages,
  };
};
