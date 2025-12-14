import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TIMEZONE = 'Asia/Kolkata'; // IST is UTC+5:30

/**
 * Formats a date to 'MMM d, yyyy' in IST.
 * @param dateInput - The date to format (Date object or string).
 * @returns Formatted date string or 'N/A'.
 */
export function formatTimelineDate(dateInput: Date | string | null | undefined): string {
    if (!dateInput) return 'N/A';

    let date: Date;
    if (typeof dateInput === 'string') {
        date = parseISO(dateInput);
    } else {
        date = dateInput;
    }

    if (isNaN(date.getTime())) return 'N/A';

    const zonedDate = toZonedTime(date, TIMEZONE);
    return format(zonedDate, 'MMM d, yyyy');
}

/**
 * Formats a time to 'h:mm a' in IST.
 * @param dateInput - The date to format (Date object or string).
 * @returns Formatted time string or 'N/A'.
 */
export function formatTimelineTime(dateInput: Date | string | null | undefined): string {
    if (!dateInput) return 'N/A';

    let date: Date;
    if (typeof dateInput === 'string') {
        date = parseISO(dateInput);
    } else {
        date = dateInput;
    }

    if (isNaN(date.getTime())) return 'N/A';

    const zonedDate = toZonedTime(date, TIMEZONE);
    return format(zonedDate, 'h:mm a');
}

/**
 * Formats a date and time to 'MMM d, yyyy h:mm a' in IST.
 * @param dateInput - The date to format (Date object or string).
 * @returns Formatted date and time string or 'N/A'.
 */
export function formatTimelineDateTime(dateInput: Date | string | null | undefined): string {
    if (!dateInput) return 'N/A';

    let date: Date;
    if (typeof dateInput === 'string') {
        date = parseISO(dateInput);
    } else {
        date = dateInput;
    }

    if (isNaN(date.getTime())) return 'N/A';

    const zonedDate = toZonedTime(date, TIMEZONE);
    return format(zonedDate, 'MMM d, yyyy h:mm a');
}

