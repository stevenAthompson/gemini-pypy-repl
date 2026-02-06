/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn, ChildProcess, execSync, spawnSync } from 'child_process';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';

export class ReplManager extends EventEmitter {
    private process: ChildProcess | null = null;
    private actualExecutable: string | null = null;
    private baseDir: string;
    private venvPath: string;
    private workspacePath: string;
    private busy: boolean = false;
    private maxOutputSize = 100 * 1024; // 100KB

    constructor() {
        super();
        this.baseDir = path.join(process.cwd(), '.gemini-repl');
        this.venvPath = path.join(this.baseDir, 'venv');
        this.workspacePath = path.join(this.baseDir, 'workspace');
        
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }

    private async findSystemPython(): Promise<string> {
        const tryExec = async (cmd: string): Promise<boolean> => {
            return new Promise((resolve) => {
                const check = spawn(cmd, ['--version']);
                check.on('error', () => resolve(false));
                check.on('close', (code) => resolve(code === 0));
            });
        };

        if (await tryExec('pypy3')) return 'pypy3';
        if (await tryExec('pypy')) return 'pypy';
        if (await tryExec('python3')) return 'python3';
        if (await tryExec('python')) return 'python';
        throw new Error('No Python or PyPy executable found in PATH.');
    }

    private async ensureVenv(): Promise<string> {
        if (!fs.existsSync(this.venvPath)) {
            console.error('Creating virtual environment in .gemini-repl/venv...');
            const systemPython = await this.findSystemPython();
            const result = spawnSync(systemPython, ['-m', 'venv', this.venvPath], { stdio: 'inherit' });
            if (result.error) throw result.error;
            if (result.status !== 0) throw new Error(`Failed to create venv. Exit code: ${result.status}`);
        }

        const venvPython = process.platform === 'win32' 
            ? path.join(this.venvPath, 'Scripts', 'python.exe')
            : path.join(this.venvPath, 'bin', 'python');
        
        return venvPython;
    }

    private ensureWorkspace() {
        if (!fs.existsSync(this.workspacePath)) {
            fs.mkdirSync(this.workspacePath, { recursive: true });
        }
    }

    async start(): Promise<string> {
        if (this.process && this.actualExecutable) return this.actualExecutable;

        this.actualExecutable = await this.ensureVenv();
        this.ensureWorkspace();

        this.process = spawn(this.actualExecutable, ['-i', '-u'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: this.workspacePath,
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        this.process.stdout?.on('data', (data) => {
            this.emit('stdout', data.toString());
        });

        this.process.stderr?.on('data', (data) => {
            this.emit('stderr', data.toString());
        });

        this.process.on('exit', () => {
            this.process = null;
        });

        const projectRoot = process.cwd().replace(/\\/g, '\\\\');

        const initScript = `
import ast
import base64
import sys
import os
import builtins

sys.path.append(os.getcwd())
builtins.PROJECT_ROOT = "${projectRoot}"

def __gemini_run_repl(code_b64):
    try:
        code = base64.b64decode(code_b64).decode("utf-8").strip()
        if not code: return
        tree = ast.parse(code)
        if not tree.body: return
        exec_globals = globals()
        if 'PROJECT_ROOT' not in exec_globals:
            exec_globals['PROJECT_ROOT'] = builtins.PROJECT_ROOT
        last_node = tree.body[-1]
        if isinstance(last_node, ast.Expr):
            if len(tree.body) > 1:
                exec(compile(ast.Module(body=tree.body[:-1], type_ignores=[]), "<string>", "exec"), exec_globals)
            result = eval(compile(ast.Expression(body=last_node.value), "<string>", "eval"), exec_globals)
            if result is not None:
                print(repr(result))
        else:
            exec(compile(tree, "<string>", "exec"), exec_globals)
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)

print("__REPL_READY__")
`;
        await this.writeStdin(initScript + '\n');

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Timed out waiting for REPL startup'));
            }, 10000);

            const onStdout = (data: string) => {
                if (data.includes('__REPL_READY__')) {
                    cleanup();
                    resolve(this.actualExecutable!);
                }
            };

            const cleanup = () => {
                clearTimeout(timeout);
                this.removeListener('stdout', onStdout);
            };

            this.on('stdout', onStdout);
        });
    }

    private async writeStdin(data: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.process?.stdin) return reject(new Error('No stdin'));
            this.process.stdin.write(data, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async execute(code: string, timeoutMs: number = 30000): Promise<{ stdout: string; stderr: string; executable: string }> {
        if (this.busy) {
            throw new Error('REPL is busy executing another command. Use "reset_repl" if it is stuck.');
        }
        this.busy = true;

        try {
            const executable = await this.start();

            if (!this.process || this.process.killed) {
                console.error('REPL process died, restarting...');
                this.process = null;
                await this.start();
            }

            const marker = `__REPL_DONE_${Math.random().toString(36).substring(7)}__`;
            let stdout = '';
            let stderr = '';
            let timer: NodeJS.Timeout;

            const promise = new Promise<{ stdout: string; stderr: string; executable: string }>((resolve, reject) => {
                const onStdout = (data: string) => {
                    if (stdout.length < this.maxOutputSize) {
                        stdout += data;
                    }
                    if (stdout.includes(marker)) {
                        stdout = stdout.replace(marker, '');
                        if (stdout.length >= this.maxOutputSize) {
                            stdout += `\n...[Output truncated to ${this.maxOutputSize} bytes]...`;
                        }
                        cleanup();
                        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), executable });
                    }
                };

                const onStderr = (data: string) => {
                    const lines = data.split('\n');
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed === '' || 
                            /^>{3,}(\s*>{3,})*$/.test(trimmed) || 
                            /^\\.{3,}(\s*\\.{3,})*$/.test(trimmed) || 
                            trimmed.startsWith('Python ') || 
                            trimmed.startsWith('Type "help"')) {
                            continue;
                        }
                        if (stderr.length < this.maxOutputSize) {
                            stderr += line + '\n';
                        }
                    }
                };

                const cleanup = () => {
                    clearTimeout(timer);
                    this.removeListener('stdout', onStdout);
                    this.removeListener('stderr', onStderr);
                };

                this.on('stdout', onStdout);
                this.on('stderr', onStderr);

                const b64Code = Buffer.from(code).toString('base64');
                this.writeStdin(`__gemini_run_repl("${b64Code}")\nprint("${marker}")\n`).catch(err => {
                    cleanup();
                    reject(new Error(`Error writing to stdin: ${err.message}`));
                });
            });

            const timeoutPromise = new Promise<{ stdout: string; stderr: string; executable: string }>((_, reject) => {
                timer = setTimeout(() => {
                    if (this.process) this.process.kill('SIGINT');
                    reject(new Error(`Execution timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            });

            return await Promise.race([promise, timeoutPromise]);
        } finally {
            this.busy = false;
        }
    }

    async pipInstall(packages: string[]): Promise<string> {
        const python = await this.ensureVenv();
        return new Promise((resolve, reject) => {
            const child = spawn(python, ['-m', 'pip', 'install', ...packages]);
            let output = '';
            child.stdout.on('data', (data) => output += data.toString());
            child.stderr.on('data', (data) => output += data.toString());
            child.on('close', (code) => {
                if (code === 0) resolve(output);
                else reject(new Error(`Pip install failed with code ${code}:\n${output}`));
            });
        });
    }

    reset() {
        if (this.process) {
            this.process.kill();
            this.process = null;
            this.actualExecutable = null;
        }
    }
}

const repl = new ReplManager();

const server = new McpServer({
  name: 'gemini-pypy-repl',
  version: '0.2.0',
});

function notifyCompletion(id: string, exitCode: number, outputPath: string) {
    const currentFile = fileURLToPath(import.meta.url);
    const scriptDir = path.dirname(currentFile);
    const notifyScript = path.join(scriptDir, 'notify.js');
    
    spawn(process.execPath, [notifyScript, id, exitCode.toString(), outputPath], {
        detached: true,
        stdio: 'ignore'
    }).unref();
}

server.registerTool(
  'pypy_repl',
  {
    description: 'Executes Python code in a persistent PyPy/Python REPL session and returns the output. Maintains state between calls. Runs inside a dedicated virtual environment and workspace.',
    inputSchema: z.object({
      code: z.string().describe('The Python code to execute.'),
      async: z.boolean().optional().describe('If true, runs code in the background and notifies via tmux when done.'),
      timeout: z.number().optional().describe('Timeout in milliseconds for synchronous execution (default 30000). Ignored if async is true.'),
    }),
  },
  async ({ code, async, timeout }) => {
    if (async) {
        const id = Math.random().toString(36).substring(7).toUpperCase();
        const tmpDir = path.join(process.cwd(), '.gemini-repl', 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const outputPath = path.join(tmpDir, `gemini_repl_${id}.txt`);
        
        repl.execute(code, 3600000).then((result) => {
            let output = '';
            if (result.stdout) output += result.stdout;
            if (result.stderr) {
                if (output) output += '\n';
                output += `--- STDERR ---\n${result.stderr}`;
            }
            if (!output) output = '(No output)';
            output += `\n(Executed using ${result.executable})`;
            fs.writeFileSync(outputPath, output);
            notifyCompletion(id, 0, outputPath);
        }).catch((err) => {
            fs.writeFileSync(outputPath, `Error: ${err.message}`);
            notifyCompletion(id, 1, outputPath);
        });

        return {
            content: [
                {
                    type: 'text',
                    text: `[${id}] Task started in background. I will notify you via tmux when it completes.\nOutput path: ${outputPath}`,
                },
            ],
        };
    }

    try {
      const result = await repl.execute(code, timeout);
      let output = '';
      if (result.stdout) output += result.stdout;
      if (result.stderr) {
        if (output) output += '\n';
        output += `--- STDERR ---\n${result.stderr}`;
      }
      
      const footer = `\n(Executed using ${result.executable})`;

      return {
        content: [
          {
            type: 'text',
            text: output || 'Code executed successfully with no output.' + footer,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
      };
    }
  },
);

server.registerTool(
  'pip_install',
  {
    description: 'Installs Python packages into the REPL virtual environment.',
    inputSchema: z.object({
      packages: z.array(z.string()).describe('List of packages to install (e.g., ["numpy", "pandas"]).'),
    }),
  },
  async ({ packages }) => {
    try {
      const output = await repl.pipInstall(packages);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully installed packages: ${packages.join(', ')}\n\n${output}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error installing packages: ${error.message}`,
          },
        ],
      };
    }
  },
);

server.registerTool(
  'reset_repl',
  {
    description: 'Resets the current Python REPL session, clearing all variables, functions, and imports.',
    inputSchema: z.object({}),
  },
  async () => {
    repl.reset();
    return {
      content: [
        {
          type: 'text',
          text: 'REPL session has been reset.',
        },
      ],
    };
  },
);

server.registerTool(
  'cleanup_repl',
  {
    description: 'Cleans up temporary files and workspace artifacts.',
    inputSchema: z.object({
        all: z.boolean().optional().describe('If true, also clears the workspace directory. Otherwise only clears the tmp directory.'),
    }),
  },
  async ({ all }) => {
    const tmpDir = path.join(process.cwd(), '.gemini-repl', 'tmp');
    const workspaceDir = path.join(process.cwd(), '.gemini-repl', 'workspace');
    let msg = '';

    if (fs.existsSync(tmpDir)) {
        const files = fs.readdirSync(tmpDir);
        for (const file of files) fs.unlinkSync(path.join(tmpDir, file));
        msg += `Cleared ${files.length} files from tmp.\n`;
    }

    if (all && fs.existsSync(workspaceDir)) {
        const files = fs.readdirSync(workspaceDir);
        for (const file of files) {
            const p = path.join(workspaceDir, file);
            if (fs.lstatSync(p).isDirectory()) fs.rmSync(p, { recursive: true });
            else fs.unlinkSync(p);
        }
        msg += `Cleared ${files.length} items from workspace.\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: msg || 'Nothing to cleanup.',
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    await server.connect(transport);
    console.error('MCP Server running on stdio');
}

process.on('SIGINT', () => {
    repl.reset();
    process.exit(0);
});

process.on('SIGTERM', () => {
    repl.reset();
    process.exit(0);
});