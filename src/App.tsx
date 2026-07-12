import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Bell,
  BellRing,
  CalendarDays,
  Check,
  CircleStop,
  HelpCircle,
  Moon,
  Pencil,
  Play,
  Plus,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import './App.css'
import {
  colors,
  days,
  defaultQuickTimers,
  helpContent,
  HOLIDAY_DATES_KEY,
  notificationLabels,
  QUICK_TIMERS_KEY,
  sounds,
  STORAGE_KEY,
  THEME_KEY,
  timerHourOptions,
  timerMinuteOptions,
} from './scheduleData'
import {
  formatAlarm,
  formatDuration,
  formatTimeFromDate,
  formatTimeWithSeconds,
  formatTimerLabel,
  getCurrentClock,
  getDayKeyFromDate,
  getDueAlarmOccurrence,
  getEmptyForm,
  getAlarmOccurrencesAround,
  getNextAlarmOccurrence,
  getNextEndTime,
  getStartTimeChange,
  getTodayKey,
  formatDateKey,
  isScheduleExcludedOnDate,
  toMinutes,
} from './timeUtils'
import type {
  ActiveAlarm,
  BackupData,
  DayKey,
  HelpKey,
  HolidayInfo,
  NotificationStatus,
  QuickTimer,
  Schedule,
  ScheduleForm,
  SoundKey,
  Theme,
  TimePickerProps,
} from './types'
import { readStoredJson, readStoredText, writeStoredJson } from './storage'
import { getMissedAlarmTitles, sortOneTimeSchedules } from './alarmUtils'
import {
  isBackupData,
  isQuickTimer,
  isSchedule,
  isString,
  normalizeExcludedDates,
  normalizeHolidayItems,
} from './scheduleValidation'

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))
const defaultFeedbackFormUrl =
  'https://docs.google.com/forms/d/e/1FAIpQLSfy18TkMly1cXauCMz6PoimxQY1HrjGk6GrUc38yanTZzz6Pg/viewform'
const feedbackFormUrl = import.meta.env.VITE_FEEDBACK_FORM_URL?.trim() || defaultFeedbackFormUrl
const siteBaseUrl = import.meta.env.BASE_URL
const currentYear = String(new Date().getFullYear())

const hasSameScheduleTime = (first: Schedule, second: Schedule) =>
  first.startTime === second.startTime &&
  first.endTime === second.endTime &&
  first.days.some((day) => second.days.includes(day))

const hasSameAlarmOccurrence = (first: Schedule, second: Schedule, holidayDates: string[]) => {
  const referenceDate = new Date()
  const firstAlarmTimes = new Set(
    getAlarmOccurrencesAround(first, referenceDate, 8, holidayDates).map(({ alarmDate }) => alarmDate.getTime()),
  )

  return getAlarmOccurrencesAround(second, referenceDate, 8, holidayDates).some(({ alarmDate }) =>
    firstAlarmTimes.has(alarmDate.getTime()),
  )
}

const getTodayExclusionLabel = (schedule: Schedule, holidayDates: string[]) => {
  const todayKey = formatDateKey(new Date())
  const exception = schedule.excludedDates.find((item) => item.date === todayKey)
  const holidayExcluded = schedule.excludeHolidays && holidayDates.includes(todayKey)
  if (!exception && !holidayExcluded) return ''
  if (exception?.reason && holidayExcluded) return `오늘 제외 · ${exception.reason} · 공휴일 제외`
  if (exception?.reason) return `오늘 제외 · ${exception.reason}`
  return holidayExcluded ? '공휴일 제외' : '오늘 제외'
}

function TimePicker({ value, onChange }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLSpanElement | null>(null)
  const [selectedHour, selectedMinute] = value.split(':')

  useEffect(() => {
    if (!open) return

    const closePicker = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', closePicker)
    return () => document.removeEventListener('mousedown', closePicker)
  }, [open])

  const changeHour = (hour: string) => {
    onChange(`${hour}:${selectedMinute}`)
  }

  const changeMinute = (minute: string) => {
    onChange(`${selectedHour}:${minute}`)
  }

  return (
    <span className="time-control" ref={pickerRef}>
      <button className="time-trigger" onClick={() => setOpen((current) => !current)} type="button">
        {value}
      </button>
      {open && (
        <div className="time-menu">
          <div className="time-column" aria-label="시">
            {hours.map((hour) => (
              <button
                className={hour === selectedHour ? 'time-option active' : 'time-option'}
                key={hour}
                onClick={() => changeHour(hour)}
                type="button"
              >
                {hour}
              </button>
            ))}
          </div>
          <div className="time-column" aria-label="분">
            {minutes.map((minute) => (
              <button
                className={minute === selectedMinute ? 'time-option active' : 'time-option'}
                key={minute}
                onClick={() => changeMinute(minute)}
                type="button"
              >
                {minute}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  )
}

function HelpButton({ target, onOpen }: { target: HelpKey; onOpen: (target: HelpKey) => void }) {
  return (
    <button
      aria-label={`${helpContent[target].title} 도움말`}
      className="help-button"
      onClick={() => onOpen(target)}
      type="button"
    >
      <HelpCircle size={16} />
    </button>
  )
}

// localStorage에 저장된 일정이 있으면 불러오고, 없으면 예시 일정을 보여줍니다.
const parseSchedulesFromStorage = (value: string): Schedule[] => {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((schedule) =>
        schedule && typeof schedule === 'object'
          ? {
              ...schedule,
              volume: typeof (schedule as Schedule).volume === 'number' ? (schedule as Schedule).volume : 70,
              excludedDates: normalizeExcludedDates((schedule as Schedule).excludedDates),
              excludeHolidays: typeof (schedule as Schedule).excludeHolidays === 'boolean'
                ? (schedule as Schedule).excludeHolidays
                : false,
              oneTimeDate: isString((schedule as Schedule).oneTimeDate)
                ? (schedule as Schedule).oneTimeDate
                : null,
              oneTimeAt: isString((schedule as Schedule).oneTimeAt)
                ? (schedule as Schedule).oneTimeAt
                : null,
            }
          : schedule,
      )
      .filter(isSchedule)
  } catch {
    return []
  }
}

const getInitialSchedules = (): Schedule[] => {
  const parsed = readStoredJson<unknown>(STORAGE_KEY, null)
  if (parsed === null) {
    return [
      {
        id: crypto.randomUUID(),
        title: '오전 일정',
        days: ['mon', 'wed', 'fri'],
        startTime: '09:00',
        endTime: '10:00',
        alarmBeforeMinutes: 1,
        sound: 'school',
        volume: 85,
        color: colors[0],
        enabled: true,
        memo: '예시',
        excludedDates: [],
        excludeHolidays: false,
        oneTimeDate: null,
        oneTimeAt: null,
      },
    ]
  }

  // Older saved schedules did not have volume, so keep them usable.
  if (!Array.isArray(parsed)) return []

  return parsed
      .map((schedule) =>
        schedule && typeof schedule === 'object'
          ? {
              ...schedule,
              volume: typeof (schedule as Schedule).volume === 'number' ? (schedule as Schedule).volume : 70,
              excludedDates: normalizeExcludedDates((schedule as Schedule).excludedDates),
              excludeHolidays: typeof (schedule as Schedule).excludeHolidays === 'boolean'
                ? (schedule as Schedule).excludeHolidays
                : false,
              oneTimeDate: isString((schedule as Schedule).oneTimeDate)
                ? (schedule as Schedule).oneTimeDate
                : null,
              oneTimeAt: isString((schedule as Schedule).oneTimeAt)
                ? (schedule as Schedule).oneTimeAt
                : null,
            }
          : schedule,
      )
      .filter(isSchedule)
}

const getInitialQuickTimers = (): QuickTimer[] => {
  const parsed = readStoredJson<unknown>(QUICK_TIMERS_KEY, null)
  return Array.isArray(parsed) && parsed.length > 0 ? parsed.filter(isQuickTimer) : defaultQuickTimers
}

function App() {
  const [schedules, setSchedules] = useState<Schedule[]>(getInitialSchedules)
  const [form, setForm] = useState<ScheduleForm>(getEmptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [exceptionDate, setExceptionDate] = useState('')
  const [exceptionReason, setExceptionReason] = useState('')
  const [holidayLoading, setHolidayLoading] = useState(false)
  const [holidayError, setHolidayError] = useState('')
  const [holidayNotice, setHolidayNotice] = useState('')
  const [exceptionModalOpen, setExceptionModalOpen] = useState(false)
  const [exceptionFormSnapshot, setExceptionFormSnapshot] = useState<ScheduleForm | null>(null)
  const [holidayItems, setHolidayItems] = useState<HolidayInfo[]>(() =>
    normalizeHolidayItems(readStoredJson<unknown>(HOLIDAY_DATES_KEY, []))
      .filter((holiday) => holiday.date.startsWith(`${currentYear}-`))
      .sort((a, b) => a.date.localeCompare(b.date)),
  )
  const holidayDates = useMemo(
    () => holidayItems.filter((holiday) => holiday.enabled).map((holiday) => holiday.date),
    [holidayItems],
  )
  const [quickTimers, setQuickTimers] = useState<QuickTimer[]>(getInitialQuickTimers)
  const [quickTimerHours, setQuickTimerHours] = useState(0)
  const [quickTimerMinutes, setQuickTimerMinutes] = useState(30)
  const [editingQuickTimerId, setEditingQuickTimerId] = useState<string | null>(null)
  const [activeHelp, setActiveHelp] = useState<HelpKey | null>(null)
  const [now, setNow] = useState(getCurrentClock())
  const [tickMs, setTickMs] = useState(0)
  const [theme, setTheme] = useState<Theme>(() =>
    readStoredText(THEME_KEY) === 'light' ? 'light' : 'dark',
  )
  const [activeAlarms, setActiveAlarms] = useState<ActiveAlarm[]>([])
  const [manualPreAlert, setManualPreAlert] = useState(false)
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [storageWarning, setStorageWarning] = useState('')
  const [pageInactive, setPageInactive] = useState(() => document.visibilityState === 'hidden')
  const [missedAlarmNotice, setMissedAlarmNotice] = useState('')
  const exceptionModalRef = useRef<HTMLElement | null>(null)
  const holidayItemsSnapshot = useRef<HolidayInfo[] | null>(null)
  const triggeredRef = useRef<Set<string>>(new Set())
  const audioContextRef = useRef<AudioContext | null>(null)
  const alarmLoopRef = useRef<number | null>(null)
  const testAlarmTimeoutRef = useRef<number | null>(null)
  const oneTimeAlarmIdsRef = useRef<Set<string>>(new Set())
  const lastAlarmCheckRef = useRef(Date.now())
  const backupInputRef = useRef<HTMLInputElement | null>(null)

  // 브라우저는 사용자가 한번 클릭/입력하기 전 자동 재생을 막을 수 있습니다.
  // 그래서 클릭/키 입력 시 AudioContext를 미리 만들어 둡니다.
  const getAudioContext = useCallback(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null

    const context = audioContextRef.current ?? new AudioContextClass()
    audioContextRef.current = context
    return context
  }, [])

  useEffect(() => {
    if (!writeStoredJson(STORAGE_KEY, schedules)) {
      setStorageWarning('브라우저 저장 공간에 기록하지 못했습니다. 백업 파일을 내려받아 보관하세요.')
    }
  }, [schedules])

  useEffect(() => {
    if (!writeStoredJson(QUICK_TIMERS_KEY, quickTimers)) {
      setStorageWarning('브라우저 저장 공간에 기록하지 못했습니다. 백업 파일을 내려받아 보관하세요.')
    }
  }, [quickTimers])

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      setStorageWarning('브라우저 저장 공간에 기록하지 못했습니다. 백업 파일을 내려받아 보관하세요.')
    }
  }, [theme])

  useEffect(() => {
    if (!writeStoredJson(HOLIDAY_DATES_KEY, holidayItems)) {
      setStorageWarning('브라우저 저장 공간에 기록하지 못했습니다. 백업 파일을 내려받아 보관하세요.')
    }
  }, [holidayItems])

  useEffect(() => {
    const handleVisibilityChange = () => setPageInactive(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        if (editingId || exceptionModalOpen || form.title.trim()) {
          setStorageWarning('다른 탭에서 일정이 변경되었습니다. 현재 편집을 끝낸 뒤 새로고침하세요.')
        } else {
          setSchedules(parseSchedulesFromStorage(event.newValue))
        }
      }
      if (event.key === QUICK_TIMERS_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as unknown
          if (Array.isArray(parsed)) setQuickTimers(parsed.filter(isQuickTimer))
        } catch {
          setStorageWarning('다른 탭의 저장 데이터를 읽지 못했습니다.')
        }
      }
      if (event.key === HOLIDAY_DATES_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as unknown
          setHolidayItems(
            normalizeHolidayItems(parsed)
              .filter((holiday) => holiday.date.startsWith(`${currentYear}-`))
              .sort((a, b) => a.date.localeCompare(b.date)),
          )
        } catch {
          setStorageWarning('다른 탭의 저장 데이터를 읽지 못했습니다.')
        }
      }
      if (event.key === THEME_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
        setTheme(event.newValue)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [editingId, exceptionModalOpen, form.title])

  useEffect(() => {
    const updateClock = () => {
      setNow(getCurrentClock())
      setTickMs(Date.now())
    }

    updateClock()
    const timerId = window.setInterval(updateClock, 1000)
    return () => window.clearInterval(timerId)
  }, [])

  useEffect(() => {
    const unlockAudio = () => {
      const context = getAudioContext()
      if (context) void context.resume()
    }

    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)
    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [getAudioContext])

  const todaySchedules = useMemo(() => {
    const today = getTodayKey()
    return schedules
      .filter((schedule) => !schedule.oneTimeDate)
      .filter((schedule) => schedule.days.includes(today))
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
  }, [schedules])

  const oneTimeSchedules = useMemo(
    () => (tickMs > 0 ? sortOneTimeSchedules(schedules, tickMs, holidayDates) : []),
    [holidayDates, schedules, tickMs],
  )

  // 남은 알람 중 가장 빨리 울릴 알람입니다. 자정 전 알람도 실제 발생 날짜 기준으로 계산합니다.
  const nextTodayAlarm = useMemo(() => {
    if (tickMs === 0) return null

    return (
      schedules
        .filter((schedule) => schedule.enabled)
        .map((schedule) => getNextAlarmOccurrence(schedule, new Date(tickMs), holidayDates))
        .filter((item) => item !== null)
        .sort((a, b) => a.alarmDate.getTime() - b.alarmDate.getTime())[0] ?? null
    )
  }, [holidayDates, schedules, tickMs])

  // 알람 10초 전이면 해당 일정 카드와 전체 배경을 깜빡이기 위해 id 목록을 만듭니다.
  const alertingScheduleIds = useMemo(() => {
    if (tickMs === 0) return new Set<string>()

    return new Set(
      schedules
        .filter((schedule) => schedule.enabled)
        .filter((schedule) => {
          const nextAlarm = getNextAlarmOccurrence(schedule, new Date(tickMs), holidayDates)
          if (!nextAlarm) return false
          const diff = nextAlarm.alarmDate.getTime() - tickMs
          return diff > 0 && diff <= 10_000
        })
        .map((schedule) => schedule.id),
    )
  }, [holidayDates, schedules, tickMs])

  const sameTimeSchedules = useMemo(() => {
    const cleanTitle = form.title.trim()
    if (!editingId && !cleanTitle) return []

    const candidate: Schedule = {
      ...form,
      id: editingId ?? 'new-schedule',
      title: cleanTitle || form.title,
    }

    return schedules.filter(
      (schedule) => schedule.id !== editingId && !schedule.oneTimeDate && hasSameScheduleTime(candidate, schedule),
    )
  }, [editingId, form, schedules])

  const conflictingAlarmSchedules = useMemo(() => {
    if ((!editingId && !form.title.trim()) || !form.enabled) return []

    const candidate: Schedule = {
      ...form,
      id: editingId ?? 'new-schedule',
      title: form.title.trim() || form.title,
    }

    return schedules.filter(
      (schedule) =>
        schedule.id !== editingId &&
        schedule.enabled &&
        hasSameAlarmOccurrence(candidate, schedule, holidayDates),
    )
  }, [editingId, form, holidayDates, schedules])

  const playSound = useCallback((sound: SoundKey, volume: number) => {
    const context = getAudioContext()
    if (!context) return
    void context.resume()

    const soundMap: Record<SoundKey, { pattern: number[]; type: OscillatorType; gap: number; duration: number }> = {
      classic: { pattern: [988, 740, 988, 740, 1175, 988], type: 'square', gap: 0.14, duration: 0.22 },
      school: { pattern: [1047, 784, 659, 784, 1047, 784], type: 'triangle', gap: 0.2, duration: 0.28 },
      soft: { pattern: [659, 784, 988, 1319, 988, 784], type: 'sine', gap: 0.22, duration: 0.3 },
      digital: { pattern: [1568, 1175, 1568, 1175, 1760, 1568, 1760], type: 'square', gap: 0.09, duration: 0.18 },
      urgent: { pattern: [1397, 932, 1397, 932, 1397, 932, 1568, 932], type: 'sawtooth', gap: 0.08, duration: 0.18 },
      chime: { pattern: [523, 784, 1047, 1568, 1047, 784], type: 'sine', gap: 0.24, duration: 0.34 },
      morning: { pattern: [587, 740, 880, 1175, 1480, 1175, 880], type: 'triangle', gap: 0.18, duration: 0.25 },
      beep: { pattern: [1800, 1800, 1200, 1800, 1800, 1200, 2100], type: 'square', gap: 0.07, duration: 0.16 },
      siren: { pattern: [700, 930, 1240, 930, 700, 930, 1240, 1568], type: 'sawtooth', gap: 0.11, duration: 0.2 },
      pulse: { pattern: [440, 1760, 440, 1760, 440, 1760, 2200], type: 'square', gap: 0.08, duration: 0.16 },
    }

    const selectedSound = soundMap[sound]
    const safeVolume = Math.min(Math.max(volume, 0), 100) / 100
    if (safeVolume === 0) return

    // Web Audio로 외부 음원 없이 알람 샘플을 합성합니다.
    selectedSound.pattern.forEach((frequency, index) => {
      const startTime = context.currentTime + index * selectedSound.gap
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.frequency.value = frequency
      oscillator.type = selectedSound.type
      gain.gain.setValueAtTime(0.0001, startTime)
      gain.gain.exponentialRampToValueAtTime(0.55 * safeVolume, startTime + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + selectedSound.duration)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(startTime)
      oscillator.stop(startTime + selectedSound.duration + 0.02)
    })
  }, [getAudioContext])

  const stopAlarm = useCallback(() => {
    if (alarmLoopRef.current !== null) {
      window.clearInterval(alarmLoopRef.current)
      alarmLoopRef.current = null
    }
    if (testAlarmTimeoutRef.current !== null) {
      window.clearTimeout(testAlarmTimeoutRef.current)
      testAlarmTimeoutRef.current = null
    }
    const completedOneTimeIds = oneTimeAlarmIdsRef.current
    if (completedOneTimeIds.size > 0) {
      setSchedules((current) => current.filter((schedule) => !completedOneTimeIds.has(schedule.id)))
      oneTimeAlarmIdsRef.current = new Set()
    }
    setManualPreAlert(false)
    setActiveAlarms([])
  }, [])

  // 같은 시각에 도래한 알람은 하나의 그룹으로 표시하고 소리는 한 번만 반복합니다.
  const fireAlarmGroup = useCallback(
    (schedulesToFire: Schedule[]) => {
      if (schedulesToFire.length === 0) return

      const alarmItems = schedulesToFire.map((schedule) => ({
        id: schedule.id,
        title: schedule.title,
        startTime: schedule.startTime,
        alarmBeforeMinutes: schedule.alarmBeforeMinutes,
        color: schedule.color,
      }))
      const firstSchedule = schedulesToFire[0]

      setActiveAlarms((current) => [
        ...current,
        ...alarmItems.filter((item) => !current.some((active) => active.id === item.id)),
      ])

      playSound(firstSchedule.sound, firstSchedule.volume)
      if (alarmLoopRef.current === null) {
        alarmLoopRef.current = window.setInterval(() => {
          playSound(firstSchedule.sound, firstSchedule.volume)
        }, 1_600)
      }

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(
          alarmItems.length > 1 ? `${alarmItems.length}개 알람` : firstSchedule.title,
          {
            body:
              alarmItems.length > 1
                ? alarmItems.map((item) => item.title).join(', ')
                : `${firstSchedule.startTime} 시작, ${firstSchedule.alarmBeforeMinutes}분 전`,
          },
        )
      }
    },
    [playSound],
  )

  useEffect(() => stopAlarm, [stopAlarm])

  const startTestAlarm = () => {
    const context = getAudioContext()
    if (context) void context.resume()

    setManualPreAlert(true)
    testAlarmTimeoutRef.current = window.setTimeout(() => {
      fireAlarmGroup([{
        id: 'test-alarm',
        title: '알람 테스트',
        days: [getTodayKey()],
        startTime: getCurrentClock().slice(0, 5),
        endTime: getCurrentClock().slice(0, 5),
        alarmBeforeMinutes: 0,
        sound: form.sound,
        volume: form.volume,
        color: form.color,
        enabled: true,
        memo: '',
        excludedDates: [],
        excludeHolidays: false,
        oneTimeDate: null,
        oneTimeAt: null,
      }])
    }, 10_000)
  }

  useEffect(() => {
    const alarmTimer = window.setInterval(() => {
      const currentDate = new Date()
      const previousCheck = lastAlarmCheckRef.current
      lastAlarmCheckRef.current = currentDate.getTime()

      if (currentDate.getTime() - previousCheck > 90_000) {
        const missedTitles = getMissedAlarmTitles(schedules, previousCheck, currentDate.getTime(), holidayDates)
        if (missedTitles.length > 0) {
          setMissedAlarmNotice(`페이지가 백그라운드에 있는 동안 놓친 알람: ${missedTitles.join(', ')}`)
        }
      }

      // 실제 시각 기준으로 검사해 10초 전 강조와 알람 시작을 맞춘다.
      const dueSchedules: Schedule[] = []

      if (triggeredRef.current.size > 500) {
        const oldKeys = [...triggeredRef.current].slice(0, 250)
        oldKeys.forEach((key) => triggeredRef.current.delete(key))
      }

      schedules.forEach((schedule) => {
        const occurrence = getDueAlarmOccurrence(schedule, currentDate, 60_000, holidayDates)
        if (!occurrence) return

        const triggerKey = `${schedule.id}-${occurrence.startDate.toISOString()}-${occurrence.alarmDate.toISOString()}`

        if (
          schedule.enabled &&
          !triggeredRef.current.has(triggerKey)
        ) {
          triggeredRef.current.add(triggerKey)
          dueSchedules.push(schedule)
        }
      })

      dueSchedules
        .filter((schedule) => schedule.oneTimeDate)
        .forEach((schedule) => oneTimeAlarmIdsRef.current.add(schedule.id))

      fireAlarmGroup(dueSchedules)
    }, 1000)

    return () => window.clearInterval(alarmTimer)
  }, [fireAlarmGroup, holidayDates, schedules])

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') return
    const permission = await Notification.requestPermission()
    setNotificationStatus(permission)
  }

  const downloadBackup = () => {
    const backup: BackupData = {
      app: 'alarm-schedule',
      version: 1,
      exportedAt: new Date().toISOString(),
      schedules,
      quickTimers,
      theme,
      holidayDates,
      holidayItems,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `alarm-schedule-backup-${date}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const uploadBackup = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown

      if (!isBackupData(parsed)) {
        window.alert('백업 파일 형식이 올바르지 않습니다.')
        return
      }

      setPendingBackup({
        ...parsed,
        schedules: parsed.schedules.map((schedule) => ({
          ...schedule,
          excludedDates: normalizeExcludedDates(schedule.excludedDates),
          excludeHolidays: typeof schedule.excludeHolidays === 'boolean' ? schedule.excludeHolidays : false,
          oneTimeDate: isString(schedule.oneTimeDate) ? schedule.oneTimeDate : null,
          oneTimeAt: isString(schedule.oneTimeAt) ? schedule.oneTimeAt : null,
        })),
        holidayDates: parsed.holidayDates ?? [],
        holidayItems: parsed.holidayItems ?? normalizeHolidayItems(parsed.holidayDates ?? []),
      })
    } catch {
      window.alert('백업 파일을 읽을 수 없습니다.')
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = ''
    }
  }

  const restorePendingBackup = () => {
    if (!pendingBackup) return

    setSchedules(pendingBackup.schedules)
    setQuickTimers(pendingBackup.quickTimers)
    setTheme(pendingBackup.theme)
    setHolidayItems(
      normalizeHolidayItems(pendingBackup.holidayItems ?? pendingBackup.holidayDates ?? [])
        .filter((holiday) => holiday.date.startsWith(`${currentYear}-`))
        .sort((a, b) => a.date.localeCompare(b.date)),
    )
    resetForm()
    cancelQuickTimerEdit()
    setPendingBackup(null)
  }

  const resetAllData = () => {
    stopAlarm()
    setSchedules([])
    setQuickTimers(defaultQuickTimers)
    setHolidayItems([])
    resetForm()
    cancelQuickTimerEdit()
    setPendingBackup(null)
    setResetConfirmOpen(false)
  }

  const resetForm = () => {
    setForm(getEmptyForm())
    setEditingId(null)
    setExceptionDate('')
    setExceptionReason('')
  }

  const addExceptionDate = () => {
    if (!exceptionDate) return
    const nextDates = [
      ...form.excludedDates.filter((item) => item.date !== exceptionDate),
      { date: exceptionDate, reason: exceptionReason.trim() },
    ].sort((a, b) => a.date.localeCompare(b.date))
    setForm((current) => ({
      ...current,
      excludedDates: nextDates,
    }))
    setExceptionDate('')
    setExceptionReason('')
  }

  const fetchHolidays = async () => {
    setHolidayLoading(true)
    setHolidayError('')
    setHolidayNotice('')
    try {
      const response = await fetch(`/api/holidays?year=${currentYear}`)
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        throw new Error('공휴일 API가 연결되지 않았습니다. 배포 환경에 HOLIDAY_API_KEY를 설정했는지 확인하세요.')
      }
      const payload = (await response.json()) as {
        error?: string
        holidays?: Array<{ date: string; name: string }>
      }
      if (!response.ok || !payload.holidays) {
        throw new Error(payload.error || '공휴일을 불러오지 못했습니다.')
      }

      const previousHolidayStates = new Map(holidayItems.map((holiday) => [holiday.date, holiday.enabled]))
      const nextHolidayItems = payload.holidays
        .map((holiday) => ({
          date: holiday.date,
          name: holiday.name,
          enabled: previousHolidayStates.get(holiday.date) ?? true,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
      setHolidayItems(nextHolidayItems)
      const enabledDates = nextHolidayItems.filter((holiday) => holiday.enabled).map((holiday) => holiday.date)
      setActiveAlarms((currentAlarms) =>
        currentAlarms.filter((alarm) => {
          const schedule = schedules.find((item) => item.id === alarm.id)
          return !schedule || !isScheduleExcludedOnDate(schedule, new Date(), enabledDates)
        }),
      )
      setHolidayNotice(`${currentYear}년 공휴일 ${payload.holidays.length}개를 저장했습니다.`)
    } catch (error) {
      setHolidayError(error instanceof Error ? error.message : '공휴일을 불러오지 못했습니다.')
    } finally {
      setHolidayLoading(false)
    }
  }

  const toggleHoliday = (date: string) => {
    setHolidayItems((current) => {
      const nextItems = current.map((item) =>
        item.date === date ? { ...item, enabled: !item.enabled } : item,
      )
      const enabledDates = nextItems.filter((item) => item.enabled).map((item) => item.date)
      setActiveAlarms((currentAlarms) =>
        currentAlarms.filter((alarm) => {
          const schedule = schedules.find((item) => item.id === alarm.id)
          return !schedule || !isScheduleExcludedOnDate(schedule, new Date(), enabledDates)
        }),
      )
      return nextItems
    })
  }

  const removeExceptionDate = (date: string) => {
    const nextDates = form.excludedDates.filter((item) => item.date !== date)
    setForm((current) => ({ ...current, excludedDates: nextDates }))
  }

  const openExceptionModal = () => {
    setExceptionFormSnapshot(form)
    holidayItemsSnapshot.current = holidayItems.map((holiday) => ({ ...holiday }))
    setExceptionModalOpen(true)
  }

  const cancelExceptionModal = useCallback(() => {
    const formChanged = exceptionFormSnapshot && JSON.stringify(form) !== JSON.stringify(exceptionFormSnapshot)
    const holidaysChanged =
      holidayItemsSnapshot.current && JSON.stringify(holidayItems) !== JSON.stringify(holidayItemsSnapshot.current)
    if ((formChanged || holidaysChanged || exceptionDate || exceptionReason) && !window.confirm('저장하지 않고 닫으시겠습니까?')) {
      return
    }
    if (exceptionFormSnapshot) setForm(exceptionFormSnapshot)
    if (holidayItemsSnapshot.current) setHolidayItems(holidayItemsSnapshot.current)
    holidayItemsSnapshot.current = null
    setExceptionFormSnapshot(null)
    setExceptionDate('')
    setExceptionReason('')
    setExceptionModalOpen(false)
  }, [exceptionDate, exceptionFormSnapshot, exceptionReason, form, holidayItems])

  const completeExceptionModal = () => {
    if (editingId) {
      setSchedules((current) =>
        current.map((schedule) =>
          schedule.id === editingId
            ? { ...schedule, excludedDates: form.excludedDates, excludeHolidays: form.excludeHolidays }
            : schedule,
        ),
      )
    }
    setExceptionFormSnapshot(null)
    holidayItemsSnapshot.current = null
    setExceptionModalOpen(false)
  }

  useEffect(() => {
    if (!exceptionModalOpen) return

    exceptionModalRef.current?.focus()
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelExceptionModal()
      if (event.key !== 'Tab' || !exceptionModalRef.current) return
      const focusable = Array.from(
        exceptionModalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [cancelExceptionModal, exceptionModalOpen])

  useEffect(() => {
    if (!activeHelp) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveHelp(null)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [activeHelp])

  const selectToday = () => {
    setForm((current) => ({ ...current, days: [getTodayKey()] }))
  }

  const changeStartTime = (startTime: string) => {
    setForm((current) => ({
      ...current,
      ...getStartTimeChange(startTime),
    }))
  }

  const changeEndTime = (endTime: string) => {
    setForm((current) => ({
      ...current,
      endTime: toMinutes(endTime) > toMinutes(current.startTime) ? endTime : getNextEndTime(current.startTime),
    }))
  }

  const resetQuickTimerForm = () => {
    setQuickTimerHours(0)
    setQuickTimerMinutes(30)
  }

  const saveQuickTimer = () => {
    const safeHours = Math.max(0, Math.floor(quickTimerHours) || 0)
    const safeRemainingMinutes = Math.min(59, Math.max(0, Math.floor(quickTimerMinutes) || 0))
    const safeMinutes = Math.max(1, safeHours * 60 + safeRemainingMinutes)

    if (editingQuickTimerId) {
      setQuickTimers((current) =>
        current.map((timer) =>
          timer.id === editingQuickTimerId ? { ...timer, minutes: safeMinutes } : timer,
        ).sort((a, b) => a.minutes - b.minutes),
      )
      setEditingQuickTimerId(null)
      resetQuickTimerForm()
      return
    }

    setQuickTimers((current) => {
      if (current.some((timer) => timer.minutes === safeMinutes)) return current
      return [...current, { id: crypto.randomUUID(), minutes: safeMinutes }].sort(
        (a, b) => a.minutes - b.minutes,
      )
    })
  }

  const editQuickTimer = (timer: QuickTimer) => {
    setQuickTimerHours(Math.floor(timer.minutes / 60))
    setQuickTimerMinutes(timer.minutes % 60)
    setEditingQuickTimerId(timer.id)
  }

  const removeQuickTimer = (id: string) => {
    setQuickTimers((current) => current.filter((timer) => timer.id !== id))
    if (editingQuickTimerId === id) {
      setEditingQuickTimerId(null)
      resetQuickTimerForm()
    }
  }

  const cancelQuickTimerEdit = () => {
    setEditingQuickTimerId(null)
    resetQuickTimerForm()
  }

  // 간편 타이머는 "현재 시각 + N분"에 알람을 바로 추가합니다.
  const addQuickTimer = (minutes: number) => {
    const nowDate = new Date()
    const targetDate = new Date(nowDate.getTime() + Math.max(1, minutes) * 60_000)

    const endDate = new Date(targetDate.getTime() + 30 * 60_000)
    const title = formatTimerLabel(minutes)

    const quickSchedule: Schedule = {
      ...getEmptyForm(),
      id: crypto.randomUUID(),
      title,
      days: [getDayKeyFromDate(targetDate)],
      startTime: formatTimeFromDate(targetDate),
      endTime: formatTimeFromDate(endDate),
      alarmBeforeMinutes: 0,
      sound: form.sound,
      volume: form.volume,
      color: form.color,
      memo: `${nowDate.toLocaleTimeString()} 생성`,
      oneTimeDate: formatDateKey(targetDate),
      oneTimeAt: targetDate.toISOString(),
    }

    if (schedules.some((schedule) => !schedule.oneTimeDate && hasSameScheduleTime(quickSchedule, schedule))) {
      window.alert('같은 요일과 시간의 일정이 이미 있습니다.')
      return
    }

    setSchedules((current) => [...current, quickSchedule])
  }

  const submitSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanTitle = form.title.trim()
    const safeForm =
      toMinutes(form.endTime) > toMinutes(form.startTime)
        ? form
        : { ...form, endTime: getNextEndTime(form.startTime) }

    if (!cleanTitle || safeForm.days.length === 0) {
      return
    }

    const nextSchedule: Schedule = {
      ...safeForm,
      id: editingId ?? 'new-schedule',
      title: cleanTitle,
    }

    if (
      schedules.some(
        (schedule) =>
          schedule.id !== editingId && !schedule.oneTimeDate && hasSameScheduleTime(nextSchedule, schedule),
      )
    ) {
      window.alert('같은 요일과 시간의 일정이 이미 있습니다.')
      return
    }

    if (editingId) {
      setSchedules((current) =>
        current.map((schedule) =>
          schedule.id === editingId ? { ...nextSchedule, id: editingId } : schedule,
        ),
      )
    } else {
      setSchedules((current) => [...current, { ...nextSchedule, id: crypto.randomUUID() }])
    }

    resetForm()
  }

  const editSchedule = (schedule: Schedule) => {
    setForm({
      title: schedule.title,
      days: schedule.days,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      alarmBeforeMinutes: schedule.alarmBeforeMinutes,
      sound: schedule.sound,
      volume: schedule.volume,
      color: schedule.color,
      enabled: schedule.enabled,
      memo: schedule.memo,
      excludedDates: normalizeExcludedDates(schedule.excludedDates),
      excludeHolidays: schedule.excludeHolidays,
      oneTimeDate: schedule.oneTimeDate,
      oneTimeAt: schedule.oneTimeAt,
    })
    setEditingId(schedule.id)
    setExceptionDate('')
    setExceptionReason('')
  }

  const removeSchedule = (id: string) => {
    setSchedules((current) => current.filter((schedule) => schedule.id !== id))
  }

  const toggleDay = (day: DayKey) => {
    setForm((current) => {
      const hasDay = current.days.includes(day)
      return {
        ...current,
        days: hasDay ? current.days.filter((item) => item !== day) : [...current.days, day],
      }
    })
  }

  const toggleEnabled = (id: string) => {
    setSchedules((current) =>
      current.map((schedule) =>
        schedule.id === id ? { ...schedule, enabled: !schedule.enabled } : schedule,
      ),
    )
  }

  return (
    <main
      className={[
        'app',
        theme,
        alertingScheduleIds.size > 0 ? 'pre-alarm' : '',
        manualPreAlert ? 'pre-alarm' : '',
        activeAlarms.length > 0 ? 'alarm-ringing' : '',
      ].join(' ')}
    >
      <section className="topbar">
        <div>
          <p className="eyebrow">Alarm Schedule</p>
          <h1>알람 스케줄표</h1>
        </div>
        <div className="clock" aria-label="현재 시간">
          {now}
        </div>
        <div className="topbar-controls">
          {feedbackFormUrl ? (
            <a className="feedback-link" href={feedbackFormUrl} rel="noopener noreferrer" target="_blank">
              문의
            </a>
          ) : (
            <button className="feedback-link disabled" disabled type="button">
              문의
            </button>
          )}
          <button
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            type="button"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? '라이트' : '다크'}
          </button>
        </div>
      </section>

      {storageWarning && (
        <div className="app-notice warning-notice" role="alert">
          <span>{storageWarning}</span>
          <button className="icon-only secondary" aria-label="저장 안내 닫기" onClick={() => setStorageWarning('')} type="button">
            <X size={16} />
          </button>
        </div>
      )}

      {pageInactive && (
        <div className="app-notice inactive-notice" role="status">
          이 페이지가 백그라운드에 있습니다. 브라우저 정책에 따라 알람이 지연되거나 누락될 수 있습니다.
        </div>
      )}

      {missedAlarmNotice && (
        <div className="app-notice missed-notice" role="alert">
          <span>{missedAlarmNotice}</span>
          <button className="icon-only secondary" aria-label="놓친 알람 안내 닫기" onClick={() => setMissedAlarmNotice('')} type="button">
            <X size={16} />
          </button>
        </div>
      )}

      {nextTodayAlarm && (
        <section className="next-alarm">
          <span>가장 가까운 알람</span>
          <strong>{nextTodayAlarm.schedule.title}</strong>
          <small className="next-alarm-type">
            {nextTodayAlarm.schedule.oneTimeDate ? '1회성 타이머' : '반복 일정'}
          </small>
          <span>
            {formatAlarm(nextTodayAlarm.schedule.startTime, nextTodayAlarm.schedule.alarmBeforeMinutes)}
          </span>
          <b>{formatDuration(nextTodayAlarm.alarmDate.getTime() - tickMs)} 남음</b>
        </section>
      )}

      {activeAlarms.length > 0 && (
        <section className="alarm-banner" style={{ borderColor: activeAlarms[0].color }}>
          <div>
            <strong>{activeAlarms.length > 1 ? `${activeAlarms.length}개 알람` : activeAlarms[0].title}</strong>
            {activeAlarms.map((alarm) => (
              <span key={alarm.id}>
                {alarm.title} · {alarm.startTime} 시작, {alarm.alarmBeforeMinutes}분 전
              </span>
            ))}
          </div>
          <button className="stop-alarm" onClick={stopAlarm} type="button">
            <CircleStop size={20} />
            알람 멈춤
          </button>
        </section>
      )}

      <section className="workspace">
        <aside className="ad-slot ad-slot-editor-top" aria-label="광고">
          <span>광고</span>
          <strong>728 x 90</strong>
        </aside>

        <form className="editor" onSubmit={submitSchedule}>
          <div className="section-title">
            <CalendarDays size={20} />
            <h2>{editingId ? '일정 편집' : '일정 추가'}</h2>
            <HelpButton target="schedule" onOpen={setActiveHelp} />
          </div>

          <div className="title-days-row">
            <label className="title-field">
              일정명
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="예: 회의"
                required
              />
            </label>

            <div className="day-field">
              <span className="label-text">
                요일
                <HelpButton target="days" onOpen={setActiveHelp} />
              </span>
              <div className="day-controls">
                <div className="day-grid" aria-label="요일 선택">
                  {days.map((day) => (
                    <button
                      className={form.days.includes(day.key) ? 'day active' : 'day'}
                      key={day.key}
                      onClick={() => toggleDay(day.key)}
                      type="button"
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                <button className="secondary today-button" onClick={selectToday} type="button">
                  오늘
                </button>
              </div>
            </div>
          </div>

          <div className="time-volume-row">
            <label>
              <span className="label-text">
                시작
                <HelpButton target="time" onOpen={setActiveHelp} />
              </span>
              <TimePicker value={form.startTime} onChange={changeStartTime} />
            </label>
            <label>
              종료
              <TimePicker value={form.endTime} onChange={changeEndTime} />
            </label>
            <label>
              볼륨 {form.volume}%
              <input
                max="100"
                min="0"
                onChange={(event) => setForm({ ...form, volume: Number(event.target.value) })}
                step="5"
                type="range"
                value={form.volume}
              />
            </label>
          </div>

          {sameTimeSchedules.length > 0 && (
            <div className="same-time-block" role="alert">
              <strong>동일 시간 등록 불가</strong>
              <span>
                {sameTimeSchedules.slice(0, 3).map((schedule) => schedule.title).join(', ')}
                {sameTimeSchedules.length > 3 ? ` 외 ${sameTimeSchedules.length - 3}개` : ''}
                과 요일, 시작 시간, 종료 시간이 같습니다.
              </span>
            </div>
          )}

          {conflictingAlarmSchedules.length > 0 && (
            <div className="alarm-conflict-block" role="status">
              <strong>실제 알람 시간이 겹칩니다</strong>
              <span>
                {conflictingAlarmSchedules.slice(0, 3).map((schedule) => schedule.title).join(', ')}
                {conflictingAlarmSchedules.length > 3
                  ? ` 외 ${conflictingAlarmSchedules.length - 3}개`
                  : ''}
                과 같은 시각에 알람이 울릴 수 있습니다. 저장은 가능합니다.
              </span>
            </div>
          )}

          <div className="memo-settings-row">
            <label>
              메모
              <textarea
                value={form.memo}
                onChange={(event) => setForm({ ...form, memo: event.target.value })}
                rows={3}
              />
            </label>

            <div className="settings-stack">
              <label className="toggle">
                <input
                  checked={form.enabled}
                  onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                  type="checkbox"
                />
                알람 사용
              </label>

              <div>
                <span className="label-text">색상</span>
                <div className="swatches">
                  {colors.map((color) => (
                    <button
                      aria-label={color}
                      className={form.color === color ? 'swatch active' : 'swatch'}
                      key={color}
                      onClick={() => setForm({ ...form, color })}
                      style={{ backgroundColor: color }}
                      type="button"
                    />
                  ))}
                </div>
              </div>

              <button className="secondary exception-button" onClick={openExceptionModal} type="button">
                일정 예외 설정
                {(form.excludedDates.length > 0 || form.excludeHolidays) && ' · 설정됨'}
              </button>
            </div>
          </div>

          <div className="alarm-action-row">
            <label>
              <span className="label-text">
                알람 전
                <HelpButton target="alarm" onOpen={setActiveHelp} />
              </span>
              <input
                min="0"
                max="120"
                type="number"
                value={form.alarmBeforeMinutes}
                onChange={(event) =>
                  setForm({ ...form, alarmBeforeMinutes: Number(event.target.value) })
                }
              />
            </label>
            <label>
              소리
              <select
                value={form.sound}
                onChange={(event) => setForm({ ...form, sound: event.target.value as SoundKey })}
              >
                {sounds.map((sound) => (
                  <option key={sound.key} value={sound.key}>
                    {sound.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="actions">
              <button className="primary" type="submit">
                {editingId ? <Check size={18} /> : <Plus size={18} />}
                {editingId ? '저장' : '추가'}
              </button>
              {editingId && (
                <button className="secondary" onClick={resetForm} type="button">
                  <X size={18} />
                  취소
                </button>
              )}
              <button
                className="secondary"
                onClick={() => playSound(form.sound, form.volume)}
                type="button"
              >
                <Play size={18} />
                듣기
              </button>
              <button className="secondary" onClick={startTestAlarm} type="button">
                10초 후 알람 테스트
              </button>
            </div>
          </div>
        </form>

        <section className="panel quick-timers">
          <div className="timer-header">
            <span className="label-text">
              사용자 설정 타이머
              <HelpButton target="timer" onOpen={setActiveHelp} />
            </span>
          </div>
          <div className="timer-editor">
            <label className="timer-input-label">
              <select
                aria-label="타이머 시간"
                value={quickTimerHours}
                onChange={(event) => setQuickTimerHours(Number(event.target.value))}
              >
                {timerHourOptions.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </select>
              <span>시간</span>
            </label>
            <label className="timer-input-label">
              <select
                aria-label="타이머 분"
                value={quickTimerMinutes}
                onChange={(event) => setQuickTimerMinutes(Number(event.target.value))}
              >
                {timerMinuteOptions.map((minute) => (
                  <option key={minute} value={minute}>
                    {minute}
                  </option>
                ))}
              </select>
              <span>분 후</span>
            </label>
            <button className="primary" onClick={saveQuickTimer} type="button">
              {editingQuickTimerId ? <Check size={18} /> : <Plus size={18} />}
              {editingQuickTimerId ? '저장' : '추가'}
            </button>
            {editingQuickTimerId && (
              <button className="secondary icon-only" onClick={cancelQuickTimerEdit} type="button">
                <X size={18} />
              </button>
            )}
          </div>
          <div className="timer-buttons">
            {quickTimers.map((timer) => (
              <div className="timer-item" key={timer.id}>
                <button
                  className="secondary timer-run"
                  onClick={() => addQuickTimer(timer.minutes)}
                  type="button"
                >
                  {formatTimerLabel(timer.minutes)}
                </button>
                <button
                  aria-label={`${formatTimerLabel(timer.minutes)} 수정`}
                  className="icon-only secondary"
                  onClick={() => editQuickTimer(timer)}
                  type="button"
                >
                  <Pencil size={16} />
                </button>
                <button
                  aria-label={`${formatTimerLabel(timer.minutes)} 삭제`}
                  className="icon-only danger"
                  onClick={() => removeQuickTimer(timer.id)}
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="active-timer-section">
            <div className="active-timer-header">
              <span>실행 대기 중인 타이머</span>
              <strong>{oneTimeSchedules.length}</strong>
            </div>
            {oneTimeSchedules.length > 0 ? (
              <div className="active-timer-list">
                {oneTimeSchedules.map(({ schedule, nextAlarm }) => {
                  const isRinging = activeAlarms.some((alarm) => alarm.id === schedule.id)
                  const isPreAlarm = alertingScheduleIds.has(schedule.id)
                  const oneTimeAt = schedule.oneTimeAt ? new Date(schedule.oneTimeAt) : null
                  const startLabel = oneTimeAt && !Number.isNaN(oneTimeAt.getTime())
                    ? formatTimeWithSeconds(oneTimeAt)
                    : schedule.startTime
                  return (
                    <article
                      className={[
                        'active-timer-card',
                        isPreAlarm ? 'pre-alarm-card' : '',
                        isRinging ? 'alarm-card' : '',
                      ].join(' ')}
                      key={schedule.id}
                      style={{ borderColor: schedule.color }}
                    >
                      <strong>{schedule.title}</strong>
                      <span>
                        {startLabel} 실행
                      </span>
                      <small>
                        {isRinging
                          ? '알람 진행 중'
                          : nextAlarm
                            ? `${formatTimeFromDate(nextAlarm.alarmDate)} · ${formatDuration(nextAlarm.alarmDate.getTime() - tickMs)} 남음`
                            : '실행 예정'}
                      </small>
                      <button
                        aria-label={`${schedule.title} 타이머 취소`}
                        className="icon-only danger"
                        onClick={() => removeSchedule(schedule.id)}
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </article>
                  )
                })}
              </div>
            ) : (
              <p className="active-timer-empty">타이머 버튼을 누르면 이곳에 실행 대기 일정이 표시됩니다.</p>
            )}
          </div>
        </section>

        <section className="panel schedule-panel">
          <div className="section-title">
            <BellRing size={20} />
            <h2>주간표</h2>
            <HelpButton target="week" onOpen={setActiveHelp} />
          </div>

          <div className="week-grid">
            {days.map((day) => (
              <div className="day-column" key={day.key}>
                <div className="day-heading">{day.label}</div>
                <div className="day-list">
                  {schedules
                    .filter((schedule) => !schedule.oneTimeDate)
                    .filter((schedule) => schedule.days.includes(day.key))
                    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
                    .map((schedule) => (
                      <article
                        className={[
                          'schedule-item',
                          schedule.enabled ? '' : 'disabled',
                          isScheduleExcludedOnDate(schedule, new Date(), holidayDates) ? 'excluded-today' : '',
                          alertingScheduleIds.has(schedule.id) ? 'pre-alert' : '',
                          activeAlarms.some((alarm) => alarm.id === schedule.id) ? 'alarm-alert' : '',
                        ].join(' ')}
                        key={`${day.key}-${schedule.id}`}
                        style={{ borderColor: schedule.color }}
                      >
                        <strong>{schedule.title}</strong>
                        <span>
                          {schedule.startTime}-{schedule.endTime}
                        </span>
                        <small>{formatAlarm(schedule.startTime, schedule.alarmBeforeMinutes)} 알람</small>
                        {isScheduleExcludedOnDate(schedule, new Date(), holidayDates) && (
                          <small className="schedule-exception-label">{getTodayExclusionLabel(schedule, holidayDates)}</small>
                        )}
                      </article>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <div className="today-list">
            <h3>오늘</h3>
            {todaySchedules.length === 0 ? (
              <p className="empty">등록된 일정 없음</p>
            ) : (
              todaySchedules.map((schedule) => (
                <div className="today-row" key={schedule.id}>
                  <span className="dot" style={{ backgroundColor: schedule.color }} />
                  <strong>{schedule.title}</strong>
                  <span>{schedule.startTime}</span>
                  <span>{formatAlarm(schedule.startTime, schedule.alarmBeforeMinutes)} 알람</span>
                  {isScheduleExcludedOnDate(schedule, new Date(), holidayDates) && (
                    <small className="schedule-exception-label">{getTodayExclusionLabel(schedule, holidayDates)}</small>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

      </section>

      <aside className="ad-slot" aria-label="광고">
        <span>광고</span>
        <strong>728 x 90</strong>
      </aside>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="section-title">
            <Bell size={20} />
            <h2>알람 목록</h2>
            <HelpButton target="list" onOpen={setActiveHelp} />
          </div>
          <div className="backup-actions">
            <button className="secondary" onClick={downloadBackup} type="button">
              백업 다운로드
            </button>
            <button
              className="secondary"
              onClick={() => backupInputRef.current?.click()}
              type="button"
            >
              백업 불러오기
            </button>
            <input
              accept="application/json"
              className="backup-input"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadBackup(file)
              }}
              ref={backupInputRef}
              type="file"
            />
            <span className={`notification-status ${notificationStatus}`}>
              브라우저 알림: {notificationLabels[notificationStatus]}
            </span>
            {notificationStatus === 'default' && (
              <button className="secondary" onClick={requestNotifications} type="button">
                브라우저 알림 켜기
              </button>
            )}
            {notificationStatus === 'denied' && (
              <span className="notification-hint">브라우저 설정에서 변경 필요</span>
            )}
            <button className="danger" onClick={() => setResetConfirmOpen(true)} type="button">
              전체 초기화
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>상태</th>
                <th>일정</th>
                <th>요일</th>
                <th>시간</th>
                <th>알람</th>
                <th>볼륨</th>
                <th>메모</th>
                <th>편집</th>
              </tr>
            </thead>
            <tbody>
              {schedules.filter((schedule) => !schedule.oneTimeDate).map((schedule) => (
                <tr key={schedule.id}>
                  <td>
                    <button
                      className={schedule.enabled ? 'status enabled' : 'status'}
                      onClick={() => toggleEnabled(schedule.id)}
                      type="button"
                    >
                      {schedule.enabled ? 'ON' : 'OFF'}
                    </button>
                  </td>
                  <td>
                    <span className="name-cell">
                      <span className="dot" style={{ backgroundColor: schedule.color }} />
                      {schedule.title}
                    </span>
                  </td>
                  <td>
                    {days
                      .filter((day) => schedule.days.includes(day.key))
                      .map((day) => day.label)
                      .join(', ')}
                  </td>
                  <td>
                    {schedule.startTime}-{schedule.endTime}
                  </td>
                  <td>{formatAlarm(schedule.startTime, schedule.alarmBeforeMinutes)}</td>
                  <td>{schedule.volume}%</td>
                  <td>{schedule.memo || '-'}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        aria-label={`${schedule.title} 편집`}
                        className="icon-only secondary"
                        onClick={() => editSchedule(schedule)}
                        type="button"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        aria-label={`${schedule.title} 삭제`}
                        className="icon-only danger"
                        onClick={() => removeSchedule(schedule.id)}
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="site-footer">
        <div>
          <h2>사용법</h2>
          <p>
            <a href={`${siteBaseUrl}guide/how-to-use/index.html`}>사용방법</a>
          </p>
        </div>
        <div>
          <h2>도움말</h2>
          <p>
            <a href={`${siteBaseUrl}guide/browser-alarm/index.html`}>브라우저 알람 주의사항</a><br />
            <a href={`${siteBaseUrl}faq/index.html`}>자주 묻는 질문</a>
          </p>
        </div>
      </footer>

      {exceptionModalOpen && (
        <div className="help-overlay" role="presentation" onClick={cancelExceptionModal}>
          <section
            aria-modal="true"
            aria-labelledby="exception-modal-title"
            className="help-modal exception-modal"
            role="dialog"
            ref={exceptionModalRef}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="help-modal-header">
              <h2 id="exception-modal-title">일정 예외 설정</h2>
              <button
                aria-label="일정 예외 설정 닫기"
                className="icon-only secondary"
                onClick={cancelExceptionModal}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <p>이 일정에만 적용할 제외 날짜와 공휴일 제외 여부를 설정합니다.</p>

            <div className="exception-editor">
              <span className="label-text">이 일정에서 제외할 날짜</span>
              <div className="exception-input-row">
                <input
                  aria-label="이 일정에서 제외할 날짜"
                  onChange={(event) => setExceptionDate(event.target.value)}
                  type="date"
                  value={exceptionDate}
                />
                <input
                  aria-label="제외 사유"
                  onChange={(event) => setExceptionReason(event.target.value)}
                  placeholder="제외 사유 (선택)"
                  type="text"
                  value={exceptionReason}
                />
                <button className="secondary" onClick={addExceptionDate} type="button">
                  추가
                </button>
              </div>
              {form.excludedDates.length > 0 ? (
                <div className="exception-list">
                  {form.excludedDates.map((item) => (
                    <span className="exception-chip exception-date-chip" key={item.date}>
                      <span>
                        {item.date}
                        {item.reason && <small>{item.reason}</small>}
                      </span>
                      <button
                        aria-label={`${item.date} 제외 취소`}
                        onClick={() => removeExceptionDate(item.date)}
                        type="button"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <small>등록된 제외 날짜가 없습니다.</small>
              )}
            </div>

            <label className="toggle exception-holiday-toggle">
              <input
                checked={form.excludeHolidays}
                onChange={(event) => {
                  const excludeHolidays = event.target.checked
                  setForm((current) => ({ ...current, excludeHolidays }))
                }}
                type="checkbox"
              />
              선택한 공휴일 제외
            </label>

            <div className="exception-editor holiday-editor">
              <div className="exception-input-row">
                <strong>{currentYear}년 공휴일</strong>
                <button className="secondary" disabled={holidayLoading} onClick={fetchHolidays} type="button">
                  {holidayLoading ? '불러오는 중…' : '자동 불러오기'}
                </button>
              </div>
              {holidayError && <small role="alert">{holidayError}</small>}
              {holidayNotice && <small role="status">{holidayNotice}</small>}
              <div className="exception-status" role="status">
                공휴일 {holidayItems.length}개 불러옴 · 선택된 공휴일 {holidayDates.length}개 · 이 일정의 공휴일 제외:{' '}
                {form.excludeHolidays ? '적용 중' : '미적용'}
              </div>
              <small className="holiday-help">색상 버튼을 눌러 제외할 공휴일을 선택하세요. 파란색은 적용, 회색은 미적용입니다.</small>
              {holidayItems.length > 0 ? (
                <div className="exception-list">
                  {holidayItems.map((holiday) => (
                    <button
                      className={holiday.enabled ? 'holiday-chip enabled' : 'holiday-chip'}
                      key={holiday.date}
                      onClick={() => toggleHoliday(holiday.date)}
                      aria-pressed={holiday.enabled}
                      title={holiday.name || holiday.date}
                      type="button"
                    >
                      <span>{holiday.date}</span>
                      <small>{holiday.name || '공휴일'}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <small>자동 불러오기로 올해 공휴일을 가져오세요.</small>
              )}
            </div>
            <div className="modal-actions">
              <button className="primary" onClick={completeExceptionModal} type="button">
                설정 완료
              </button>
            </div>
          </section>
        </div>
      )}

      {activeHelp && (
        <div className="help-overlay" role="presentation" onClick={() => setActiveHelp(null)}>
          <section
            aria-modal="true"
            className="help-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="help-modal-header">
              <h2>{helpContent[activeHelp].title}</h2>
              <button
                aria-label="도움말 닫기"
                className="icon-only secondary"
                onClick={() => setActiveHelp(null)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <p>{helpContent[activeHelp].body}</p>
          </section>
        </div>
      )}

      {pendingBackup && (
        <div className="help-overlay" role="presentation" onClick={() => setPendingBackup(null)}>
          <section
            aria-modal="true"
            className="help-modal backup-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="help-modal-header">
              <h2>백업 불러오기 주의사항</h2>
              <button
                aria-label="백업 불러오기 취소"
                className="icon-only secondary"
                onClick={() => setPendingBackup(null)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <p>
              백업을 불러오면 현재 저장된 일정, 사용자 설정 타이머, 테마가 백업 파일 내용으로
              덮어써집니다. 현재 내용은 되돌릴 수 없습니다.
            </p>
            <dl className="backup-summary">
              <div>
                <dt>일정</dt>
                <dd>{pendingBackup.schedules.length}개</dd>
              </div>
              <div>
                <dt>사용자 설정 타이머</dt>
                <dd>{pendingBackup.quickTimers.length}개</dd>
              </div>
              <div>
                <dt>내보낸 날짜</dt>
                <dd>{new Date(pendingBackup.exportedAt).toLocaleString()}</dd>
              </div>
            </dl>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setPendingBackup(null)} type="button">
                취소
              </button>
              <button className="danger" onClick={restorePendingBackup} type="button">
                덮어쓰기
              </button>
            </div>
          </section>
        </div>
      )}

      {resetConfirmOpen && (
        <div className="help-overlay" role="presentation" onClick={() => setResetConfirmOpen(false)}>
          <section
            aria-modal="true"
            className="help-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="help-modal-header">
              <h2>전체 초기화</h2>
              <button
                aria-label="전체 초기화 취소"
                className="icon-only secondary"
                onClick={() => setResetConfirmOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <p>저장된 일정과 사용자 설정 타이머가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setResetConfirmOpen(false)} type="button">
                취소
              </button>
              <button className="danger" onClick={resetAllData} type="button">
                초기화
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
