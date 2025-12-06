

export async function assignAdmin() { return null; }

export function ticketMatchesAdminAssignment(ticket: any, assignment: any) {
    if (!assignment) return true;
    return true;
}

export async function getAdminAssignedCategoryDomains(adminUserId: string): Promise<string[]> {
    return [];
}
