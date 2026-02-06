
import assert from 'assert';
import { ReplManager } from '../src/index.ts'; // We'll need to export this for testing

async function runTests() {
    console.log('Running gemini-pypy-repl tests...');
    const repl = new ReplManager();

    try {
        // Test 1: Basic Execution
        console.log('Test 1: Basic Execution');
        const r1 = await repl.execute('x = 5\nx + 10');
        assert.strictEqual(r1.stdout, '15');
        console.log('  Passed');

        // Test 2: Persistent State
        console.log('Test 2: Persistent State');
        const r2 = await repl.execute('x * 2');
        assert.strictEqual(r2.stdout, '10');
        console.log('  Passed');

        // Test 3: Multiline Functions
        console.log('Test 3: Multiline Functions');
        const r3 = await repl.execute(`
def add(a, b):
    return a + b
add(10, 20)
        `);
        assert.strictEqual(r3.stdout, '30');
        console.log('  Passed');

        // Test 4: Error Handling
        console.log('Test 4: Error Handling');
        const r4 = await repl.execute('1 / 0');
        assert.ok(r4.stderr.includes('ZeroDivisionError'));
        console.log('  Passed');

        // Test 5: Reset
        console.log('Test 5: Reset');
        repl.reset();
        const r5 = await repl.execute('try:\n    print(x)\nexcept NameError:\n    print("not found")');
        assert.strictEqual(r5.stdout, 'not found');
        console.log('  Passed');

        console.log('\nAll tests passed successfully!');
    } catch (err) {
        console.error('\nTest failed:');
        console.error(err);
        process.exit(1);
    } finally {
        repl.reset();
    }
}

runTests();
