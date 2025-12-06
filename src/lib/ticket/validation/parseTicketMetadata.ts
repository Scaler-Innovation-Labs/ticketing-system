
export function parseTicketMetadata(metadata: any) {
    if (typeof metadata === 'string') {
        try {
            return JSON.parse(metadata);
        } catch {
            return {};
        }
    }
    return metadata || {};
}

export function extractImagesFromMetadata(metadata: any): string[] {
    const parsed = parseTicketMetadata(metadata);
    if (Array.isArray(parsed.images)) {
        return parsed.images.filter((img: any) => typeof img === 'string');
    }
    return [];
}
