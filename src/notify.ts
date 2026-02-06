
import { sendNotification, SESSION_NAME } from './tmux_utils.js';

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.error('Usage: node notify.js <id> <exitCode> <outputPath>');
        process.exit(1);
    }

    const id = args[0];
    const exitCode = args[1];
    const outputPath = args[2];
    
    // Default to the main session pane if not specified (simplification for now)
    const target = `${SESSION_NAME}:0.0`;

    const message = `[${id}] Background task finished (Exit ${exitCode}). Output saved to: ${outputPath}`;
    
    try {
        await sendNotification(target, message);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
