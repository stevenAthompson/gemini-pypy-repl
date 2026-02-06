# gemini-pypy-repl

A python sandbox for gemini cli providing REPL like testing and debugging using PyPy interactively.

## Installation

```bash
gemini extension install https://github.com/<your-username>/gemini-pypy-repl
```

## Features

- **Persistent REPL Session**: Maintains state (variables, functions, imports) between tool calls.
- **Smart Output**: Automatically prints the value of the last expression in a code block.
- **PyPy Support**: Prefers PyPy for execution, falling back to Python 3 if PyPy is not available.
- **Safe Execution**: Uses base64 encoding for code transport and handles multiline blocks correctly.

## Tools

### pypy_repl
Executes Python code in the persistent session.
- `code`: The Python code to execute.

### reset_repl
Resets the session, clearing all state.

## Requirements

- `pypy3` (recommended) or `python3` installed on the host system.
