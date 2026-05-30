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

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
type SoundKey = 'classic' | 'school' | 'soft' | 'digital' | 'urgent' | 'chime' | 'morning' | 'beep'
type Theme = 'light' | 'dark'

type Schedule = {
  id: string
  title: string
  days: DayKey[]
  startTime: string
  endTime: string
  alarmBeforeMinutes: number
  sound: SoundKey
  volume: number
  color: string
  enabled: boolean
  memo: string
}

type ScheduleForm = Omit<Schedule, 'id'>
type ActiveAlarm = Pick<Schedule, 'id' | 'title' | 'startTime' | 'alarmBeforeMinutes' | 'color'>
type TimePickerProps = {
  value: string
  onChange: (time: string) => void
}
type QuickTimer = {
  id: string
  minutes: number
}
type HelpKey = 'schedule' | 'days' | 'time' | 'alarm' | 'timer'

const helpContent: Record<HelpKey, { title: string; body: string }> = {
  schedule: {
    title: '일정 기본 정보',
    body: '일정명, 메모, 색상은 목록과 주간표에서 일정을 구분하기 위한 정보입니다. 알람 사용을 끄면 해당 일정은 저장만 되고 울리지 않습니다.',
  },
  days: {
    title: '요일 선택',
    body: '선택한 요일에만 일정 알람이 동작합니다. 오늘 버튼은 현재 날짜의 요일만 빠르게 선택합니다.',
  },
  time: {
    title: '시작/종료/볼륨',
    body: '시작 시간을 바꾸면 종료 시간은 자동으로 1시간 뒤로 맞춰집니다. 볼륨은 알람 소리 크기에 적용됩니다.',
  },
  alarm: {
    title: '알람 설정',
    body: '알람 전 값은 시작 시간보다 몇 분 먼저 울릴지 정합니다. 소리는 듣기 버튼으로 미리 확인할 수 있습니다.',
  },
  timer: {
    title: '사용자 설정 타이머',
    body: '요일과 무관하게 현재 시각 기준으로 몇 시간 몇 분 뒤 알람을 바로 추가합니다. 만든 타이머는 수정하거나 삭제할 수 있습니다.',
  },
}

// 브라우저 저장소 키입니다. 새로고침해도 일정과 테마가 유지됩니다.
const STORAGE_KEY = 'alarm-schedule-items'
const THEME_KEY = 'alarm-schedule-theme'
const QUICK_TIMERS_KEY = 'alarm-schedule-quick-timers'

const days: Array<{ key: DayKey; label: string }> = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
]

const sounds: Array<{ key: SoundKey; label: string }> = [
  { key: 'classic', label: '기본' },
  { key: 'school', label: '학교종' },
  { key: 'soft', label: '부드럽게' },
  { key: 'digital', label: '디지털' },
  { key: 'urgent', label: '긴급' },
  { key: 'chime', label: '차임' },
  { key: 'morning', label: '아침' },
  { key: 'beep', label: '비프' },
]

const colors = [
  '#dc2626',
  '#ea580c',
  '#f59e0b',
  '#eab308',
  '#22c55e',
  '#059669',
  '#14b8a6',
  '#0891b2',
  '#2563eb',
  '#4f46e5',
  '#7c3aed',
  '#db2777',
]

const defaultQuickTimers: QuickTimer[] = [
  { id: 'quick-30', minutes: 30 },
  { id: 'quick-60', minutes: 60 },
  { id: 'quick-120', minutes: 120 },
  { id: 'quick-180', minutes: 180 },
]

const timerHourOptions = Array.from({ length: 12 }, (_, index) => index)
const timerMinuteOptions = Array.from({ length: 60 }, (_, index) => index)

const getEmptyForm = (): ScheduleForm => ({
  title: '',
  days: [getTodayKey()],
  startTime: '09:00',
  endTime: '10:00',
  alarmBeforeMinutes: 1,
  sound: 'classic',
  volume: 70,
  color: colors[0],
  enabled: true,
  memo: '',
})

const toMinutes = (time: string) => {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

const toTimeString = (totalMinutes: number) => {
  const normalizedMinutes = (totalMinutes + 1440) % 1440
  const hour = Math.floor(normalizedMinutes / 60)
  const minute = normalizedMinutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const getNextEndTime = (startTime: string) => toTimeString(toMinutes(startTime) + 60)

// 시작 시간이 바뀌면 종료 시간을 항상 시작 + 1시간으로 맞춥니다.
// 예: 00:04 시작 -> 01:04 종료, 23:30 시작 -> 00:30 종료.
const getStartTimeChange = (startTime: string) => ({
  startTime,
  endTime: getNextEndTime(startTime),
})

const formatAlarm = (time: string, before: number) => {
  const total = (toMinutes(time) - before + 1440) % 1440
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// 일정의 "알람이 울릴 실제 날짜/시간"을 오늘 날짜 기준 Date로 바꿉니다.
const getAlarmDate = (schedule: Schedule) => {
  const [hour, minute] = formatAlarm(schedule.startTime, schedule.alarmBeforeMinutes)
    .split(':')
    .map(Number)
  const alarmDate = new Date()
  alarmDate.setHours(hour, minute, 0, 0)
  return alarmDate
}

function getTodayKey() {
  const keyByDay: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return keyByDay[new Date().getDay()]
}

const getDayKeyFromDate = (date: Date) => {
  const keyByDay: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return keyByDay[date.getDay()]
}

const getCurrentClock = () => {
  const now = new Date()
  return [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join(':')
}

const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}시간 ${minutes}분 ${seconds}초`
  }

  return `${minutes}분 ${seconds}초`
}

const formatTimeFromDate = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

const formatTimerLabel = (minutes: number) => {
  if (minutes < 60) return `${minutes}분 후`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0
    ? `${hours}시간 후`
    : `${hours}시간 ${remainingMinutes}분 후`
}

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))

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
const getInitialSchedules = (): Schedule[] => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) {
    return [
      {
        id: crypto.randomUUID(),
        title: '오전 일정',
        days: ['mon', 'wed', 'fri'],
        startTime: '09:00',
        endTime: '10:00',
        alarmBeforeMinutes: 1,
        sound: 'school',
        volume: 70,
        color: colors[0],
        enabled: true,
        memo: '예시',
      },
    ]
  }

  try {
    const parsed = JSON.parse(saved) as Schedule[]
    // Older saved schedules did not have volume, so keep them usable.
    return Array.isArray(parsed)
      ? parsed.map((schedule) => ({
          ...schedule,
          volume: typeof schedule.volume === 'number' ? schedule.volume : 70,
        }))
      : []
  } catch {
    return []
  }
}

const getInitialQuickTimers = (): QuickTimer[] => {
  const saved = localStorage.getItem(QUICK_TIMERS_KEY)
  if (!saved) return defaultQuickTimers

  try {
    const parsed = JSON.parse(saved) as QuickTimer[]
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed.filter((timer) => typeof timer.minutes === 'number' && timer.minutes > 0)
      : defaultQuickTimers
  } catch {
    return defaultQuickTimers
  }
}

function App() {
  const [schedules, setSchedules] = useState<Schedule[]>(getInitialSchedules)
  const [form, setForm] = useState<ScheduleForm>(getEmptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [quickTimers, setQuickTimers] = useState<QuickTimer[]>(getInitialQuickTimers)
  const [quickTimerHours, setQuickTimerHours] = useState(0)
  const [quickTimerMinutes, setQuickTimerMinutes] = useState(30)
  const [editingQuickTimerId, setEditingQuickTimerId] = useState<string | null>(null)
  const [activeHelp, setActiveHelp] = useState<HelpKey | null>(null)
  const [now, setNow] = useState(getCurrentClock())
  const [tickMs, setTickMs] = useState(0)
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark',
  )
  const [activeAlarm, setActiveAlarm] = useState<ActiveAlarm | null>(null)
  const [manualPreAlert, setManualPreAlert] = useState(false)
  const [notificationStatus, setNotificationStatus] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const triggeredRef = useRef<Set<string>>(new Set())
  const audioContextRef = useRef<AudioContext | null>(null)
  const alarmLoopRef = useRef<number | null>(null)
  const testAlarmTimeoutRef = useRef<number | null>(null)

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules))
  }, [schedules])

  useEffect(() => {
    localStorage.setItem(QUICK_TIMERS_KEY, JSON.stringify(quickTimers))
  }, [quickTimers])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

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
      .filter((schedule) => schedule.days.includes(today))
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
  }, [schedules])

  // 오늘 남은 알람 중 가장 빨리 울릴 알람입니다. 없으면 null이라 화면에 표시하지 않습니다.
  const nextTodayAlarm = useMemo(() => {
    if (tickMs === 0) return null

    const currentDay = getTodayKey()

    return (
      schedules
        .filter((schedule) => schedule.enabled && schedule.days.includes(currentDay))
        .map((schedule) => ({
          schedule,
          alarmTime: getAlarmDate(schedule).getTime(),
        }))
        .filter((item) => item.alarmTime > tickMs)
        .sort((a, b) => a.alarmTime - b.alarmTime)[0] ?? null
    )
  }, [schedules, tickMs])

  // 알람 10초 전이면 해당 일정 카드와 전체 배경을 깜빡이기 위해 id 목록을 만듭니다.
  const alertingScheduleIds = useMemo(() => {
    if (tickMs === 0) return new Set<string>()

    const currentDay = getTodayKey()

    return new Set(
      schedules
        .filter((schedule) => schedule.enabled && schedule.days.includes(currentDay))
        .filter((schedule) => {
          const diff = getAlarmDate(schedule).getTime() - tickMs
          return diff > 0 && diff <= 10_000
        })
        .map((schedule) => schedule.id),
    )
  }, [schedules, tickMs])

  const playSound = useCallback((sound: SoundKey, volume: number) => {
    const context = getAudioContext()
    if (!context) return
    void context.resume()

    const soundMap: Record<SoundKey, { pattern: number[]; type: OscillatorType; gap: number }> = {
      classic: { pattern: [988, 740, 988, 740, 1175], type: 'square', gap: 0.16 },
      school: { pattern: [1047, 784, 659, 784, 1047, 784], type: 'triangle', gap: 0.22 },
      soft: { pattern: [659, 784, 988, 1319, 988], type: 'sine', gap: 0.24 },
      digital: { pattern: [1568, 1175, 1568, 1175, 1760, 1568], type: 'square', gap: 0.11 },
      urgent: { pattern: [1397, 932, 1397, 932, 1397, 932, 1568], type: 'sawtooth', gap: 0.1 },
      chime: { pattern: [523, 784, 1047, 1568, 1047, 784], type: 'sine', gap: 0.28 },
      morning: { pattern: [587, 740, 880, 1175, 1480, 1175], type: 'triangle', gap: 0.2 },
      beep: { pattern: [1800, 1800, 1200, 1800, 1800, 1200], type: 'square', gap: 0.09 },
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
      gain.gain.exponentialRampToValueAtTime(0.25 * safeVolume, startTime + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.24)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(startTime)
      oscillator.stop(startTime + 0.26)
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
    setManualPreAlert(false)
    setActiveAlarm(null)
  }, [])

  // 알람이 도래하면 알람 배너를 띄우고, 사용자가 멈출 때까지 소리를 반복합니다.
  const fireAlarm = useCallback(
    (schedule: Schedule) => {
      stopAlarm()
      setActiveAlarm({
        id: schedule.id,
        title: schedule.title,
        startTime: schedule.startTime,
        alarmBeforeMinutes: schedule.alarmBeforeMinutes,
        color: schedule.color,
      })
      playSound(schedule.sound, schedule.volume)
      alarmLoopRef.current = window.setInterval(() => {
        playSound(schedule.sound, schedule.volume)
      }, 1_600)

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(schedule.title, {
          body: `${schedule.startTime} 시작, ${schedule.alarmBeforeMinutes}분 전`,
        })
      }
    },
    [playSound, stopAlarm],
  )

  useEffect(() => stopAlarm, [stopAlarm])

  const startTestAlarm = () => {
    const context = getAudioContext()
    if (context) void context.resume()

    setManualPreAlert(true)
    testAlarmTimeoutRef.current = window.setTimeout(() => {
      fireAlarm({
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
      })
    }, 10_000)
  }

  useEffect(() => {
    const alarmTimer = window.setInterval(() => {
      const currentDay = getTodayKey()
      const currentTime = Date.now()
      const currentDate = new Date().toDateString()

      // 실제 시각 기준으로 검사해 10초 전 강조와 알람 시작을 맞춘다.
      schedules.forEach((schedule) => {
        const alarmTime = getAlarmDate(schedule).getTime()
        const triggerKey = `${schedule.id}-${currentDate}-${alarmTime}`

        if (
          schedule.enabled &&
          schedule.days.includes(currentDay) &&
          currentTime >= alarmTime &&
          currentTime < alarmTime + 60_000 &&
          !triggeredRef.current.has(triggerKey)
        ) {
          triggeredRef.current.add(triggerKey)
          fireAlarm(schedule)
        }
      })
    }, 1000)

    return () => window.clearInterval(alarmTimer)
  }, [fireAlarm, schedules])

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') return
    const permission = await Notification.requestPermission()
    setNotificationStatus(permission)
  }

  const resetForm = () => {
    setForm(getEmptyForm())
    setEditingId(null)
  }

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
    const targetDate = new Date(nowDate.getTime() + minutes * 60_000)
    targetDate.setSeconds(0, 0)

    if (targetDate.getTime() <= nowDate.getTime() + minutes * 60_000) {
      targetDate.setMinutes(targetDate.getMinutes() + 1)
    }

    const endDate = new Date(targetDate.getTime() + 30 * 60_000)
    const title = formatTimerLabel(minutes)

    setSchedules((current) => [
      ...current,
      {
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
      },
    ])
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

    if (editingId) {
      setSchedules((current) =>
        current.map((schedule) =>
          schedule.id === editingId ? { ...safeForm, id: editingId, title: cleanTitle } : schedule,
        ),
      )
    } else {
      setSchedules((current) => [
        ...current,
        { ...safeForm, id: crypto.randomUUID(), title: cleanTitle },
      ])
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
    })
    setEditingId(schedule.id)
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
        activeAlarm ? 'alarm-ringing' : '',
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

      {nextTodayAlarm && (
        <section className="next-alarm">
          <span>가장 가까운 알람</span>
          <strong>{nextTodayAlarm.schedule.title}</strong>
          <span>
            {formatAlarm(nextTodayAlarm.schedule.startTime, nextTodayAlarm.schedule.alarmBeforeMinutes)}
          </span>
          <b>{formatDuration(nextTodayAlarm.alarmTime - tickMs)} 남음</b>
        </section>
      )}

      {activeAlarm && (
        <section className="alarm-banner" style={{ borderColor: activeAlarm.color }}>
          <div>
            <strong>{activeAlarm.title}</strong>
            <span>
              {activeAlarm.startTime} 시작, {activeAlarm.alarmBeforeMinutes}분 전 알람
            </span>
          </div>
          <button className="stop-alarm" onClick={stopAlarm} type="button">
            <CircleStop size={20} />
            알람 멈춤
          </button>
        </section>
      )}

      <section className="workspace">
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
        </section>

        <section className="panel schedule-panel">
          <div className="section-title">
            <BellRing size={20} />
            <h2>주간표</h2>
          </div>

          <div className="week-grid">
            {days.map((day) => (
              <div className="day-column" key={day.key}>
                <div className="day-heading">{day.label}</div>
                <div className="day-list">
                  {schedules
                    .filter((schedule) => schedule.days.includes(day.key))
                    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
                    .map((schedule) => (
                      <article
                        className={[
                          'schedule-item',
                          schedule.enabled ? '' : 'disabled',
                          alertingScheduleIds.has(schedule.id) ? 'pre-alert' : '',
                        ].join(' ')}
                        key={`${day.key}-${schedule.id}`}
                        style={{ borderColor: schedule.color }}
                      >
                        <strong>{schedule.title}</strong>
                        <span>
                          {schedule.startTime}-{schedule.endTime}
                        </span>
                        <small>{formatAlarm(schedule.startTime, schedule.alarmBeforeMinutes)} 알람</small>
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
                </div>
              ))
            )}
          </div>
        </section>

      </section>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="section-title">
            <Bell size={20} />
            <h2>알람 목록</h2>
          </div>
          <button className="secondary" onClick={requestNotifications} type="button">
            브라우저 알림: {notificationStatus === 'granted' ? '허용' : '요청'}
          </button>
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
              {schedules.map((schedule) => (
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
          <h2>이용사항</h2>
          <p>일정은 이 브라우저의 localStorage에 저장됩니다. 다른 기기와 자동 동기화되지 않습니다.</p>
        </div>
        <div>
          <h2>주의사항</h2>
          <p>알람은 브라우저가 열려 있을 때 가장 안정적으로 동작합니다. 브라우저 종료, 절전, OS 알림 제한 상태에서는 보장되지 않습니다.</p>
        </div>
      </footer>

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
    </main>
  )
}

export default App
