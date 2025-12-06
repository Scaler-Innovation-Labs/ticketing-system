
import { useState, useEffect } from 'react';
import { generateSlug } from '@/lib/utils/slug';

export function useSlugGeneration(sourceValue: string) {
    const [slug, setSlug] = useState('');

    useEffect(() => {
        setSlug(generateSlug(sourceValue || ''));
    }, [sourceValue]);

    return slug;
}
