export function dateString(value = new Date()) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function nextDueDate(date, schedule) {
  if (!date || !schedule?.frequency) return null
  const value = new Date(`${date}T12:00:00`)

  if (schedule.frequency === 'daily') value.setDate(value.getDate() + 1)
  if (schedule.frequency === 'weekly') {
    const weekdays = (schedule.weekdays?.length ? schedule.weekdays : [value.getDay()]).map(Number).sort((a, b) => a - b)
    const nextWeekday = weekdays.find(day => day > value.getDay())
    const delta = nextWeekday === undefined ? weekdays[0] + 7 - value.getDay() : nextWeekday - value.getDay()
    value.setDate(value.getDate() + delta)
  }
  if (schedule.frequency === 'monthly') {
    const originalDay = value.getDate()
    value.setDate(1)
    value.setMonth(value.getMonth() + 1)
    const lastDay = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()
    value.setDate(Math.min(originalDay, lastDay))
  }
  if (schedule.frequency === 'yearly') value.setFullYear(value.getFullYear() + 1)
  if (schedule.frequency === 'custom') value.setDate(value.getDate() + Math.max(1, Number(schedule.interval || 1)))

  return dateString(value)
}

export function occurrenceId(definitionId, dueDate, dueTime = '') {
  return `${definitionId}:${dueDate}:${dueTime}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function recurrenceUrgency(dueDate, currentDate = dateString()) {
  if (!dueDate) return 'green'
  const parse = value => {
    const [year, month, day] = value.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  const days = Math.round((parse(dueDate) - parse(currentDate)) / 86400000)
  if (days <= 0) return 'red'
  if (days <= 2) return 'orange'
  return 'green'
}
