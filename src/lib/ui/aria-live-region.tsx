
import React from 'react';

interface AriaLiveRegionProps {
    loading?: boolean;
    loadingMessage?: string;
    success?: boolean | string;
    error?: boolean | string;
    className?: string;
}

export function AriaLiveRegion({
    loading,
    loadingMessage = 'Loading...',
    success,
    error,
    className,
}: AriaLiveRegionProps) {
    return (
        <div className={`sr-only ${className || ''}`} aria-live="polite" aria-atomic="true">
            {loading && <span>{loadingMessage}</span>}
            {success && <span>{typeof success === 'string' ? success : 'Success'}</span>}
            {error && <span>{typeof error === 'string' ? error : 'Error'}</span>}
        </div>
    );
}
