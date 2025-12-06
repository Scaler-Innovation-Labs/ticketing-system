
export function normalizeStatus(status: string | undefined | null): string {
    if (!status) return 'open';
    return status.toLowerCase();
}

export function isOpenStatus(status: string): boolean {
    return ['open', 'acknowledged', 'in_progress', 'reopened'].includes(status.toLowerCase());
}
