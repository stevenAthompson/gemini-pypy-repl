# gemini-pypy-repl

**Give your Gemini CLI agent a real Python brain.**

This extension provides a persistent, stateful Python (or PyPy) REPL environment. It allows the Gemini agent to execute code, verify logic, perform complex calculations, and process data on the fly, dramatically reducing hallucinations for math and logic tasks.

## Why use this?

*   **Accuracy**: Gemini can write code to calculate answers instead of trying to predict the next token.
*   **Stateful**: Variables and functions persist between turns. You can ask Gemini to "remember this list" and then "filter that list" in the next message.
*   **Speed**: Automatically detects and uses `pypy3` if available for faster execution of complex loops.
*   **Safety**: Code is executed in a controlled subprocess (standard Python/PyPy) on your machine.
*   **Background Tasks**: Supports async execution for long-running calculations, notifying you via `tmux` when complete.

## Installation

Run the following command in your Gemini CLI:

```bash
gemini extension install https://github.com/stevenAthompson/gemini-pypy-repl
```

## Requirements

*   **Node.js**: Required to run the extension.
*   **Python**: Requires `pypy3` (recommended for speed) or `python3` installed and available in your system PATH.
*   **Tmux**: Required for the `async` background notification feature. The Gemini CLI must be running inside a tmux session named `gemini-cli`.

## Launching with Tmux

To use the background task features, you should run Gemini inside a tmux session. A helper script `gemini_tmux.sh` is provided in the repository.

```bash
# Make it executable
chmod +x gemini_tmux.sh

# Run it
./gemini_tmux.sh
```

## Usage

Once installed, you don't need to learn special commands. Just interact with Gemini naturally:

*   **Math**: "Calculate the sum of the first 10,000 prime numbers."
*   **Logic**: "Write a Python script to parse this text and tell me how many times 'error' appears."
*   **Data**: "I'm going to paste some CSV data. Load it into a list of dictionaries."
*   **Long Tasks**: "Run a Monte Carlo simulation for 1 minute to estimate Pi. Do this in the background." (Gemini will use `async: true`).

Gemini will automatically use the `pypy_repl` tool to execute the necessary code and give you the result.

### Advanced: Manual Usage
You can force the execution of code using the slash command in the CLI:
```bash
/pypy_repl code="print(2**100)"
```

## Tools Included

*   `pypy_repl`: Executes Python code in the persistent session.
    *   `code`: The Python code.
    *   `async`: (Boolean) Run in background and notify via tmux.
*   `reset_repl`: Clears the session memory (variables/imports).
