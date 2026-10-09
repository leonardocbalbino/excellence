/** Chaves das consultas (compartilhadas entre as telas para reaproveitar o cache). */
export const accessQueryKey = ['me', 'access'] as const;
export const todayEntriesKey = ['me', 'time-entries', 'today'] as const;
export const myPatrolsKey = ['me', 'patrols'] as const;
export const feedKey = ['me', 'announcements'] as const;
export const timesheetKey = ['me', 'timesheet'] as const;
export const clockSettingsKey = ['clock-settings'] as const;
