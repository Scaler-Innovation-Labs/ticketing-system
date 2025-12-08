import { runEscalation } from './src/lib/ticket/ticket-escalation-service';

async function verify() {
    console.log('Running escalation check...');
    try {
        const result = await runEscalation();
        console.log('Escalation Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Escalation failed:', error);
    }
    process.exit(0);
}

verify();
