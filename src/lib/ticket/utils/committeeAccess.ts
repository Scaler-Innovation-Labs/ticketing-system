export async function checkCommitteeAccess(ticketId: number, userId: string) { return true; }
export const canCommitteeAccessTicket = checkCommitteeAccess;
