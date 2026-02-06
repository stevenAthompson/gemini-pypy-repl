import assert from 'assert';
import { ReplManager } from '../src/index.ts';
import * as fs from 'fs';
import * as path from 'path';

async function runTests() {
    console.log('Running gemini-pypy-repl V2.2 (Robustness) tests...');
    const repl = new ReplManager();

    try {
        // ... (Previous tests)
        console.log('Test 1: Structure Creation');
        await repl.start();
        console.log('  Passed');

        // Test 5: Timeout Logic
        console.log('Test 5: Timeout');
        try {
            await repl.execute('import time; time.sleep(2)', 1000); // 1s timeout
            assert.fail('Should have timed out');
        } catch (e: any) {
            assert.ok(e.message.includes('timed out'), 'Error should be timeout');
        }
        console.log('  Passed');

        // Test 6: Busy Check
        console.log('Test 6: Busy Check');
        const slowPromise = repl.execute('import time; time.sleep(1)', 5000);
        try {
            await repl.execute('1+1');
            assert.fail('Should have been busy');
        } catch (e: any) {
            assert.ok(e.message.includes('busy'), 'Error should be busy');
        }
        await slowPromise;
        console.log('  Passed');

        // Test 7: Output Truncation (Mocking the limit for test if possible, or just checking large output)
        // We can't easily change the private limit, but we can verify it doesn't crash on large output.
        console.log('Test 7: Large Output Safety');
        const r7 = await repl.execute('print("A" * 1000)'); 
        assert.strictEqual(r7.stdout.length, 1000);
        console.log('  Passed');

        console.log('\nAll V2.2 tests passed successfully!');
    } catch (err) {
        console.error('\nTest failed:');
        console.error(err);
        process.exit(1);
    } finally {
        repl.reset();
        process.exit(0);
    }
}

runTests();