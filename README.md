### **Utility Agent**

---

### **Description**
The **Utility Agent** is a command-line interface (CLI) program built with TypeScript. It integrates tools, APIs, and memory to act as an intelligent agent for fetching data, interacting with APIs, and running automated tasks. With robust integration with libraries like OpenAI, Puppeteer, and more, it offers an extensible foundation for creating custom workflows.

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

### **Project Dependencies**

#### **Dev Dependencies**
- TypeScript definitions for robust type checking and IntelliSense.

---

### **Contributing**
Contributions are welcome! Submit pull requests or open issues to propose features or report bugs.

---

### **License**
This project is licensed under the MIT License.
