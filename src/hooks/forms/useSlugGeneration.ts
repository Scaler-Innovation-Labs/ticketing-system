
import { useState, useCallback } from 'react';
import { generateSlug } from '@/lib/utils/slug';

export function useSlugGeneration(separator: string = '-') {
    const [slugManuallyEdited, setManualEdit] = useState(false);

    const handleNameChange = useCallback((name: string, currentSlug: string, setSlug: (slug: string) => void) => {
        if (!slugManuallyEdited) {
            const newSlug = generateSlug(name);
            setSlug(newSlug);
        }
    }, [slugManuallyEdited]);

    const handleSlugChange = useCallback((value: string, setSlug: (slug: string) => void) => {
        setSlug(value);
        setManualEdit(true);
    }, []);

    return {
        slugManuallyEdited,
        handleNameChange,
        handleSlugChange,
        setManualEdit
    };
}
