import { dayKeys, soundKeys } from './scheduleData'
import type { BackupData, ExcludedDate, HolidayInfo, QuickTimer, Schedule } from './types'

export const isString = (value: unknown): value is string => typeof value === 'string'
export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
export const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export const isExcludedDate = (value: unknown): value is ExcludedDate =>
  Boolean(
    value &&
      typeof value === 'object' &&
      isString((value as ExcludedDate).date) &&
      isString((value as ExcludedDate).reason),
  )

export const normalizeExcludedDates = (value: unknown): ExcludedDate[] =>
  Array.isArray(value)
    ? value
        .map((item) => (isString(item) ? { date: item, reason: '' } : isExcludedDate(item) ? item : null))
        .filter((item): item is ExcludedDate => item !== null)
    : []

export const isHolidayInfo = (value: unknown): value is HolidayInfo =>
  Boolean(
    value &&
      typeof value === 'object' &&
      isString((value as HolidayInfo).date) &&
      isString((value as HolidayInfo).name) &&
      isBoolean((value as HolidayInfo).enabled),
  )

export const normalizeHolidayItems = (value: unknown): HolidayInfo[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (isString(item)) return { date: item, name: '', enabled: true }
          if (!item || typeof item !== 'object') return null
          const holiday = item as Partial<HolidayInfo>
          return isString(holiday.date) && isString(holiday.name) && typeof holiday.enabled === 'boolean'
            ? { date: holiday.date, name: holiday.name, enabled: holiday.enabled }
            : null
        })
        .filter((item): item is HolidayInfo => item !== null)
    : []

export const isSchedule = (value: unknown): value is Schedule => {
  if (!value || typeof value !== 'object') return false
  const schedule = value as Schedule
  return (
    isString(schedule.id) &&
    isString(schedule.title) &&
    Array.isArray(schedule.days) &&
    schedule.days.every((day) => dayKeys.includes(day)) &&
    isString(schedule.startTime) &&
    isString(schedule.endTime) &&
    isNumber(schedule.alarmBeforeMinutes) &&
    soundKeys.includes(schedule.sound) &&
    isNumber(schedule.volume) &&
    isString(schedule.color) &&
    isBoolean(schedule.enabled) &&
    isString(schedule.memo) &&
    (!('excludedDates' in schedule) ||
      (Array.isArray(schedule.excludedDates) &&
        schedule.excludedDates.every((item) => isString(item) || isExcludedDate(item)))) &&
    (!('excludeHolidays' in schedule) || isBoolean(schedule.excludeHolidays)) &&
    (!('oneTimeDate' in schedule) || schedule.oneTimeDate === null || isString(schedule.oneTimeDate))
    && (!('oneTimeAt' in schedule) || schedule.oneTimeAt === null || isString(schedule.oneTimeAt))
  )
}

export const isQuickTimer = (value: unknown): value is QuickTimer => {
  if (!value || typeof value !== 'object') return false
  const timer = value as QuickTimer
  return isString(timer.id) && isNumber(timer.minutes) && timer.minutes > 0
}

export const isBackupData = (value: unknown): value is BackupData => {
  if (!value || typeof value !== 'object') return false
  const backup = value as BackupData
  return (
    backup.app === 'alarm-schedule' &&
    backup.version === 1 &&
    isString(backup.exportedAt) &&
    Array.isArray(backup.schedules) &&
    backup.schedules.every(isSchedule) &&
    Array.isArray(backup.quickTimers) &&
    backup.quickTimers.every(isQuickTimer) &&
    (backup.theme === 'light' || backup.theme === 'dark') &&
    (!('holidayDates' in backup) ||
      (Array.isArray(backup.holidayDates) && backup.holidayDates.every(isString))) &&
    (!('holidayItems' in backup) ||
      (Array.isArray(backup.holidayItems) && backup.holidayItems.every(isHolidayInfo)))
  )
}
