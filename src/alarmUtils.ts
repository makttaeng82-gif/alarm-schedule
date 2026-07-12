import { getAlarmOccurrencesAround, getNextAlarmOccurrence } from './timeUtils'
import type { AlarmOccurrence } from './timeUtils'
import type { Schedule } from './types'

export type TimedOneTimeSchedule = {
  schedule: Schedule
  nextAlarm: AlarmOccurrence | null
}

export const sortOneTimeSchedules = (
  schedules: Schedule[],
  currentTime: number,
  holidayDates: string[],
): TimedOneTimeSchedule[] =>
  schedules
    .filter((schedule) => schedule.oneTimeDate)
    .map((schedule) => ({
      schedule,
      nextAlarm: getNextAlarmOccurrence(schedule, new Date(currentTime), holidayDates),
    }))
    .sort((a, b) => {
      if (!a.nextAlarm) return b.nextAlarm ? 1 : 0
      if (!b.nextAlarm) return -1
      return a.nextAlarm.alarmDate.getTime() - b.nextAlarm.alarmDate.getTime()
    })

export const getMissedAlarmTitles = (
  schedules: Schedule[],
  previousTime: number,
  currentTime: number,
  holidayDates: string[],
) =>
  [
    ...new Set(
      schedules.flatMap((schedule) => {
        if (!schedule.enabled) return []
        return getAlarmOccurrencesAround(schedule, new Date(currentTime), 2, holidayDates)
          .filter(({ alarmDate }) => alarmDate.getTime() > previousTime && alarmDate.getTime() <= currentTime)
          .map(() => schedule.title)
      }),
    ),
  ]
