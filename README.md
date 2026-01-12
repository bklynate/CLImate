### **CLImate**

---

### **Description**
The **CLImate** is a command-line interface (CLI) program built with TypeScript. It integrates tools, APIs, and memory to act as an intelligent agent for fetching data, interacting with APIs, and running automated tasks. With robust integration with libraries like OpenAI, Puppeteer, and more, it offers an extensible foundation for creating custom workflows.

---

### **Features**
- **CLI-Based**: Interact with the agent through a terminal interface.
- **Robust API Integration**: Leverage tools like Balldontlie, OpenAI, and Tomorrow.io for NBA data, LLM prompts, and weather data.
- **Local LLM Integration**: Run the agent with local LLMs powered by Ollama or LM Studio.
- **Rate-Limiting and Retry Logic**: Centralized request handling ensures compliance with API limits.
- **Memory and State Management**: Persistent and transient memory layers using `lowdb` for effective state tracking.
- **Web Scraping**: Integrated tools for extracting and cleaning web data with Puppeteer and Cheerio.

---

### **Getting Started**

#### **Prerequisites**
1. **Node.js** (v16+ recommended)
2. **NPM/Yarn** for dependency management
3. **TypeScript**

#### **Installation**
1. Clone the repository:
   ```bash
   git clone https://github.com/bklynate/agent-from-scratch.git
   cd agent-from-scratch
   ```
2. Install dependencies:
   ```bash
   nvm use
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the root directory:
   ```env
   BALL_DONT_LIE_API_KEY=<your_api_key>
   OPENAI_API_KEY=<your_openai_api_key>
   TOMORROW_WEATHER_API_KEY=<your_api_key>
    ORT_LOG_SEVERITY_LEVEL=ERROR
   ```
---

### **Running the Program**

#### **CLI Mode**
The entry point for the program is the `index.ts` file, which serves as the main interface for the CLI agent. To execute the program:
```bash
npm run dev (this cleans the database each time)

or

npm run start
```

---

### **Key Files Overview**

#### **Core CLI Components**

1. **`index.ts`**
   - The main entry point for the CLI program.
   - Handles argument parsing and routes user commands to the appropriate tools or tasks.

2. **`agent.ts`**
   - Core agent logic, including memory management, tool execution, and LLM interactions.

3. **`ui.ts`**
   - Manages user interactions in the terminal, providing input prompts and displaying results.

4. **`toolRunner.ts`**
   - Coordinates the execution of tools, handling errors, retries, and formatted output.

---

#### **Important Tools**

1. **`bdlAPI.ts`**
   - Provides NBA data using the `@balldontlie/sdk`.
   - Tools like fetching team records and standings are implemented here.

2. **`queryGoogle.ts`**
   - Fetches and processes Google search results for extracting information.

3. **`currentWeather.ts`**
   - Retrieves real-time weather data for a specified location using the Tomorrow.io API.

4. **`cleanHTML.ts`**
   - Cleans and sanitizes HTML for safe data processing.

5. **`memory.ts`**
   - Implements persistent storage for tracking state and managing agent memory.

---


### **Development Workflow**

1. Modify the tools or core logic in their respective files (e.g., `toolRunner.ts` for tool execution, `llm.ts` for LLM interactions).
3. Use `.env` to securely store API keys.

---

## **LangChain Agent Implementation**

The `src-langchain/` directory contains a complete reimplementation of the CLImate agent using [LangChain.js](https://js.langchain.com/docs/introduction/) and [LangGraph](https://langchain-ai.github.io/langgraphjs/). This provides a more structured approach to building AI agents with built-in support for tool calling, memory persistence, and streaming.

### **Quick Start**

```bash
# Run the interactive CLI
npm run cli

# Run with a fresh conversation
npm run cli:reset

# Run tests
npm test
```

### **Architecture Overview**

```
src-langchain/
├── agent.ts          # Agent creation and execution logic
├── ai.ts             # Multi-provider model configuration
├── cli.ts            # Interactive terminal interface
├── config.ts         # Centralized configuration with validation
├── index.ts          # Simple test entry point
├── logger.ts         # Structured logging with Winston
├── memory.ts         # Conversation persistence (MemorySaver + LowDB)
├── systemPrompt.ts   # System prompt generation
├── ui.ts             # Terminal UI utilities
└── tools/            # LangChain tool implementations
    ├── index.ts
    ├── currentLocation.ts
    ├── dateTime.ts
    ├── weather.ts
    └── webSearch.ts
```

---

### **Key Files Walkthrough**

#### **1. `ai.ts` - Model Configuration**

This module provides multi-provider LLM support using LangChain's chat model abstractions.

**Key Concepts:**
- [`ChatOllama`](https://js.langchain.com/docs/integrations/chat/ollama/) - Native Ollama integration for local models
- [`ChatOpenAI`](https://js.langchain.com/docs/integrations/chat/openai/) - OpenAI-compatible API (also used for LM Studio)

**Supported Providers:**
| Provider | Base URL | Use Case |
|----------|----------|----------|
| `ollama` | `http://localhost:11434` | Local Ollama models |
| `lm-studio` | `http://localhost:1234/v1` | LM Studio (OpenAI-compatible) |
| `openai` | `https://api.openai.com/v1` | OpenAI API |

**Environment Variables:**
```env
LLM_PROVIDER=lmstudio      # ollama | lmstudio | openai
LLM_MODEL=llama4:scout     # Model name
LLM_BASE_URL=              # Optional: custom API endpoint
LLM_TEMPERATURE=0.1        # Response randomness (0-2)
```

**Implementation Decision:** We use `ChatOpenAI` for LM Studio because it exposes an OpenAI-compatible API. This allows seamless switching between local and cloud models without code changes.

---

#### **2. `agent.ts` - Agent Logic**

The core agent uses LangGraph's [`createReactAgent`](https://langchain-ai.github.io/langgraphjs/reference/functions/langgraph_prebuilt.createReactAgent.html) which implements the [ReAct pattern](https://arxiv.org/abs/2210.03629) (Reasoning + Acting).

**Key Imports:**
```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
```

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `createAgent(config)` | Creates a ReAct agent with tools and memory |
| `runAgent(message, config)` | Executes agent with standard response |
| `runAgentStreaming(message, config)` | Executes with token-by-token streaming |

**Implementation Decision:** We chose `createReactAgent` over building a custom agent loop because:
1. It handles the tool-calling cycle automatically
2. Built-in support for [`MemorySaver`](https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph_checkpoint.MemorySaver.html) checkpointing
3. Proper error handling and retry logic

**Streaming Example:**
```typescript
const response = await runAgentStreaming(userMessage, {
  onToken: (token) => process.stdout.write(token),
  onToolCall: (name, args) => console.log(`Using tool: ${name}`),
});
```

---

#### **3. `memory.ts` - Conversation Persistence**

Combines LangGraph's in-memory checkpointing with file-based persistence.

**Key Components:**

| Component | Purpose | Documentation |
|-----------|---------|---------------|
| [`MemorySaver`](https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph_checkpoint.MemorySaver.html) | In-memory conversation state | LangGraph Checkpointing |
| `LowDB` | File-based JSON persistence | [lowdb](https://github.com/typicode/lowdb) |
| `ConversationManager` | Unified interface for both | Custom wrapper |

**Message Types (from [`@langchain/core/messages`](https://js.langchain.com/docs/concepts/messages/)):**
- [`HumanMessage`](https://v02.api.js.langchain.com/classes/langchain_core_messages.HumanMessage.html) - User input
- [`AIMessage`](https://v02.api.js.langchain.com/classes/langchain_core_messages.AIMessage.html) - Assistant responses (may include tool calls)
- [`SystemMessage`](https://v02.api.js.langchain.com/classes/langchain_core_messages.SystemMessage.html) - System prompt
- [`ToolMessage`](https://v02.api.js.langchain.com/classes/langchain_core_messages.ToolMessage.html) - Tool execution results

**Implementation Decision:** We persist messages to LowDB after each agent response rather than on every message. This reduces I/O while still maintaining conversation history between sessions.

---

#### **4. `tools/` - Tool Implementations**

Tools are defined using LangChain's [`tool()`](https://js.langchain.com/docs/how_to/custom_tools/#tool-function) function with Zod schemas for input validation.

**Tool Definition Pattern:**
```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const myTool = tool(
  async ({ param1, param2 }) => {
    // Tool implementation
    return JSON.stringify(result);
  },
  {
    name: 'my_tool',
    description: 'Description shown to the LLM',
    schema: z.object({
      param1: z.string().describe('Parameter description'),
      param2: z.number().optional(),
    }),
  }
);
```

**Available Tools:**

| Tool | File | Purpose |
|------|------|---------|
| `current_date_time` | `dateTime.ts` | Get current date/time with timezone support |
| `current_location` | `currentLocation.ts` | IP-based geolocation |
| `current_weather` | `weather.ts` | Weather data via Tomorrow.io API |
| `query_duckduckgo` | `webSearch.ts` | Web search with content extraction |

**Implementation Decision:** Tools return JSON strings rather than objects. This ensures consistent serialization and allows the LLM to parse structured data reliably.

---

#### **5. `config.ts` - Configuration Management**

Type-safe configuration using [Zod](https://zod.dev/) for environment variable validation.

**Key Features:**
- Validates all env vars at startup (fail-fast)
- Provider name normalization (`lmstudio` → `lm-studio`)
- Helper functions for API key checking

**Full Environment Variables:**
```env
# LLM Configuration
LLM_PROVIDER=ollama          # ollama | lmstudio | lm-studio | openai
LLM_MODEL=llama4:scout       # Model identifier
LLM_BASE_URL=                # Custom API endpoint (optional)
LLM_TEMPERATURE=0.1          # 0-2, lower = more deterministic

# API Keys
OPENAI_API_KEY=              # Required for openai provider
TOMORROW_WEATHER_API_KEY=    # Required for weather tool

# Logging
LOG_LEVEL=info               # error | warn | info | debug | verbose
LOG_DIR=.                    # Directory for log files
LOG_TO_CONSOLE=true          # Set to false for cleaner CLI output

# CLI
CLI_STREAMING=true           # Enable/disable streaming output
DB_FILE=db-langchain.json    # Conversation persistence file
```

---

#### **6. `logger.ts` - Structured Logging**

Winston-based logging with category-specific loggers.

**Log Categories:**
```typescript
import { agentLogger, toolLogger, modelLogger } from './logger';

agentLogger.info('Processing message', { messageLength: 100 });
toolLogger.debug('Tool called', { toolName: 'weather' });
modelLogger.error('API error', new Error('Connection failed'));
```

**Output Locations:**
- `langchain-agent.log` - All logs (JSON format)
- `langchain-agent-error.log` - Error logs only
- Console - Color-coded human-readable format

---

### **NPM Scripts Reference**

| Script | Command | Description |
|--------|---------|-------------|
| `cli` | `npm run cli` | Run interactive CLI |
| `cli:reset` | `npm run cli:reset` | Reset conversation and run CLI |
| `dev:langchain` | `npm run dev:langchain` | Run test entry point |
| `test` | `npm test` | Run all tests |
| `test:watch` | `npm run test:watch` | Watch mode testing |
| `test:ui` | `npm run test:ui` | Visual test UI |
| `test:coverage` | `npm run test:coverage` | Generate coverage report |

---

### **Key LangChain Documentation Links**

| Topic | Link |
|-------|------|
| LangChain.js Introduction | [js.langchain.com/docs/introduction](https://js.langchain.com/docs/introduction/) |
| Chat Models | [js.langchain.com/docs/concepts/chat_models](https://js.langchain.com/docs/concepts/chat_models/) |
| Tool Calling | [js.langchain.com/docs/concepts/tool_calling](https://js.langchain.com/docs/concepts/tool_calling/) |
| Messages | [js.langchain.com/docs/concepts/messages](https://js.langchain.com/docs/concepts/messages/) |
| LangGraph Agents | [langchain-ai.github.io/langgraphjs](https://langchain-ai.github.io/langgraphjs/) |
| ReAct Agent | [langgraph prebuilt.createReactAgent](https://langchain-ai.github.io/langgraphjs/reference/functions/langgraph_prebuilt.createReactAgent.html) |
| MemorySaver | [langgraph checkpoint.MemorySaver](https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph_checkpoint.MemorySaver.html) |
| Custom Tools | [js.langchain.com/docs/how_to/custom_tools](https://js.langchain.com/docs/how_to/custom_tools/) |

---

### **Project Dependencies**

#### **Dev Dependencies**
- TypeScript definitions for robust type checking and IntelliSense.

---

### **Contributing**
Contributions are welcome! Submit pull requests or open issues to propose features or report bugs.

---

### **License**
This project is licensed under the MIT License.
