/**
 * TAT Calculator Utilities
 * 
 * Handles TAT calculations excluding weekends (Saturday and Sunday)
 * and pause/resume logic for awaiting_student_response status
 */

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Add business hours to a date, excluding weekends
 * @param startDate Starting date
 * @param hours Number of hours to add
 * @returns New date with hours added, skipping weekends
 */
export function addBusinessHours(startDate: Date, hours: number): Date {
  const result = new Date(startDate);
  let hoursRemaining = hours;

  while (hoursRemaining > 0) {
    // If current day is weekend, skip to next Monday
    if (isWeekend(result)) {
      const day = result.getDay();
      const daysToAdd = day === 0 ? 1 : 2; // If Sunday, add 1 day; if Saturday, add 2 days
      result.setDate(result.getDate() + daysToAdd);
      result.setHours(0, 0, 0, 0); // Reset to start of day
      continue;
    }

    // Calculate hours until end of current day (assuming 24-hour day)
    const currentHour = result.getHours();
    const hoursUntilEndOfDay = 24 - currentHour;

    if (hoursRemaining <= hoursUntilEndOfDay) {
      // Can fit remaining hours in current day
      result.setHours(result.getHours() + hoursRemaining);
      hoursRemaining = 0;
    } else {
      // Move to next day
      hoursRemaining -= hoursUntilEndOfDay;
      result.setDate(result.getDate() + 1);
      result.setHours(0, 0, 0, 0);
    }
  }

  return result;
}

/**
 * Calculate the remaining TAT hours between two dates, excluding weekends
 * @param startDate Start date
 * @param endDate End date
 * @returns Remaining hours (excluding weekends)
 */
export function calculateRemainingBusinessHours(startDate: Date, endDate: Date): number {
  let current = new Date(startDate);
  let totalHours = 0;

  while (current < endDate) {
    if (!isWeekend(current)) {
      const nextDay = new Date(current);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);

      const endOfCurrentDay = new Date(current);
      endOfCurrentDay.setHours(23, 59, 59, 999);

      const end = endDate < nextDay ? endDate : endOfCurrentDay;
      const hoursInDay = (end.getTime() - current.getTime()) / (1000 * 60 * 60);
      totalHours += Math.max(0, hoursInDay);
    }

    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return Math.ceil(totalHours);
}

/**
 * Calculate deadlines with business hours (excluding weekends)
 */
export function calculateDeadlinesWithBusinessHours(slaHours: number, startDate?: Date): {
  acknowledgement_due_at: Date;
  resolution_due_at: Date;
} {
  const now = startDate || new Date();

  // Acknowledgement: 10% of SLA time
  const acknowledgementHours = Math.ceil(slaHours * 0.1);
  const acknowledgementDue = addBusinessHours(now, acknowledgementHours);

  // Resolution: full SLA time
  const resolutionDue = addBusinessHours(now, slaHours);

  return {
    acknowledgement_due_at: acknowledgementDue,
    resolution_due_at: resolutionDue,
  };
}

