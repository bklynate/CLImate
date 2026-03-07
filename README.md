# CLImate

**CLImate** is an intelligent command-line AI agent built with [LangChain.js](https://js.langchain.com/) and [LangGraph](https://langchain-ai.github.io/langgraphjs/). It provides a conversational interface for interacting with various tools including web search, weather data, and more.

---

## Features

- 🤖 **Multi-Provider LLM Support** - Works with Ollama, LM Studio, or OpenAI
- 🔧 **Tool Calling** - Automatically uses the right tool for each query
- 💾 **Persistent Memory** - Conversations are saved and can be resumed
- 🌊 **Streaming Responses** - See responses as they're generated
- 📝 **Beautiful Terminal Output** - Markdown rendering with syntax highlighting
- 🧪 **Fully Tested** - Comprehensive test suite with Vitest

---

## Quick Start

### Prerequisites

- **Node.js** 16+ (we recommend using `nvm`)
- **Local LLM** (Ollama or LM Studio) OR OpenAI API key

### Installation

```bash
# Clone the repository
git clone https://github.com/bklynate/CLImate.git
cd CLImate

# Use the correct Node version
nvm use

# Install dependencies
npm install
```

### Configuration

Create a `.env` file in the root directory:

```env
# LLM Configuration
LLM_PROVIDER=lmstudio          # ollama | lmstudio | openai
LLM_MODEL=llama3.1:latest      # Your model name
LLM_TEMPERATURE=0.1            # 0-2, lower = more deterministic

# API Keys
OPENAI_API_KEY=                # Required only for openai provider
TOMORROW_WEATHER_API_KEY=      # Required for weather tool
THE_ODDS_API_KEY=              # Required for sports betting tools (free: 500 req/month)

# Optional Configuration
LOG_LEVEL=info                 # error | warn | info | debug
CLI_STREAMING=true             # Enable/disable streaming
DB_FILE=db.json                # Conversation storage file
```

### Running the CLI

```bash
# Start with interactive provider prompt (no flags)
npm start

# Specify a provider directly
npm start -- --provider=ollama --model=llama4:scout
npm start -- --provider=lmstudio
npm start -- --provider=openai --model=gpt-4o

# Convenience shortcuts
npm run cli:ollama              # prompts for model name
npm run cli:lmstudio            # no model needed
npm run cli:openai              # prompts for model name

# Start fresh (clears conversation history)
npm run cli:reset
```

#### Provider Flags

| Flag | Description |
|------|-------------|
| `--provider=ollama` | Use a local Ollama instance. `--model` required (or prompted). |
| `--provider=lmstudio` | Use LM Studio. Model is set inside the LM Studio app; `--model` is ignored. |
| `--provider=openai` | Use OpenAI API. `--model` required (or prompted). Requires `OPENAI_API_KEY`. |

When **no `--provider` flag** is passed, the CLI presents an interactive menu to choose a provider and, if needed, a model.

---

## Usage Examples

### Basic Queries

```
→ What is the weather in New York?
→ Search for the latest news on AI
→ What's today's date?
```

### Multi-Step Tasks

```
→ Find the current weather in Paris, then search for tourist attractions there
```

The agent automatically determines which tools to use and executes them in the right order.

---

### **Development Workflow**

1. Modify the tools or core logic in their respective files (e.g., `toolRunner.ts` for tool execution, `llm.ts` for LLM interactions).
3. Use `.env` to securely store API keys.

---

## Architecture

```
src/
├── agent.ts          # LangGraph ReAct agent creation and execution
├── ai.ts             # Multi-provider LLM configuration
├── cli.ts            # Interactive terminal interface (main entry point)
├── config.ts         # Environment variable validation with Zod
├── index.ts          # Simple test entry point
├── logger.ts         # Structured logging with Winston
├── markdown.ts       # Terminal markdown rendering
├── memory.ts         # Conversation persistence (MemorySaver + LowDB)
├── systemPrompt.ts   # Dynamic system prompt generation
├── ui.ts             # Terminal UI utilities (colors, loaders, etc.)
└── tools/            # LangChain tool implementations
    ├── index.ts
    ├── currentLocation/
    ├── dateTime/
    ├── weather/
    └── webScraper/
```

---

## Available Tools

| Tool | Description | Required Env Vars |
|------|-------------|-------------------|
| `current_date_time` | Get current date/time with timezone support | None |
| `current_location` | IP-based geolocation | None |
| `current_weather` | Weather data via Tomorrow.io API | `TOMORROW_WEATHER_API_KEY` |
| `query_duckduckgo` | Web search with content extraction | None |
| `calculate` | Mathematical expression evaluation | None |
| `get_sports_events` | List upcoming/live games for NBA, NFL, MLB | `THE_ODDS_API_KEY` (FREE endpoint) |
| `get_sports_odds` | Betting odds from US bookmakers | `THE_ODDS_API_KEY` (1+ credits) |
| `get_sports_scores` | Live & completed game scores | `THE_ODDS_API_KEY` (1-2 credits) |
| `get_standings` | League standings via ESPN | None |

### Sports Betting Tools

The agent includes 4 sports tools powered by [The Odds API](https://the-odds-api.com/) and ESPN:

- **Supported sports**: NBA, NFL, MLB
- **Odds API free tier**: 500 requests/month — the agent is trained to conserve quota
- **ESPN standings**: Unlimited, no API key required

**Recommended workflow** (how the agent uses these tools):

1. `get_sports_events` — Lists upcoming games (FREE, no quota cost)
2. `get_sports_odds` — Fetches moneyline/spreads/totals from FanDuel, DraftKings, BetMGM, etc.
3. `get_sports_scores` — Gets live scores and recent results
4. `get_standings` — Current league standings from ESPN (FREE)

To enable, add `THE_ODDS_API_KEY` to your `.env` file. Get a free key at [the-odds-api.com](https://the-odds-api.com/#get-access).

---

## Development

### NPM Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run the CLI (same as `npm run cli`) |
| `npm run cli` | Run the interactive CLI |
| `npm run cli:ollama` | Run CLI with Ollama provider |
| `npm run cli:lmstudio` | Run CLI with LM Studio provider |
| `npm run cli:openai` | Run CLI with OpenAI provider |
| `npm run cli:reset` | Clear history and run CLI |
| `npm run dev` | Run test entry point |
| `npm run dev:reset` | Clear history and run dev |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:ui` | Open Vitest UI |
| `npm run test:coverage` | Generate coverage report |

### Testing

```bash
# Run all tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Visual test UI
npm run test:ui

# Coverage report
npm run test:coverage
```

### Adding a New Tool

1. Create a new file in `src/tools/`
2. Define your tool using the `tool()` function
3. Add it to `src/tools/index.ts`
4. Write tests in a co-located `.test.ts` file

Example:

```typescript
// src/tools/myTool/index.ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const myTool = tool(
  async ({ input }) => {
    // Your implementation
    return JSON.stringify({ result: 'success' });
  },
  {
    name: 'my_tool',
    description: 'Does something useful',
    schema: z.object({
      input: z.string().describe('Input parameter'),
    }),
  }
);
```

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `lmstudio` | `ollama` \| `lmstudio` \| `openai` |
| `LLM_MODEL` | - | Model identifier (e.g., `llama3.1:latest`) |
| `LLM_BASE_URL` | - | Custom API endpoint (optional) |
| `LLM_TEMPERATURE` | `0.1` | Response randomness (0-2) |
| `OPENAI_API_KEY` | - | Required for OpenAI provider |
| `TOMORROW_WEATHER_API_KEY` | - | Required for weather tool |
| `THE_ODDS_API_KEY` | - | Required for sports betting tools (free: 500 req/month) |
| `LOG_LEVEL` | `info` | `error` \| `warn` \| `info` \| `debug` \| `verbose` |
| `LOG_DIR` | `.` | Directory for log files |
| `LOG_TO_CONSOLE` | `true` | Enable console logging |
| `CLI_STREAMING` | `true` | Enable token streaming |
| `DB_FILE` | `db.json` | Conversation persistence file |

### LLM Providers

#### Ollama (Local)

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1:latest
```

Default URL: `http://localhost:11434`

#### LM Studio (Local)

```env
LLM_PROVIDER=lmstudio
LLM_MODEL=any-model-name
```

Default URL: `http://localhost:1234/v1`

#### OpenAI (Cloud)

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4
OPENAI_API_KEY=sk-...
```

---

## Troubleshooting

### ONNX Runtime Warnings

If you see spam from ONNX runtime (used by semantic-chunking), it's already suppressed with `2>/dev/null` in the CLI script. If you need to see stderr output, modify the `cli` script in package.json.

### LM Studio Connection Issues

1. Make sure LM Studio is running and the server is started
2. Verify the base URL (default: `http://localhost:1234/v1`)
3. Check that a model is loaded in LM Studio

### Conversation Not Persisting

Check that:
- `DB_FILE` path is writable
- The file isn't being deleted between runs
- You're using the same thread ID (shown at CLI startup)

---

## Resources

### LangChain Documentation

- [LangChain.js Introduction](https://js.langchain.com/docs/introduction/)
- [Chat Models](https://js.langchain.com/docs/concepts/chat_models/)
- [Tool Calling](https://js.langchain.com/docs/concepts/tool_calling/)
- [Messages](https://js.langchain.com/docs/concepts/messages/)
- [Custom Tools](https://js.langchain.com/docs/how_to/custom_tools/)

### LangGraph Documentation

- [LangGraph Introduction](https://langchain-ai.github.io/langgraphjs/)
- [createReactAgent](https://langchain-ai.github.io/langgraphjs/reference/functions/langgraph_prebuilt.createReactAgent.html)
- [MemorySaver](https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph_checkpoint.MemorySaver.html)

### Related

- [ReAct Paper](https://arxiv.org/abs/2210.03629) - Original research on the reasoning pattern
- [Zod](https://zod.dev/) - TypeScript schema validation
- [Winston](https://github.com/winstonjs/winston) - Logging library
- [Vitest](https://vitest.dev/) - Testing framework

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with tests
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Built with [LangChain.js](https://js.langchain.com/) and [LangGraph](https://langchain-ai.github.io/langgraphjs/)
- Inspired by the [ReAct paper](https://arxiv.org/abs/2210.03629)
- Uses [marked-terminal](https://github.com/mikaelbr/marked-terminal) for beautiful terminal output

---

**Made with ❤️ by [@bklynate](https://github.com/bklynate)**
