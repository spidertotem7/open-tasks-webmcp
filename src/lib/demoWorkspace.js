export const DEMO_STORAGE_KEY = 'task-hub-webmcp-demo'
export const DEMO_ACTIVE_KEY = 'task-hub-webmcp-demo-active'

export const demoMembers = [
  { id: 'demo-user', display_name: 'Demo User', active: true, household_id: 'webmcp-demo' },
  { id: 'demo-partner', display_name: 'Demo Partner', active: true, household_id: 'webmcp-demo' },
]

export const demoCategories = [
  { id: 'demo-book-launch', name: 'Book Launch', position: 0, archived: false, visible_to_uids: demoMembers.map(member => member.id) },
  { id: 'demo-podcast', name: 'Podcast', position: 1, archived: false, visible_to_uids: demoMembers.map(member => member.id) },
  { id: 'demo-admin', name: 'Admin', position: 2, archived: false, visible_to_uids: demoMembers.map(member => member.id) },
  { id: 'demo-personal', name: 'Personal', position: 3, archived: false, visible_to_uids: demoMembers.map(member => member.id) },
]

const makeTask = (id, title, dueDate, categoryId, priority = 'medium', extra = {}) => ({
  id,
  household_id: 'webmcp-demo',
  title,
  description: '',
  category_id: categoryId,
  status: 'not_started',
  priority,
  due_date: dueDate,
  due_time: null,
  assignment_type: 'member',
  assignee_uids: ['demo-user'],
  created_by_uid: 'demo-user',
  created_by_name: 'Demo User',
  completed_at: null,
  completed_by_uid: null,
  completed_by_name: null,
  recurrence: {},
  recurrence_key: id,
  recurring_definition_id: null,
  occurrence_due_date: null,
  ...extra,
})

export function freshDemoWorkspace() {
  return {
    tasks: [
      makeTask('demo-cover', 'Finalize book cover', '2026-09-02', 'demo-book-launch', 'high'),
      makeTask('demo-podcast-outline', 'Outline podcast episode', '2026-09-01', 'demo-podcast'),
      makeTask('demo-newsletter', 'Draft launch newsletter', '2026-09-03', 'demo-book-launch', 'medium'),
      makeTask('demo-invoices', 'Send August invoices', '2026-08-29', 'demo-admin', 'high'),
      makeTask('demo-metadata', 'Review retailer metadata', '2026-09-04', 'demo-book-launch', 'low'),
    ],
    definitions: [],
    categories: demoCategories,
    members: demoMembers,
  }
}

export function loadDemoWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY))
    if (saved?.tasks && saved?.categories && saved?.members) return saved
  } catch (error) {
    console.warn('[task-hub:demo] Could not restore demo workspace', error)
  }
  return freshDemoWorkspace()
}

export function saveDemoWorkspace(workspace) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(workspace))
}
