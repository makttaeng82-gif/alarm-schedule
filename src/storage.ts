export const readStoredJson = <T>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : (JSON.parse(value) as T)
  } catch {
    return fallback
  }
}

export const readStoredText = (key: string, fallback = '') => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export const writeStoredJson = <T>(key: string, value: T) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
