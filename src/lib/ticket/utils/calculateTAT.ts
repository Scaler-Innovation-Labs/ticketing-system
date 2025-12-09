
export function calculateTAT(ticket: any, _context?: any) {
    const resolution = ticket?.resolution_due_at ?? ticket?.resolutionDueAt ?? null;
    const deadline = resolution ? new Date(resolution) : null;
    const isOverdue = deadline ? new Date() > deadline : false;
    const formattedDeadline = deadline ? deadline.toLocaleDateString() : 'No deadline';

    // Pull extra metadata if present
    const metadata = ticket?.metadata || {};
    const tatSetAt = metadata.tatSetAt ?? metadata.tat_set_at ?? null;
    const tatSetBy = metadata.tatSetBy ?? metadata.tat_set_by ?? null;
    const tat = metadata.tat ?? null;
    const tatExtensions = metadata.tatExtensions ?? metadata.tat_extensions ?? [];

    return {
        deadline,
        isOverdue,
        formattedDeadline,
        expectedResolution: deadline,
        tatSetAt,
        tatSetBy,
        tat,
        tatExtensions,
    };
}
export const calculateTATInfo = calculateTAT;
