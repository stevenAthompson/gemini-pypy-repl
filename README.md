# gemini-pypy-repl

**Give your Gemini CLI agent a real Python brain with self-managed environments.**

This extension provides a persistent, stateful Python (or PyPy) REPL environment isolated within a dedicated virtual environment and workspace. It allows the Gemini agent to execute code, install packages, and manage data safely and efficiently. IE - Gemini can whip up tiny python scripts on the fly and execute them in a local container for small tools.

Gemini seems to really love using it and actually ASKED me to create this extension. Now it can make it's own tools on the fly!

<img width="3820" height="907" alt="image" src="https://github.com/user-attachments/assets/b906da68-3974-42da-812d-d664154eb362" />


## Why use this?

*   **Isolated Environment**: Automatically creates a `.venv` in the `.gemini-repl` folder. No pollution of your global Python setup.
*   **Package Management**: Gemini can self-service dependencies using `pip_install`.
*   **Dedicated Workspace**: All files created by the agent land in `.gemini-repl/workspace/`, keeping your project root clean.
*   **Project Access**: Use the `PROJECT_ROOT` variable to access files outside the workspace (e.g., `open(f"{PROJECT_ROOT}/logs/app.log")`).
*   **Accuracy**: Gemini can write code to calculate answers instead of guessing.
*   **Stateful**: Variables and functions persist between turns.
*   **Speed**: Prefers `pypy3` for fast execution if available.
*   **Background Tasks**: Supports async execution for long-running calculations with `tmux` notifications.
*   **Safety**: interactive `input()` is disabled to prevent the agent from hanging the session.

## Installation

Run the following command in your Gemini CLI:

```bash
gemini extension install https://github.com/stevenAthompson/gemini-pypy-repl
```

## Requirements

*   **Node.js**: Required to run the extension.
*   **Python**: Requires `pypy3` or `python3` installed to bootstrap the virtual environment.
*   **Tmux**: Required for the `async` background notification feature. Use the shell script in the root of this project to launch Gemini CLI if you want async to work. 

## Usage

*   **Install Packages**: "Install numpy and pandas for me."
*   **Process Files**: "Read the CSV file in the workspace and give me a summary."
*   **Read Project Logs**: "Analyze `logs/error.log` from the project root."
*   **Long Computations**: "Run this simulation in the background."

## Tools Included

*   `pypy_repl`: Executes Python code.
    *   `code`: The Python code.
    *   `async`: (Boolean) Run in background.
    *   `timeout`: (Number) Execution timeout in ms (default 30s).
*   `pip_install`: Installs packages into the `.venv`.
    *   `packages`: List of package names.
*   `reset_repl`: Clears session variables/imports.
*   `cleanup_repl`: Deletes temporary files.
    *   `all`: (Boolean) If true, also wipes the `workspace/` folder.

## Launching with Tmux

A helper script `gemini_tmux.sh` is provided to ensure you are in a compatible session for background notifications.

## Troubleshooting

*   **Pip Failures**: If `pip_install` fails, check the error message. You might be missing system-level build dependencies (e.g., C compilers) for certain packages.
*   **Zombie Processes**: If you kill the main Gemini CLI while an async task is running, the background Python process might persist. You can manually kill it or use `cleanup_repl`.
