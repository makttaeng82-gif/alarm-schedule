import { colors } from './scheduleData'
import type { DayKey, Schedule, ScheduleForm } from './types'

export type AlarmOccurrence = {
  schedule: Schedule
  startDate: Date
  alarmDate: Date
}

export const getEmptyForm = (): ScheduleForm => ({
  title: '',
  days: [getTodayKey()],
  startTime: '09:00',
  endTime: '10:00',
  alarmBeforeMinutes: 1,
  sound: 'classic',
  volume: 85,
  color: colors[0],
  enabled: true,
  memo: '',
  excludedDates: [],
  excludeHolidays: false,
  oneTimeDate: null,
  oneTimeAt: null,
})

export const toMinutes = (time: string) => {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

export const toTimeString = (totalMinutes: number) => {
  const normalizedMinutes = (totalMinutes + 1440) % 1440
  const hour = Math.floor(normalizedMinutes / 60)
  const minute = normalizedMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export const getNextEndTime = (startTime: string) => toTimeString(toMinutes(startTime) + 60)

export const getStartTimeChange = (startTime: string) => ({
  startTime,
  endTime: getNextEndTime(startTime),
})

export const formatAlarm = (time: string, before: number) => {
  const total = (toMinutes(time) - before + 1440) % 1440
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function getTodayKey() {
  return getDayKeyFromDate(new Date())
}

export const getDayKeyFromDate = (date: Date) => {
  const keyByDay: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return keyByDay[date.getDay()]
}

export const getCurrentClock = () => {
  const now = new Date()
  return [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join(':')
}

export const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}시간 ${minutes}분 ${seconds}초`
  }

  return `${minutes}분 ${seconds}초`
}

export const formatTimeFromDate = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

export const formatTimeWithSeconds = (date: Date) =>
  `${formatTimeFromDate(date)}:${String(date.getSeconds()).padStart(2, '0')}`

export const formatTimerLabel = (minutes: number) => {
  if (minutes < 60) return `${minutes}분 후`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours}시간 후` : `${hours}시간 ${remainingMinutes}분 후`
}

// 일정은 분 단위로 저장하므로, 지정 시간 이후 처음 도달하는 분 단위 시각으로 올림합니다.
export const getQuickTimerTargetDate = (now: Date, minutes: number) => {
  const target = new Date(now.getTime() + Math.max(1, minutes) * 60_000)
  if (target.getSeconds() !== 0 || target.getMilliseconds() !== 0) {
    target.setMinutes(target.getMinutes() + 1)
  }
  target.setSeconds(0, 0)
  return target
}

const setDateTime = (date: Date, time: string) => {
  const [hour, minute] = time.split(':').map(Number)
  const next = new Date(date)
  next.setHours(hour, minute, 0, 0)
  return next
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const isScheduleExcludedOnDate = (
  schedule: Pick<Schedule, 'excludedDates' | 'excludeHolidays'>,
  date: Date,
  holidayDates: string[] = [],
) => {
  const dateKey = formatDateKey(date)
  return (
    (schedule.excludedDates ?? []).some((item) => item.date === dateKey) ||
    (schedule.excludeHolidays && holidayDates.includes(dateKey))
  )
}

export const getAlarmOccurrenceForStartDate = (
  schedule: Schedule,
  startDate: Date,
): AlarmOccurrence => {
  const scheduledStart = setDateTime(startDate, schedule.startTime)
  const alarmDate = new Date(scheduledStart.getTime() - schedule.alarmBeforeMinutes * 60_000)
  return { schedule, startDate: scheduledStart, alarmDate }
}

export const getAlarmOccurrencesAround = (
  schedule: Schedule,
  referenceDate: Date,
  dayRange = 8,
  holidayDates: string[] = [],
) => {
  const occurrences: AlarmOccurrence[] = []

  if (schedule.oneTimeAt) {
    const oneTimeStart = new Date(schedule.oneTimeAt)
    if (Number.isNaN(oneTimeStart.getTime())) return occurrences
    if (isScheduleExcludedOnDate(schedule, oneTimeStart, holidayDates)) return occurrences
    if (!schedule.days.includes(getDayKeyFromDate(oneTimeStart))) return occurrences
    return [{
      schedule,
      startDate: oneTimeStart,
      alarmDate: new Date(oneTimeStart.getTime() - schedule.alarmBeforeMinutes * 60_000),
    }]
  }

  for (let offset = -dayRange; offset <= dayRange; offset += 1) {
    const candidateDate = addDays(referenceDate, offset)
    if (schedule.oneTimeDate && schedule.oneTimeDate !== formatDateKey(candidateDate)) continue
    if (!schedule.days.includes(getDayKeyFromDate(candidateDate))) continue
    if (isScheduleExcludedOnDate(schedule, candidateDate, holidayDates)) continue
    occurrences.push(getAlarmOccurrenceForStartDate(schedule, candidateDate))
  }

  return occurrences
}

export const getDueAlarmOccurrence = (
  schedule: Schedule,
  currentDate: Date,
  windowMs = 60_000,
  holidayDates: string[] = [],
) =>
  getAlarmOccurrencesAround(schedule, currentDate, 8, holidayDates).find(({ alarmDate }) => {
    const diff = currentDate.getTime() - alarmDate.getTime()
    return diff >= 0 && diff < windowMs
  }) ?? null

export const getNextAlarmOccurrence = (
  schedule: Schedule,
  currentDate: Date,
  holidayDates: string[] = [],
) =>
  getAlarmOccurrencesAround(schedule, currentDate, 8, holidayDates)
    .filter(({ alarmDate }) => alarmDate.getTime() > currentDate.getTime())
    .sort((a, b) => a.alarmDate.getTime() - b.alarmDate.getTime())[0] ?? null
