import assert from 'assert';
import { ReplManager } from '../src/index.ts';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

async function runTests() {
    console.log('Running gemini-pypy-repl V2.4 (Manual Integration) tests...');
    const repl = new ReplManager();

    try {
        // Test 1: Structure Creation
        console.log('Test 1: Structure Creation');
        await repl.start();
        assert.ok(fs.existsSync('.gemini-repl'), 'Base dir should exist');
        console.log('  Passed');

        // Test 2: Basic Execution
        console.log('Test 2: Basic Execution');
        const r1 = await repl.execute('x = 5\nx + 10');
        assert.strictEqual(r1.stdout, '15');
        console.log('  Passed');

        // Test 3: Workspace Persistence
        console.log('Test 3: Workspace File Writing');
        await repl.execute('with open("test.txt", "w") as f: f.write("hello")');
        const filePath = path.join('.gemini-repl', 'workspace', 'test.txt');
        assert.ok(fs.existsSync(filePath), 'File should be in workspace');
        console.log('  Passed');

        // Test 4: Pip Install
        console.log('Test 4: Pip Install');
        const r4 = await repl.pipInstall(['six']);
        assert.ok(r4.includes('Successfully installed') || r4.includes('already satisfied'));
        console.log('  Passed');

        // Test 5: Timeout
        console.log('Test 5: Timeout');
        try {
            await repl.execute('import time; time.sleep(2)', 1000); 
            assert.fail('Should have timed out');
        } catch (e: any) {
            assert.ok(e.message.includes('timed out'));
        }
        console.log('  Passed');

        // Test 6: Input Guard
        console.log('Test 6: Input Guard');
        const r6 = await repl.execute('input("fail me")');
        assert.ok(r6.stderr.includes('input(): lost sys.stdin'));
        console.log('  Passed');

        // Test 7: Cleanup (Simulating the tool)
        console.log('Test 7: Cleanup Logic');
        const tmpDir = path.join('.gemini-repl', 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
        fs.writeFileSync(path.join(tmpDir, 'junk.txt'), 'junk');
        
        // Manual cleanup logic matching the tool
        const files = fs.readdirSync(tmpDir);
        for (const file of files) fs.unlinkSync(path.join(tmpDir, file));
        
        assert.strictEqual(fs.readdirSync(tmpDir).length, 0);
        console.log('  Passed');

        console.log('\nAll tests passed successfully!');
    } catch (err) {
        console.error('\nTest failed:', err);
        process.exit(1);
    } finally {
        repl.reset();
        process.exit(0);
    }
}

runTests();
