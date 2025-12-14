/**
 * API Client
 * 
 * Centralized HTTP client for making API requests from client components.
 * Provides type-safe methods and automatic error handling.
 */

// API Base URL
const API_BASE = '/api';

// API Endpoints
export const endpoints = {
    // Tickets
    tickets: {
        list: `${API_BASE}/tickets`,
        create: `${API_BASE}/tickets`,
        get: (id: number) => `${API_BASE}/tickets/${id}`,
        update: (id: number) => `${API_BASE}/tickets/${id}`,
        delete: (id: number) => `${API_BASE}/tickets/${id}`,
        assign: (id: number) => `${API_BASE}/tickets/${id}/assign`,
        status: (id: number) => `${API_BASE}/tickets/${id}/status`,
        comments: (id: number) => `${API_BASE}/tickets/${id}/comments`,
        attachments: (id: number) => `${API_BASE}/tickets/${id}/attachments`,
        reassign: (id: number) => `${API_BASE}/tickets/${id}/reassign`,
    },
    // Categories
    categories: {
        list: `${API_BASE}/categories/list`,
        get: (id: number) => `${API_BASE}/categories/${id}`,
        hierarchy: `${API_BASE}/categories/hierarchy`,
    },
    // Profile
    profile: {
        get: `${API_BASE}/v1/profile`,
        update: `${API_BASE}/v1/profile`,
    },
    // Users
    users: {
        list: `${API_BASE}/users`,
        get: (id: string) => `${API_BASE}/users/${id}`,
    },
    // Upload
    upload: {
        image: `${API_BASE}/upload/image`,
    },
    // Admin
    admin: {
        categories: `${API_BASE}/admin/categories`,
        subcategories: `${API_BASE}/admin/subcategories`,
        fields: `${API_BASE}/admin/fields`,
        users: `${API_BASE}/admin/users`,
        stats: `${API_BASE}/admin/stats`,
    },
    // Top-level helper functions for backward compatibility
    ticketReassign: (id: number) => `${API_BASE}/tickets/${id}/reassign`,
} as const;

// Error class for API errors
export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public data?: unknown
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

// Generic fetch wrapper
async function request<T>(
    url: string,
    options: RequestInit = {}
): Promise<T> {
    const defaultOptions: RequestInit = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    };

    const response = await fetch(url, { ...defaultOptions, ...options });

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch {
            errorData = null;
        }
        throw new ApiError(
            errorData?.error || `Request failed: ${response.statusText}`,
            response.status,
            errorData
        );
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) return {} as T;

    try {
        return JSON.parse(text);
    } catch {
        return text as unknown as T;
    }
}

// API methods
export const api = {
    get: <T>(url: string, options?: RequestInit) =>
        request<T>(url, { method: 'GET', ...options }),

    post: <T>(url: string, data?: unknown, options?: RequestInit) =>
        request<T>(url, {
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
            ...options,
        }),

    put: <T>(url: string, data?: unknown, options?: RequestInit) =>
        request<T>(url, {
            method: 'PUT',
            body: data ? JSON.stringify(data) : undefined,
            ...options,
        }),

    patch: <T>(url: string, data?: unknown, options?: RequestInit) =>
        request<T>(url, {
            method: 'PATCH',
            body: data ? JSON.stringify(data) : undefined,
            ...options,
        }),

    delete: <T>(url: string, options?: RequestInit) =>
        request<T>(url, { method: 'DELETE', ...options }),

    // File upload helper (for FormData)
    upload: async <T>(url: string, formData: FormData): Promise<T> => {
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            credentials: 'include', // Include cookies for authentication (required for Clerk)
            // Don't set Content-Type - browser will set it with boundary for FormData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new ApiError(
                errorData?.error || 'Upload failed',
                response.status,
                errorData
            );
        }

        return response.json();
    },
};

export default api;
