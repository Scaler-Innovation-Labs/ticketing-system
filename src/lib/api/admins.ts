import { useState, useEffect, useCallback } from 'react';

export interface Admin {
    id: string;
    name: string;
    email: string;
    domain?: string;
    scope?: string;
}

export async function getAdmins() { return []; }

export function useAdmins(mode: "list" = "list") {
    const [admins, setAdmins] = useState<Admin[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchAdmins = useCallback(async () => {
        try {
            setLoading(true);
            // Fetch only active admins by default
            const response = await fetch('/api/admin/list?limit=100&activeOnly=true');
            if (!response.ok) throw new Error('Failed to fetch admins');
            const data = await response.json();

            const mappedAdmins = (data.admins || []).map((admin: any) => ({
                id: admin.user_id,
                name: admin.full_name || 'Unknown',
                email: admin.email,
                // Domain and scope are not currently returned by the API
                // They would need to be fetched from admin_assignments
                domain: admin.designation ? admin.designation : undefined,
                scope: admin.department ? admin.department : undefined
            }));

            setAdmins(mappedAdmins);
        } catch (err) {
            setError(err as Error);
            console.error("Error fetching admins:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAdmins();
    }, [fetchAdmins]);

    return { admins, loading, error, refetch: fetchAdmins };
}
