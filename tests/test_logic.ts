import assert from 'assert';
import { ReplManager } from '../src/index.ts';
import * as fs from 'fs';
import * as path from 'path';

async function runTests() {
    console.log('Running gemini-pypy-repl V2 tests...');
    const repl = new ReplManager();

    try {
        // Test 1: Venv Creation
        console.log('Test 1: Venv & Workspace Creation');
        await repl.start();
        assert.ok(fs.existsSync('.venv'), 'Venv should exist');
        assert.ok(fs.existsSync('workspace'), 'Workspace should exist');
        console.log('  Passed');

        // Test 2: Basic Execution
        console.log('Test 2: Basic Execution');
        const r1 = await repl.execute('x = 5\nx + 10');
        assert.strictEqual(r1.stdout, '15');
        console.log('  Passed');

        // Test 3: Workspace Persistence
        console.log('Test 3: Workspace File Writing');
        await repl.execute('with open("test.txt", "w") as f: f.write("hello")');
        assert.ok(fs.existsSync(path.join('workspace', 'test.txt')), 'File should be in workspace');
        const content = fs.readFileSync(path.join('workspace', 'test.txt'), 'utf-8');
        assert.strictEqual(content, 'hello');
        console.log('  Passed');

        // Test 4: Pip Install (Small package)
        console.log('Test 4: Pip Install');
        const r4 = await repl.pipInstall(['six']);
        assert.ok(r4.includes('Successfully installed') || r4.includes('already satisfied'), 'Pip should install package');
        console.log('  Passed');

        console.log('\nAll V2 tests passed successfully!');
    } catch (err) {
        console.error('\nTest failed:');
        console.error(err);
        process.exit(1);
    } finally {
        repl.reset();
    }
}

runTests();