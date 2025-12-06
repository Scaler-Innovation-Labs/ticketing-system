import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeStatusForComparison(status: string | undefined | null): string {
  if (!status) return 'open';
  return status.toLowerCase();
}

export function formatStatus(status: string | undefined | null): string {
  if (!status) return 'Open';
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-')   // Replace multiple - with single -
    .replace(/^-+/, '')       // Trim - from start of text
    .replace(/-+$/, '');      // Trim - from end of text
}
