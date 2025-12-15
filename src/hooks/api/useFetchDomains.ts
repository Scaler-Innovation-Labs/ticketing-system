
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

export interface Domain {
    id: number;
    name: string;
    description: string | null;
    is_active: boolean;
}

export interface Scope {
    id: number;
    name: string;
    domain_id: number;
    is_active: boolean;
}

export function useFetchDomains() {
    const [domains, setDomains] = useState<Domain[]>([]);
    const [scopes, setScopes] = useState<Scope[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchDomains = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/domains", {
                credentials: 'include', // Include cookies for Clerk authentication
            });
            if (response.ok) {
                const data = await response.json();
                setDomains(data.domains || []);
                setScopes(data.scopes || []);
            } else {
                console.error("Failed to fetch domains");
                toast.error("Failed to load domains");
            }
        } catch (error) {
            console.error("Error fetching domains:", error);
            toast.error("Error loading domains");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDomains();
    }, [fetchDomains]);

    return {
        domains,
        scopes,
        loading,
        refetch: fetchDomains
    };
}
