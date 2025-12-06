
import { db } from "@/db";
import { tickets } from "@/db/schema-tickets";
import { eq } from "drizzle-orm";

async function inspectTicket() {
    try {
        const ticketId = 2;
        console.log(`Fetching ticket ${ticketId}...`);
        const ticket = await db.query.tickets.findFirst({
            where: eq(tickets.id, ticketId),
        });

        if (!ticket) {
            console.log("Ticket not found");
            return;
        }

        console.log("Ticket Metadata Type:", typeof ticket.metadata);
        console.log("Ticket Metadata Value:", ticket.metadata);

        if (typeof ticket.metadata === 'string') {
            console.log("Metadata is string, attempting parse...");
            try {
                const parsed = JSON.parse(ticket.metadata);
                console.log("Parse successful:", parsed);
            } catch (e) {
                console.error("Parse failed:", e);
            }
        }

        // Check all tickets for metadata issues
        console.log("\nChecking all tickets...");
        const allTickets = await db.query.tickets.findMany();
        for (const t of allTickets) {
            if (typeof t.metadata === 'string') {
                console.log(`Ticket ${t.id} has string metadata`);
            }
        }
        console.log("Done checking tickets.");

    } catch (error) {
        console.error("Error:", error);
    }
    process.exit(0);
}

inspectTicket();
