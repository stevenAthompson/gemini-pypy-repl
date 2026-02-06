# gemini-pypy-repl

A python sandbox for gemini cli providing REPL like testing and debugging using PyPy interactively.

## Tools

### pypy_repl
Executes Python code in a persistent PyPy/Python REPL session and returns the output. Maintains state between calls. Runs inside a dedicated virtual environment and workspace.
- `code`: The Python code to execute.
- `async`: (Optional) If true, runs code in the background and notifies via tmux when done. Use for long-running tasks.
- `timeout`: (Optional) Execution timeout in milliseconds (default 30000). Ignored if async is true.

### pip_install
Installs Python packages into the REPL virtual environment.
- `packages`: List of packages to install (e.g., ["numpy", "pandas"]).

### reset_repl
Resets the current Python REPL session, clearing all variables, functions, and imports.

### cleanup_repl
Cleans up temporary files and workspace artifacts.
- `all`: (Optional) If true, also clears the workspace directory. Otherwise only clears the tmp directory.

## Agent Guidelines

- **Environment Isolation**: You are running in a dedicated virtual environment (`.venv`) and workspace (`workspace/`). You have full permissions to install packages and write files here.
- **Self-Service Dependencies**: If you need a library that isn't installed, use `pip_install`. Don't ask the user to install it for you.
- **Workspace Hygiene**: Use `cleanup_repl(all=true)` when you are done with a complex project to keep the user's system tidy.
- **Persistent State**: Use the persistent nature of the REPL to build complex logic across multiple turns.
    - **Note**: State is held in memory. If the extension restarts (e.g., after an update), state is lost. Use `workspace/` files for long-term persistence.
- **Project Access**: A global variable `PROJECT_ROOT` is available in the REPL. Use it to access files outside the isolated workspace (e.g., `open(f"{PROJECT_ROOT}/src/main.ts")`).
- **Auto-Printing**: The REPL automatically prints the value of the last expression in a block.
- **Debugging**: If a script fails, use the REPL to inspect variables or test small snippets.
- **PyPy Advantage**: This environment is ideal for computationally intensive tasks.
- **Safe Encoding**: Code is transported using base64 encoding.
- **Error Handling**: Standard error output is captured and returned.
- **No Interactive Input**: Do not use `input()` in your Python code. It is disabled and will raise a `RuntimeError`. If you need to simulate input, hardcode it or use variables.
- **Pip Limitations**: If `pip_install` fails, it may be due to missing OS-level dependencies. In that case, look for pure-Python alternatives or explain the limitation to the user. 


# IMPORTANT NOTES
- This will be installed by a user from github. It will need to work wihtout requiring them to "npm install" things are create symlinks, etc.
- Code should have comments and unit tests.
- Unit tests shoudl test fucntionality and not just be simple Assert(true) placeholders.
- .gitignore should ignore the temp folder, an reference folder if there is one, and any secrets or keys. 
- Unique MCP Server Names: Never default to "main" for the MCP server name in gemini-extension.json. Always generate a unique ID or use the extension's name (e.g., "astGrep", "myTool"). Conflicting names cause extensions to silently overwrite each other's tool registrations.
- Avoid `node_modules/.bin` Symlinks: When distributing node_modules via Git (to avoid npm install for end-users), do not rely on the symlinks in .bin/. They often contain absolute paths generated at build time which break on other machines. Always resolve the path to the executable package directly (e.g., node_modules/@scope/pkg/bin/cli.js).
- Portable Path Resolution: Always resolve internal paths (like binaries, worker scripts, or config files) relative to import.meta.url (ESM) or __dirname (CJS), never relative to process.cwd(). This ensures the extension works regardless of the user's current working directory.
- Detached Workers for Async Tasks: Long-running tasks (like large searches or those waiting for external events like tmux stability) must run in a detached process. Blocking the main Node.js event loop—even for a few seconds—causes the MCP server to miss heartbeats, leading the Gemini CLI to assume the extension has crashed and disconnect it.
- Shared Resources require Shared Locks: If multiple extensions interact with a singleton resource (like the terminal via tmux), they must coordinate using a shared lock file ID. Using unique lock names for each extension defeats the purpose and leads to race conditions (garbled text).
- Fail Fast in Stability Checks: When waiting for a resource (like a tmux session), explicitly check for "resource not found" errors and abort immediately. Indefinite retries or long timeouts for fatal errors cause the tool to hang and frustrate the user.
- Explicit Exit Codes: Wrapper tools should handle underlying CLI exit codes semantically. For search tools, exit code 1 often means "nothing found", which is a valid result, not an error. The tool should return a helpful message ("No matches") rather than throwing a generic error.
- Output to Files for Large Results: For async operations returning potentially large data, write to a temporary file and return the path. Passing huge strings through tmux notifications or even IPC can be slow, truncated, or unstable.
- Test Environment Awareness: Integration tests involving system resources (like tmux) should be aware of the test environment (CI vs local) and skip or mock interactions that cannot be reliably reproduced in an automated setting.
- Include Compiled Code: If the user is not expected to build the project, ensure the dist/ (or build output) directory is committed and kept in sync with src/ changes. A mismatch here leads to "it works on my machine" bugs.
