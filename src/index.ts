/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import path from 'path';

export class ReplManager extends EventEmitter {
    private process: ChildProcess | null = null;
    private executable: string;
    private actualExecutable: string | null = null;

    constructor(executable: string = 'pypy3') {
        super();
        this.executable = executable;
    }

    async start(): Promise<string> {
        if (this.process && this.actualExecutable) return this.actualExecutable;

        const tryExec = async (cmd: string): Promise<boolean> => {
            return new Promise((resolve) => {
                const check = spawn(cmd, ['--version']);
                check.on('error', () => resolve(false));
                check.on('close', (code) => resolve(code === 0));
            });
        };

        if (await tryExec('pypy3')) {
            this.actualExecutable = 'pypy3';
        } else if (await tryExec('pypy')) {
            this.actualExecutable = 'pypy';
        } else if (await tryExec('python3')) {
            this.actualExecutable = 'python3';
        } else if (await tryExec('python')) {
            this.actualExecutable = 'python';
        } else {
            throw new Error('No Python or PyPy executable found in PATH.');
        }

        this.process = spawn(this.actualExecutable, ['-i', '-u'], {
            stdio: ['pipe', 'pipe', 'pipe'],
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

        const initScript = `
import ast
import base64
import sys

def __gemini_run_repl(code_b64):
    try:
        code = base64.b64decode(code_b64).decode("utf-8").strip()
        if not code:
            return
        tree = ast.parse(code)
        if not tree.body:
            return
        
        last_node = tree.body[-1]
        if isinstance(last_node, ast.Expr):
            if len(tree.body) > 1:
                exec(compile(ast.Module(body=tree.body[:-1], type_ignores=[]), "<string>", "exec"), globals())
            
            result = eval(compile(ast.Expression(body=last_node.value), "<string>", "eval"), globals())
            if result is not None:
                print(repr(result))
        else:
            exec(compile(tree, "<string>", "exec"), globals())
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
`;
        await this.writeStdin(initScript + '\n');
        return this.actualExecutable;
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

    async execute(code: string): Promise<{ stdout: string; stderr: string; executable: string }> {
        const executable = await this.start();

        const marker = `__REPL_DONE_${Math.random().toString(36).substring(7)}__`;
        let stdout = '';
        let stderr = '';

        return new Promise((resolve) => {
            const onStdout = (data: string) => {
                if (data.includes(marker)) {
                    stdout += data.replace(marker, '');
                    cleanup();
                    resolve({ stdout: stdout.trim(), stderr: stderr.trim(), executable });
                } else {
                    stdout += data;
                }
            };

            const onStderr = (data: string) => {
                // Filter out interactive prompts and version header
                const lines = data.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed === '>>>' || trimmed === '...' || trimmed === '' || trimmed.startsWith('Python ') || trimmed.startsWith('Type "help"')) {
                        continue;
                    }
                    stderr += line + '\n';
                }
            };

            const cleanup = () => {
                this.removeListener('stdout', onStdout);
                this.removeListener('stderr', onStderr);
            };

            this.on('stdout', onStdout);
            this.on('stderr', onStderr);

            const b64Code = Buffer.from(code).toString('base64');
            this.writeStdin(`__gemini_run_repl("${b64Code}")\nprint("${marker}")\n`).catch(err => {
                cleanup();
                resolve({ stdout: '', stderr: `Error writing to stdin: ${err.message}`, executable });
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
  version: '0.1.0',
});

server.registerTool(
  'pypy_repl',
  {
    description: 'Executes Python code in a persistent PyPy/Python REPL session and returns the output. The session maintains state (variables, functions, imports) between calls.',
    inputSchema: z.object({
      code: z.string().describe('The Python code to execute.'),
    }),
  },
  async ({ code }) => {
    try {
      const result = await repl.execute(code);
      let output = '';
      if (result.stdout) output += result.stdout;
      if (result.stderr) {
        if (output) output += '\n';
        output += `--- STDERR ---
${result.stderr}`;
      }
      
      const footer = `
(Executed using ${result.executable})`;

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