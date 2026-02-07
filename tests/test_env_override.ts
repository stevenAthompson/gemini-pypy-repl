
import assert from 'assert';
import { ReplManager } from '../src/index.ts';

async function runTests() {
    console.log('Running V2.7 Environment Override Tests...');
    
    // Mock ENV
    process.env.GEMINI_PROJECT_ROOT = '/tmp/fake/root';
    
    const repl = new ReplManager();

    try {
        await repl.start();

        // Check if PROJECT_ROOT reflects the override
        const r1 = await repl.execute('PROJECT_ROOT');
        assert.ok(r1.stdout.includes('/tmp/fake/root'), `Expected PROJECT_ROOT to be overridden, got: ${r1.stdout}`);
        console.log('  Passed: GEMINI_PROJECT_ROOT override worked');

    } catch (err: any) {
        console.error('\nTest failed:', err.message);
        process.exit(1);
    } finally {
        repl.reset();
        delete process.env.GEMINI_PROJECT_ROOT; // Cleanup
        process.exit(0);
    }
}

runTests();
