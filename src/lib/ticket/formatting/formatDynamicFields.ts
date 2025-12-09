
export function formatDynamicFields(fields: any) {
    if (!fields) return [];
    if (Array.isArray(fields)) return fields;
    if (typeof fields !== 'object') return [];
    return Object.entries(fields).map(([key, value]) => ({
        label: key.replace(/_/g, ' '),
        value: String(value)
    }));
}

export function extractDynamicFields(metadata: Record<string, any>, schema: any = {}): Array<{ key: string; label: string; value: unknown; fieldType: string }> {
    if (!metadata) {
        return [];
    }

    const knownFields = ['subcategory', 'comments', 'images', 'tat', 'tatDate', 'tatSetAt', 'tatSetBy', 'tatExtensions', 'resolved_at', 'reopened_at', 'acknowledged_at'];

    const dynamicFields = Object.entries(metadata)
        .filter(([key]) => !knownFields.includes(key))
        .map(([key, value]) => {
            // Try to find label and type in schema
            const schemaField = schema?.properties?.[key];
            const label = schemaField?.title || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const fieldType = schemaField?.type || (typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'text');

            return {
                key,
                label,
                value,
                fieldType
            };
        });

    return dynamicFields;
}
