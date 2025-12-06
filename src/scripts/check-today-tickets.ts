
import { db, tickets, ticket_statuses } from "@/db";
import { eq, desc } from "drizzle-orm";
import type { TicketMetadata } from "@/db/inferred-types";

async function checkTodayTickets() {
    console.log("Checking for tickets due today or overdue...");

    const allTickets = await db
        .select({
            id: tickets.id,
            title: tickets.title,
            status_value: ticket_statuses.value,
            resolution_due_at: tickets.resolution_due_at,
            metadata: tickets.metadata,
            created_at: tickets.created_at,
        })
        .from(tickets)
        .leftJoin(ticket_statuses, eq(tickets.status_id, ticket_statuses.id))
        .orderBy(desc(tickets.created_at));

    const now = new Date();
    console.log("Current Server Time:", now.toString());
    console.log("Current ISO Time:", now.toISOString());

    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDate = now.getDate();

    console.log(`Target Date: ${todayYear}-${todayMonth + 1}-${todayDate}`);

    const pendingStatuses = new Set(["open", "in_progress", "awaiting_student", "reopened"]);

    let matchCount = 0;

    for (const t of allTickets) {
        const status = (t.status_value || "").toLowerCase();

        // Check status
        if (!pendingStatuses.has(status)) {
            continue;
        }

        // Determine TAT date
        let tatDate: Date | null = null;
        let source = "none";

        if (t.resolution_due_at) {
            tatDate = new Date(t.resolution_due_at);
            source = "resolution_due_at";
        } else if (t.metadata) {
            const meta = t.metadata as TicketMetadata;
            if (meta.tatDate) {
                tatDate = new Date(meta.tatDate);
                source = "metadata.tatDate";
            }
        }

        if (!tatDate) continue;

        const tatYear = tatDate.getFullYear();
        const tatMonth = tatDate.getMonth();
        const tatDay = tatDate.getDate();

        const isToday = tatYear === todayYear && tatMonth === todayMonth && tatDay === todayDate;
        const isOverdue = tatDate.getTime() < now.getTime();

        if (isToday || isOverdue) {
            matchCount++;
            console.log(`\n[MATCH] Ticket #${t.id}: ${t.title}`);
            console.log(`  Status: ${status}`);
            console.log(`  Source: ${source}`);
            console.log(`  TAT: ${tatDate.toString()}`);
            console.log(`  Is Today: ${isToday}`);
            console.log(`  Is Overdue: ${isOverdue}`);
        }
    }

    console.log(`\nTotal matching tickets found: ${matchCount}`);
    process.exit(0);
}

checkTodayTickets().catch(console.error);
