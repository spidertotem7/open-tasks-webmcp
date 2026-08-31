export function assignmentType(task) {
  if (task.assignment_type) return task.assignment_type
  return task.assignee_uids?.length > 1 ? 'household' : 'member'
}

export function isHouseholdTask(task) {
  return assignmentType(task) === 'household'
}

export function isHomeCategory(categoryName = '') {
  return ['home', 'pets', 'garden'].includes(categoryName.trim().toLowerCase())
}

export function isMyTask(task, userId, categoryName = '') {
  return !isHomeCategory(categoryName) && assignmentType(task) === 'member' && task.assignee_uids?.includes(userId)
}

export function isCounterpartTask(task, userId, counterpartId) {
  return Boolean(counterpartId) && task.created_by_uid === userId && assignmentType(task) === 'member' && task.assignee_uids?.includes(counterpartId)
}

export function isAssignedToMe(task, userId) {
  return task.created_by_uid !== userId && assignmentType(task) === 'member' && task.assignee_uids?.includes(userId)
}

export function isHomeViewTask(task, categoryName = '') {
  return isHomeCategory(categoryName) || isHouseholdTask(task)
}

export function isCalendarTask(categoryName = '') {
  return !isHomeCategory(categoryName)
}

export function isPrimaryTask(task, userId) {
  return (assignmentType(task) === 'member' && task.assignee_uids?.includes(userId)) || isHouseholdTask(task)
}

export function isActiveTask(task) {
  return task.status !== 'completed'
}

export function isVisibleOccurrence(task) {
  return !(task.recurring_definition_id && task.status === 'completed')
}
