import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { Timestamp, addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, runTransaction, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { auth, authReady, db, firebaseEnabled } from './lib/firebase'
import { dateString, nextDueDate, occurrenceId, recurrenceUrgency } from './lib/recurrence'
import { assignmentType, isActiveTask, isAssignedToMe, isCalendarTask, isCounterpartTask, isHomeCategory, isHomeViewTask, isMyTask, isPrimaryTask, isVisibleOccurrence } from './lib/taskVisibility'
import { buildTaskContext, filterTasks, isValidDateString, resolveAssignee, resolveCategory, taskSummary, validateBatchUpdates, validateTaskPatch } from './lib/webmcpCore'
import { registerTaskTools, toolResult } from './lib/webmcp'
import { DEMO_ACTIVE_KEY, DEMO_STORAGE_KEY, freshDemoWorkspace, loadDemoWorkspace, saveDemoWorkspace } from './lib/demoWorkspace'
import './styles.css'

const categoriesSeed = ['Home', 'Pets', 'Garden', 'Personal', 'Errands']
const demoBootActive = localStorage.getItem(DEMO_ACTIVE_KEY) === 'true'
const demoBootWorkspace = demoBootActive ? loadDemoWorkspace() : null
const demoUser = { uid: 'demo-user', member: { household_id: 'webmcp-demo', display_name: 'Demo User' }, demo: true }
const label = value => value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
const dueLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
const timestampLabel = value => value?.toDate?.().toLocaleString() || 'just now'
const completionLabel = value => {
  const date = value?.toDate?.() || (typeof value === 'string' ? new Date(value) : null)
  return date && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
}
const categoryVisibleTo = (category, userId) => !category.visible_to_uids || category.visible_to_uids.includes(userId)

function completionTimestamp(date) {
  return Timestamp.fromDate(new Date(`${date}T12:00:00`))
}

function timestampInputDate(value) {
  const date = value?.toDate?.() || (typeof value === 'string' ? new Date(value) : null)
  return date ? dateString(date) : ''
}

function mutationMessage(error, action) {
  console.error(`[task-hub] ${action} failed`, { code: error?.code || 'unknown', message: error?.message || String(error) })
  if (error?.code === 'permission-denied') return `You do not have permission to ${action}.`
  if (error?.code === 'unavailable') return 'The connection was interrupted. Please try again.'
  return `Could not ${action}. Please try again.`
}

function normalizeSchedule(value = {}) {
  if (!value.frequency) return {}
  return {
    version: 1,
    frequency: value.frequency,
    weekdays: (value.weekdays || []).map(Number).sort((a, b) => a - b),
    interval: Math.max(1, Number(value.interval || 1)),
    end_date: value.end_date || null,
  }
}

function scheduleLabel(schedule = {}) {
  if (schedule.frequency === 'daily') return 'Daily'
  if (schedule.frequency === 'monthly') return 'Monthly'
  if (schedule.frequency === 'yearly') return 'Yearly'
  if (schedule.frequency === 'custom') return `Every ${schedule.interval || 1} days`
  if (schedule.frequency === 'weekly') {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return schedule.weekdays?.length ? `Weekly: ${schedule.weekdays.map(day => names[day]).join(', ')}` : 'Weekly'
  }
  return ''
}

function deriveWorkspaceView({ tasks, categories, members, user, view, filters }) {
  const counterpart = members.find(member => member.id !== user.uid)
  const visibleCategories = categories.filter(category => categoryVisibleTo(category, user.uid))
  const activeCategories = visibleCategories.filter(category => !category.archived)
  const categoryName = task => visibleCategories.find(category => category.id === task.category_id)?.name || ''
  const primaryTasks = tasks.filter(task => isPrimaryTask(task, user.uid))
  const viewTasks = view === 'counterpart'
    ? tasks.filter(task => isCounterpartTask(task, user.uid, counterpart?.id))
    : view === 'home'
      ? tasks
      : view === 'assigned'
        ? tasks.filter(task => isAssignedToMe(task, user.uid))
        : view === 'completed' || view === 'calendar'
          ? tasks
          : primaryTasks
  const toolbarCategories = activeCategories.filter(category => view === 'home'
    ? isHomeCategory(category.name) || viewTasks.some(task => task.category_id === category.id)
    : view === 'assigned'
      ? viewTasks.some(task => task.category_id === category.id)
      : !isHomeCategory(category.name))
  const activeTasks = viewTasks.filter(task => {
    if (view === 'completed') return task.status === 'completed'
    if (!isActiveTask(task) || !isVisibleOccurrence(task)) return false
    if (view === 'my') return isMyTask(task, user.uid, categoryName(task))
    if (view === 'home') return isHomeViewTask(task, categoryName(task))
    if (view === 'assigned') return isAssignedToMe(task, user.uid)
    if (view === 'calendar') return isCalendarTask(categoryName(task))
    return true
  }).filter(task => view === 'completed' || ((!filters.category || task.category_id === filters.category) && (!filters.priority || task.priority === filters.priority) && (view === 'home' || !filters.status || task.status === filters.status))).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
  return { counterpart, visibleCategories, activeCategories, categoryName, toolbarCategories, activeTasks }
}

function Login({ onDemo }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try { await signInWithEmailAndPassword(auth, email, password) }
    catch { setError('Email or password was not accepted.') }
    finally { setBusy(false) }
  }

  return <main className="login"><div><p className="eyebrow">Agent-native task workspace</p><h1>Household tasks, together.</h1><p>One calm place for home, work, and everything in between.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} required /></label>{error && <p role="alert" className="error">{error}</p>}<button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form><div className="demo-entry"><span>WebMCP Challenge judge?</span><button type="button" className="quiet" onClick={onDemo}>Open demo workspace</button><small>No account required. Demo data stays in this browser.</small></div></div></main>
}

function TaskForm({ task, categories, members, userId, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    title: task?.title || '',
    description: task?.description || '',
    category_id: task?.category_id || '',
    status: task?.status || 'not_started',
    priority: task?.priority || 'medium',
    due_date: task?.due_date || '',
    assignment_target: task ? (assignmentType(task) === 'household' ? 'household' : task.assignee_uids?.[0] || userId) : userId,
    completion_date: timestampInputDate(task?.completed_at),
    completed_by_uid: task?.completed_by_uid || userId,
    recurrence: task?.recurrence || {},
  }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!form.assignment_target) return setError('Choose Yanely, Jordan, or Household.')
    if (form.status === 'completed' && !form.completion_date) return setError('Choose when the task was completed.')
    if (form.status === 'completed' && !members.some(member => member.id === form.completed_by_uid)) return setError('Choose who completed the task.')
    if (form.recurrence.frequency && !form.due_date) return setError('Choose a due date for a recurring task.')
    if (form.recurrence.frequency === 'custom' && Number(form.recurrence.interval) < 1) return setError('The repeat interval must be at least one day.')
    setBusy(true)
    try { await onSave(form) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  const statuses = task?.status === 'completed' ? ['completed'] : ['not_started', 'in_progress', 'waiting']
  const statuslessCategory = isHomeCategory(categories.find(category => category.id === form.category_id)?.name || '')
  return <form className="task-form" onSubmit={submit}>
    <label>Title<input autoFocus value={form.title} onChange={event => set('title', event.target.value)} maxLength="200" required /></label>
    <label>Notes<textarea value={form.description} onChange={event => set('description', event.target.value)} /></label>
    <div className="grid">
      <label>Category<select value={form.category_id} onChange={event => set('category_id', event.target.value)}><option value="">Uncategorized</option>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <label>Assigned to<select value={form.assignment_target} onChange={event => set('assignment_target', event.target.value)} required>{members.map(member => <option value={member.id} key={member.id}>{member.display_name}</option>)}<option value="household">Household</option></select></label>
      <label>Priority<select value={form.priority} onChange={event => set('priority', event.target.value)}>{['high', 'medium', 'low'].map(item => <option key={item} value={item}>{label(item)}</option>)}</select></label>
      {!form.recurrence.frequency && !statuslessCategory && <label>Status<select value={form.status} onChange={event => set('status', event.target.value)}>{statuses.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></label>}
      <label className="due-date-field">Due date<input type="date" value={form.due_date} onChange={event => set('due_date', event.target.value)} /></label>
      <label>Repeat<select value={form.recurrence.frequency || ''} onChange={event => set('recurrence', { ...form.recurrence, frequency: event.target.value })}><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly / selected weekdays</option><option value="custom">Every X days</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
    </div>
    {form.status === 'completed' && <fieldset className="completion-edit"><legend>Completion history</legend><div className="completion-edit-grid"><label>Completed on<input type="date" max={dateString()} value={form.completion_date} onChange={event => set('completion_date', event.target.value)} required /></label><label>Completed by<select value={form.completed_by_uid} onChange={event => set('completed_by_uid', event.target.value)}>{members.map(member => <option value={member.id} key={member.id}>{member.display_name}</option>)}</select></label></div></fieldset>}
    {form.recurrence.frequency === 'weekly' && <fieldset className="repeats-on"><legend>Repeats on</legend><div className="weekday-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => <label className="weekday-option" key={day}><input type="checkbox" checked={(form.recurrence.weekdays || []).includes(index)} onChange={() => { const days = form.recurrence.weekdays || []; set('recurrence', { ...form.recurrence, weekdays: days.includes(index) ? days.filter(dayIndex => dayIndex !== index) : [...days, index] }) }} /><span>{day}</span></label>)}</div></fieldset>}
    {form.recurrence.frequency === 'custom' && <label>Every how many days?<input type="number" min="1" value={form.recurrence.interval ?? 1} onChange={event => set('recurrence', { ...form.recurrence, interval: event.target.value })} /></label>}
    {form.recurrence.frequency && <label className="repeat-until">Repeat until (optional)<input type="date" value={form.recurrence.end_date || ''} onChange={event => set('recurrence', { ...form.recurrence, end_date: event.target.value })} /></label>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button type="button" className="quiet" onClick={onClose} disabled={busy}>Cancel</button><button disabled={busy}>{busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}</button></div>
  </form>
}

function Calendar({ tasks, onSelect }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState('')
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const key = day => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const selected = tasks.filter(task => task.due_date === selectedDate)

  return <section className="calendar-month"><div className="calendar-head"><button className="quiet" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button><h2>{month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h2><button className="quiet" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button></div><div className="weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}</div><div className="month-grid">{Array.from({ length: first.getDay() }, (_, index) => <span className="calendar-blank" key={`blank-${index}`} />)}{Array.from({ length: days }, (_, index) => { const day = key(index + 1); const due = tasks.filter(task => task.due_date === day); return <button className={`calendar-day ${day === dateString() ? 'today' : ''} ${selectedDate === day ? 'selected' : ''}`} key={day} onClick={() => setSelectedDate(day)}><span>{index + 1}</span>{due.length > 0 && <b className="calendar-flame" aria-label={`${due.length} tasks due`}><img src="/taskappflame-transparent.png" alt="" aria-hidden="true" />{due.length > 1 && <span>{due.length}</span>}</b>}</button> })}</div>{selectedDate && <div className="calendar-tasks"><h3>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>{selected.length ? selected.map(task => <button className="calendar-task" key={task.id} onClick={() => onSelect(task)}>{task.title}</button>) : <p className="empty">Nothing due this day.</p>}</div>}</section>
}

function Detail({ task, categories, members, user, definition, onClose, onEdit, onComplete, onDelete, demo = false }) {
  const [comments, setComments] = useState([])
  const [subtasks, setSubtasks] = useState([])
  const [activity, setActivity] = useState([])
  const [comment, setComment] = useState('')
  const [subtask, setSubtask] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState('')
  const [showCompletion, setShowCompletion] = useState(false)
  const [completion, setCompletion] = useState({ date: '', completed_by_uid: user.uid })

  useEffect(() => demo ? undefined : onSnapshot(collection(db, 'tasks', task.id, 'comments'), snapshot => setComments(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (a.created_at?.seconds || 0) - (b.created_at?.seconds || 0)))), [demo, task.id])
  useEffect(() => demo ? undefined : onSnapshot(collection(db, 'tasks', task.id, 'subtasks'), snapshot => setSubtasks(snapshot.docs.map(item => ({ id: item.id, ...item.data() })))), [demo, task.id])
  useEffect(() => demo ? undefined : onSnapshot(collection(db, 'tasks', task.id, 'activity'), snapshot => setActivity(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0)))), [demo, task.id])

  async function perform(name, action) {
    setActionError('')
    setBusy(name)
    try { await action(); return true }
    catch (error) { setActionError(mutationMessage(error, name)); return false }
    finally { setBusy('') }
  }
  async function submitCompletion(event) {
    event.preventDefault()
    if (!completion.date) return setActionError('Choose when the task was completed.')
    if (completion.date > dateString()) return setActionError('The completion date cannot be in the future.')
    const saved = await perform('complete task', () => onComplete(completion))
    if (saved) setShowCompletion(false)
  }
  async function addComment(event) { event.preventDefault(); if (!comment.trim() || demo) return; await perform('add comment', async () => { await addDoc(collection(db, 'tasks', task.id, 'comments'), { body: comment.trim(), author_uid: user.uid, author_name: user.member.display_name, created_at: serverTimestamp() }); setComment('') }) }
  async function addSubtask(event) { event.preventDefault(); if (!subtask.trim() || demo) return; await perform('add subtask', async () => { await addDoc(collection(db, 'tasks', task.id, 'subtasks'), { title: subtask.trim(), completed: false, created_at: serverTimestamp(), updated_at: serverTimestamp() }); setSubtask('') }) }
  const category = categories.find(item => item.id === task.category_id)?.name
  const lastCompleted = completionLabel(definition?.last_completed_at)
  const completedBy = task.completed_by_name || members.find(member => member.id === task.completed_by_uid)?.display_name
  const statusDetail = task.recurring_definition_id ? 'Recurring' : isHomeCategory(category) ? '' : label(task.status)

  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label="Task details"><button className="close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">{category || 'Uncategorized'}</p><h2>{task.title}</h2><p>{task.description || 'No notes yet.'}</p><p className="meta">{[statusDetail, label(task.priority), task.due_date ? `Due ${task.due_date}` : ''].filter(Boolean).join(' · ')}</p>{task.status === 'completed' && <p className="completion-detail">Completed {completionLabel(task.completed_at)}{completedBy ? ` by ${completedBy}` : ''}</p>}{definition && <p className="recurrence-detail">{scheduleLabel(definition.schedule)}{lastCompleted ? ` · Last completed: ${lastCompleted}` : ' · No completions yet'}</p>}{actionError && <p className="error" role="alert">{actionError}</p>}<div className="actions"><button className="quiet" onClick={onEdit} disabled={busy}>Edit</button>{task.status !== 'completed' && <button onClick={() => setShowCompletion(true)} disabled={busy}>Complete</button>}<button className="danger" onClick={() => perform('delete task', onDelete)} disabled={busy}>Delete</button></div>{showCompletion && <form className="completion-form" onSubmit={submitCompletion}><h3>Complete task</h3><label>Completed on<input type="date" max={dateString()} value={completion.date} onChange={event => setCompletion(current => ({ ...current, date: event.target.value }))} required /></label><label>Completed by<select value={completion.completed_by_uid} onChange={event => setCompletion(current => ({ ...current, completed_by_uid: event.target.value }))}>{members.map(member => <option value={member.id} key={member.id}>{member.display_name}</option>)}</select></label><div className="actions"><button type="button" className="quiet" onClick={() => setShowCompletion(false)} disabled={busy}>Cancel</button><button disabled={busy}>{busy === 'complete task' ? 'Completing…' : 'Save completion'}</button></div></form>}{demo ? <p className="demo-note">Comments and subtasks are disabled in the isolated judge demo.</p> : <><h3>Subtasks</h3>{subtasks.map(item => <div className="subtask" key={item.id}><input type="checkbox" checked={item.completed} onChange={() => perform('update subtask', () => updateDoc(doc(db, 'tasks', task.id, 'subtasks', item.id), { completed: !item.completed, updated_at: serverTimestamp() }))} /><span>{item.title}</span><button className="text-button" onClick={() => confirm('Delete this subtask?') && perform('delete subtask', () => deleteDoc(doc(db, 'tasks', task.id, 'subtasks', item.id)))}>Delete</button></div>)}<form className="inline-form" onSubmit={addSubtask}><input value={subtask} onChange={event => setSubtask(event.target.value)} placeholder="Add a subtask" /><button disabled={busy}>Add</button></form><h3>Comments</h3>{comments.map(item => <article className="comment" key={item.id}><b>{item.author_name}</b><small>{timestampLabel(item.created_at)}</small><p>{item.body}</p><button className="text-button" onClick={() => confirm('Delete this comment?') && perform('delete comment', () => deleteDoc(doc(db, 'tasks', task.id, 'comments', item.id)))}>Delete</button></article>)}<form className="inline-form" onSubmit={addComment}><input value={comment} onChange={event => setComment(event.target.value)} placeholder="Write a comment" /><button disabled={busy}>Send</button></form><h3>Activity</h3>{activity.slice(0, 8).map(item => <p className="activity" key={item.id}>{item.message} <small>{timestampLabel(item.created_at)}</small></p>)}</>}</section></div>
}

function App() {
  const [demoMode, setDemoMode] = useState(demoBootActive)
  const [user, setUser] = useState(() => demoBootActive ? demoUser : null)
  const [tasks, setTasks] = useState(() => demoBootWorkspace?.tasks || [])
  const [definitions, setDefinitions] = useState(() => demoBootWorkspace?.definitions || [])
  const [categories, setCategories] = useState(() => demoBootWorkspace?.categories || [])
  const [members, setMembers] = useState(() => demoBootWorkspace?.members || [])
  const [view, setView] = useState('my')
  const [modal, setModal] = useState(null)
  const [filters, setFilters] = useState({ category: '', priority: '', status: '' })
  const [error, setError] = useState('')
  const [selectedTaskIds, setSelectedTaskIds] = useState([])
  const [agentNotice, setAgentNotice] = useState('')
  const [webmcpDebug, setWebmcpDebug] = useState(() => ({ enabled: new URLSearchParams(window.location.search).has('webmcpDebug'), available: false, registered: [] }))
  const webmcpRuntime = useRef(null)
  const [themePreference, setThemePreference] = useState(() => localStorage.getItem('task-hub-theme') || 'system')
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const darkMode = themePreference === 'system' ? systemDark : themePreference === 'dark'

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = event => setSystemDark(event.matches)
    media.addEventListener?.('change', sync)
    return () => media.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light'
    localStorage.setItem('task-hub-theme', themePreference)
  }, [darkMode, themePreference])

  useEffect(() => {
    if (!firebaseEnabled || demoMode) return
    let unsubscribe
    authReady.then(() => { unsubscribe = onAuthStateChanged(auth, async account => { if (!account) return setUser(null); const member = await getDoc(doc(db, 'members', account.uid)); setUser(member.exists() && member.data().active ? { ...account, member: member.data() } : { ...account, denied: true }) }) })
    return () => unsubscribe?.()
  }, [demoMode])

  useEffect(() => {
    if (!user?.member || user.demo) return
    const householdId = user.member.household_id
    const ownTasks = new Map(), assignedTasks = new Map(), ownDefinitions = new Map(), assignedDefinitions = new Map()
    const syncTasks = () => setTasks([...ownTasks.values(), ...assignedTasks.values()].filter((task, index, list) => list.findIndex(item => item.id === task.id) === index))
    const syncDefinitions = () => setDefinitions([...ownDefinitions.values(), ...assignedDefinitions.values()].filter((definition, index, list) => list.findIndex(item => item.id === definition.id) === index))
    const listen = (target, targetMap, sync) => onSnapshot(target, snapshot => { targetMap.clear(); snapshot.docs.forEach(item => targetMap.set(item.id, { id: item.id, ...item.data() })); sync() }, failure => { console.error('[task-hub] realtime listener failed', failure); setError('Live updates were interrupted. Refresh or try again shortly.') })
    const stops = [
      listen(query(collection(db, 'tasks'), where('household_id', '==', householdId), where('created_by_uid', '==', user.uid)), ownTasks, syncTasks),
      listen(query(collection(db, 'tasks'), where('household_id', '==', householdId), where('assignee_uids', 'array-contains', user.uid)), assignedTasks, syncTasks),
      listen(query(collection(db, 'recurring_tasks'), where('household_id', '==', householdId), where('created_by_uid', '==', user.uid)), ownDefinitions, syncDefinitions),
      listen(query(collection(db, 'recurring_tasks'), where('household_id', '==', householdId), where('assignee_uids', 'array-contains', user.uid)), assignedDefinitions, syncDefinitions),
      onSnapshot(query(collection(db, 'categories'), where('household_id', '==', householdId), where('visible_to_uids', 'array-contains', user.uid)), snapshot => setCategories(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => a.position - b.position))),
      onSnapshot(query(collection(db, 'members'), where('household_id', '==', householdId)), snapshot => setMembers(snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(member => member.active))),
    ]
    return () => stops.forEach(stop => stop())
  }, [user?.demo, user?.member, user?.uid])

  useEffect(() => {
    if (!demoMode) return
    saveDemoWorkspace({ tasks, definitions, categories, members })
  }, [categories, definitions, demoMode, members, tasks])

  useEffect(() => {
    if (!user?.member) { webmcpRuntime.current = null; return }
    const workspace = deriveWorkspaceView({ tasks, categories, members, user, view, filters })
    const validSelectedTaskIds = selectedTaskIds.filter(id => workspace.activeTasks.some(task => task.id === id))
    webmcpRuntime.current = {
      view,
      filters,
      selectedTaskIds: validSelectedTaskIds,
      visibleTasks: workspace.activeTasks,
      tasks,
      categories: workspace.activeCategories,
      members,
      user,
      today: dateString(),
      createFromAgent,
      updateFromAgent,
      completeFromAgent,
      batchUpdateFromAgent,
    }
  })

  useEffect(() => {
    if (!user?.member) return
    let stopped = false
    let unregister = () => {}
    const runtime = () => {
      if (!webmcpRuntime.current) throw new Error('The task workspace is still loading. Try again in a moment.')
      return webmcpRuntime.current
    }
    registerTaskTools({
      getContext: async () => {
        const current = runtime()
        const context = buildTaskContext(current)
        return toolResult(`Current view: ${context.current_view}. ${context.selected_task_ids.length} task${context.selected_task_ids.length === 1 ? '' : 's'} selected.`, { context })
      },
      listTasks: async input => {
        const current = runtime()
        const matches = filterTasks(current.tasks, input, current).map(task => taskSummary(task, current.categories, current.members))
        return toolResult(`Found ${matches.length} task${matches.length === 1 ? '' : 's'}.`, { tasks: matches, count: matches.length })
      },
      createTask: async input => runtime().createFromAgent(input),
      updateTask: async input => runtime().updateFromAgent(input),
      completeTask: async input => runtime().completeFromAgent(input),
      batchUpdateTasks: async input => runtime().batchUpdateFromAgent(input),
      onDebug: update => setWebmcpDebug(current => ({ ...current, ...update })),
    }).then(stop => {
      if (stopped) stop()
      else unregister = stop
    }).catch(failure => {
      console.error('[task-hub:webmcp] registration failed', failure)
      setWebmcpDebug(current => ({ ...current, available: false, error: failure.message }))
    })
    return () => { stopped = true; unregister() }
  }, [user?.member, user?.uid])

  async function saveTask(data, existing) {
    const schedule = normalizeSchedule(data.recurrence)
    const assignment_type = data.assignment_target === 'household' ? 'household' : 'member'
    const assignees = assignment_type === 'household' ? members.map(member => member.id) : members.some(member => member.id === data.assignment_target) ? [data.assignment_target] : []
    if (!assignees.length) throw new Error('Choose Yanely, Jordan, or Household.')
    const completedBy = data.status === 'completed' ? members.find(member => member.id === data.completed_by_uid) : null
    if (data.status === 'completed' && (!data.completion_date || !completedBy)) throw new Error('Choose the completion date and person.')
    const completionFields = data.status === 'completed' ? { completed_at: completionTimestamp(data.completion_date), completed_by_uid: completedBy.id, completed_by_name: completedBy.display_name } : { completed_at: null, completed_by_uid: null, completed_by_name: null }
    const categoryIsHome = isHomeCategory(categories.find(category => category.id === data.category_id)?.name || '')
    const taskStatus = existing?.status === 'completed' ? 'completed' : schedule.frequency || categoryIsHome ? 'not_started' : data.status
    const base = { household_id: user.member.household_id, title: data.title.trim(), description: data.description.trim(), category_id: data.category_id || '', status: taskStatus, priority: data.priority, due_date: data.due_date || null, due_time: null, assignment_type, assignee_uids: assignees, recurrence: schedule, updated_at: serverTimestamp() }
    if (demoMode) {
      const savedId = existing?.id || `demo-${crypto.randomUUID()}`
      const demoBase = { ...base, updated_at: new Date().toISOString() }
      if (!existing) {
        const definitionId = schedule.frequency ? `demo-repeat-${crypto.randomUUID()}` : null
        const created = { ...demoBase, id: savedId, created_by_uid: user.uid, created_by_name: user.member.display_name, created_at: new Date().toISOString(), completed_at: null, completed_by_uid: null, completed_by_name: null, recurrence_key: definitionId || savedId, recurring_definition_id: definitionId, occurrence_due_date: definitionId ? demoBase.due_date : null }
        setTasks(current => [...current, created])
        if (definitionId) setDefinitions(current => [...current, { ...demoBase, id: definitionId, schedule, active: true, next_due_date: demoBase.due_date, current_occurrence_id: savedId, last_completed_at: null, last_completed_occurrence_id: null, created_by_uid: user.uid, created_by_name: user.member.display_name, created_at: new Date().toISOString() }])
      } else {
        const demoCompletion = existing.status === 'completed' ? { completed_at: data.completion_date ? `${data.completion_date}T12:00:00` : existing.completed_at, completed_by_uid: data.completed_by_uid, completed_by_name: members.find(member => member.id === data.completed_by_uid)?.display_name || existing.completed_by_name } : {}
        setTasks(current => current.map(task => task.id === existing.id ? { ...task, ...demoBase, ...demoCompletion } : task))
      }
      setError('')
      setModal(null)
      return savedId
    }
    try {
      let savedId = existing?.id || null
      if (!existing) {
        if (schedule.frequency) {
          const definitionRef = doc(collection(db, 'recurring_tasks')), taskRef = doc(collection(db, 'tasks')), batch = writeBatch(db)
          savedId = taskRef.id
          batch.set(definitionRef, { ...base, schedule, active: true, next_due_date: base.due_date, current_occurrence_id: taskRef.id, last_completed_at: null, last_completed_occurrence_id: null, created_by_uid: user.uid, created_by_name: user.member.display_name, created_at: serverTimestamp() })
          batch.set(taskRef, { ...base, created_by_uid: user.uid, created_by_name: user.member.display_name, created_at: serverTimestamp(), completed_at: null, completed_by_uid: null, completed_by_name: null, recurrence_key: definitionRef.id, recurring_definition_id: definitionRef.id, occurrence_due_date: base.due_date })
          await batch.commit()
        } else savedId = (await addDoc(collection(db, 'tasks'), { ...base, created_by_uid: user.uid, created_by_name: user.member.display_name, created_at: serverTimestamp(), completed_at: null, completed_by_uid: null, completed_by_name: null, recurrence_key: crypto.randomUUID(), recurring_definition_id: null, occurrence_due_date: null })).id
      } else {
        const batch = writeBatch(db), taskRef = doc(db, 'tasks', existing.id)
        if (existing.status === 'completed') {
          batch.update(taskRef, { ...base, ...completionFields })
          const definition = existing.recurring_definition_id ? definitions.find(item => item.id === existing.recurring_definition_id) : null
          if (definition?.last_completed_occurrence_id === existing.id) batch.update(doc(db, 'recurring_tasks', definition.id), { last_completed_at: completionFields.completed_at, updated_at: serverTimestamp() })
          batch.set(doc(collection(db, 'tasks', existing.id, 'activity')), { author_uid: user.uid, message: `${user.member.display_name} corrected the completion details`, occurred_at: completionFields.completed_at, created_at: serverTimestamp() })
        } else if (existing.recurring_definition_id) {
          batch.update(taskRef, { ...base, recurring_definition_id: schedule.frequency ? existing.recurring_definition_id : null, occurrence_due_date: schedule.frequency ? base.due_date : null })
          batch.update(doc(db, 'recurring_tasks', existing.recurring_definition_id), schedule.frequency ? { title: base.title, description: base.description, category_id: base.category_id, priority: base.priority, due_time: base.due_time, assignment_type: base.assignment_type, assignee_uids: base.assignee_uids, schedule, active: true, next_due_date: base.due_date, current_occurrence_id: existing.id, updated_at: serverTimestamp() } : { active: false, current_occurrence_id: null, next_due_date: null, updated_at: serverTimestamp() })
        } else if (schedule.frequency) {
          const definitionRef = doc(collection(db, 'recurring_tasks'))
          batch.set(definitionRef, { ...base, schedule, active: true, next_due_date: base.due_date, current_occurrence_id: existing.id, last_completed_at: null, last_completed_occurrence_id: null, created_by_uid: existing.created_by_uid, created_by_name: existing.created_by_name, created_at: serverTimestamp() })
          batch.update(taskRef, { ...base, recurrence_key: definitionRef.id, recurring_definition_id: definitionRef.id, occurrence_due_date: base.due_date })
        } else batch.update(taskRef, { ...base, recurring_definition_id: null, occurrence_due_date: null })
        await batch.commit()
      }
      setError('')
      setModal(null)
      return savedId
    } catch (failure) {
      const message = mutationMessage(failure, existing ? 'save task' : 'create task')
      setError(message)
      throw new Error(message)
    }
  }

  async function complete(task, completion) {
    const completedBy = members.find(member => member.id === completion.completed_by_uid)
    if (!completedBy) throw new Error('Choose who completed the task.')
    const completedAt = completionTimestamp(completion.date)
    if (demoMode) {
      const completedAtString = `${completion.date}T12:00:00`
      const definition = task.recurring_definition_id ? definitions.find(item => item.id === task.recurring_definition_id) : null
      const candidateDate = definition ? nextDueDate(completion.date, definition.schedule) : null
      const nextDate = candidateDate && (!definition.schedule.end_date || candidateDate <= definition.schedule.end_date) ? candidateDate : null
      const nextId = nextDate ? occurrenceId(task.recurring_definition_id, nextDate) : null
      setTasks(current => {
        const completed = current.map(item => item.id === task.id ? { ...item, status: 'completed', completed_at: completedAtString, completed_by_uid: completedBy.id, completed_by_name: completedBy.display_name, updated_at: new Date().toISOString() } : item)
        if (!definition || !nextDate || completed.some(item => item.id === nextId)) return completed
        return [...completed, { household_id: definition.household_id, id: nextId, title: definition.title, description: definition.description, category_id: definition.category_id, status: 'not_started', priority: definition.priority, due_date: nextDate, due_time: null, assignment_type: assignmentType(definition), assignee_uids: definition.assignee_uids, created_by_uid: definition.created_by_uid, created_by_name: definition.created_by_name, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), completed_at: null, completed_by_uid: null, completed_by_name: null, recurrence: definition.schedule, recurrence_key: task.recurring_definition_id, recurring_definition_id: task.recurring_definition_id, occurrence_due_date: nextDate }]
      })
      if (definition) setDefinitions(current => current.map(item => item.id === definition.id ? { ...item, last_completed_at: completedAtString, last_completed_occurrence_id: task.id, next_due_date: nextDate, current_occurrence_id: nextId, active: Boolean(nextDate), updated_at: new Date().toISOString() } : item))
      setModal(null)
      return task.id
    }
    try {
      await runTransaction(db, async transaction => {
        const taskRef = doc(db, 'tasks', task.id), taskSnapshot = await transaction.get(taskRef)
        if (!taskSnapshot.exists() || taskSnapshot.data().status === 'completed') return
        const current = taskSnapshot.data(), definitionRef = current.recurring_definition_id ? doc(db, 'recurring_tasks', current.recurring_definition_id) : null
        const definitionSnapshot = definitionRef ? await transaction.get(definitionRef) : null
        if (definitionRef && !definitionSnapshot.exists()) throw new Error('Recurring definition is missing.')
        const definition = definitionSnapshot?.data(), schedule = definition?.schedule || current.recurrence
        const candidateDate = definitionRef ? nextDueDate(completion.date, schedule) : null
        const nextDate = candidateDate && (!schedule.end_date || candidateDate <= schedule.end_date) ? candidateDate : null
        const nextId = nextDate ? occurrenceId(current.recurring_definition_id, nextDate) : null
        const nextRef = nextId ? doc(db, 'tasks', nextId) : null
        transaction.update(taskRef, { status: 'completed', completed_at: completedAt, completed_by_uid: completedBy.id, completed_by_name: completedBy.display_name, updated_at: serverTimestamp() })
        transaction.set(doc(db, 'tasks', task.id, 'activity', `completion_${task.id}`), { author_uid: user.uid, completed_by_uid: completedBy.id, message: `${completedBy.display_name} completed this task (recorded by ${user.member.display_name})`, occurred_at: completedAt, created_at: serverTimestamp() })
        if (definitionRef) {
          transaction.update(definitionRef, { last_completed_at: completedAt, last_completed_occurrence_id: task.id, next_due_date: nextDate, current_occurrence_id: nextId, active: Boolean(nextDate), updated_at: serverTimestamp() })
          if (nextRef) transaction.set(nextRef, { household_id: definition.household_id, title: definition.title, description: definition.description, category_id: definition.category_id, status: 'not_started', priority: definition.priority, due_date: nextDate, due_time: null, assignment_type: assignmentType(definition), assignee_uids: definition.assignee_uids, created_by_uid: definition.created_by_uid, created_by_name: definition.created_by_name, created_at: serverTimestamp(), updated_at: serverTimestamp(), completed_at: null, completed_by_uid: null, completed_by_name: null, recurrence: schedule, recurrence_key: current.recurring_definition_id, recurring_definition_id: current.recurring_definition_id, occurrence_due_date: nextDate })
        }
      })
      setError('')
      setModal(null)
      return task.id
    } catch (failure) {
      const message = mutationMessage(failure, 'complete task')
      setError(message)
      throw new Error(message)
    }
  }

  async function removeTask(task) {
    if (!confirm(`Delete “${task.title}”? This cannot be undone.`)) return
    if (demoMode) { setTasks(current => current.filter(item => item.id !== task.id)); setModal(null); return }
    try { await deleteDoc(doc(db, 'tasks', task.id)); setModal(null) }
    catch (failure) { const message = mutationMessage(failure, 'delete task'); setError(message); throw new Error(message) }
  }
  async function seedCategories() { if (!confirm('Add the five household categories? Existing categories will stay unchanged.')) return; if (demoMode) { setCategories(current => [...current, ...categoriesSeed.filter(name => !current.some(category => category.name === name)).map((name, index) => ({ id: `demo-category-${crypto.randomUUID()}`, household_id: 'webmcp-demo', name, position: current.length + index, archived: false, visible_to_uids: members.map(member => member.id) }))]); return } for (const [position, name] of categoriesSeed.entries()) await addDoc(collection(db, 'categories'), { household_id: user.member.household_id, name, position: categories.length + position, archived: false, visible_to_uids: members.map(member => member.id), created_at: serverTimestamp(), updated_at: serverTimestamp() }) }
  async function addCategory() { const name = prompt('Category name'); if (!name?.trim()) return; if (demoMode) { setCategories(current => [...current, { id: `demo-category-${crypto.randomUUID()}`, household_id: 'webmcp-demo', name: name.trim(), position: current.filter(category => !category.archived).length, archived: false, visible_to_uids: [user.uid] }]); return } await addDoc(collection(db, 'categories'), { household_id: user.member.household_id, name: name.trim(), position: categories.filter(category => !category.archived).length, archived: false, visible_to_uids: [user.uid], created_at: serverTimestamp(), updated_at: serverTimestamp() }) }
  async function manageCategory(category, action) {
    const active = categories.filter(item => !item.archived && categoryVisibleTo(item, user.uid))
    if (demoMode) {
      if (action === 'rename') {
        const name = prompt('Category name', category.name)
        if (name?.trim()) setCategories(current => current.map(item => item.id === category.id ? { ...item, name: name.trim() } : item))
      } else if (action === 'archive') {
        if (confirm(`Archive ${category.name}?`)) setCategories(current => current.map(item => item.id === category.id ? { ...item, archived: true } : item))
      } else {
        const neighbor = active[active.indexOf(category) + action]
        if (neighbor) setCategories(current => current.map(item => item.id === category.id ? { ...item, position: neighbor.position } : item.id === neighbor.id ? { ...item, position: category.position } : item))
      }
      return
    }
    if (action === 'rename') {
      const name = prompt('Category name', category.name)
      if (name?.trim()) await updateDoc(doc(db, 'categories', category.id), { name: name.trim(), updated_at: serverTimestamp() })
    } else if (action === 'archive') {
      if (confirm(`Archive ${category.name}?`)) await updateDoc(doc(db, 'categories', category.id), { archived: true, updated_at: serverTimestamp() })
    } else {
      const neighbor = active[active.indexOf(category) + action]
      if (neighbor) {
        await updateDoc(doc(db, 'categories', category.id), { position: neighbor.position, updated_at: serverTimestamp() })
        await updateDoc(doc(db, 'categories', neighbor.id), { position: category.position, updated_at: serverTimestamp() })
      }
    }
  }

  function enterDemo() {
    const workspace = loadDemoWorkspace()
    localStorage.setItem(DEMO_ACTIVE_KEY, 'true')
    setDemoMode(true)
    setUser(demoUser)
    setTasks(workspace.tasks)
    setDefinitions(workspace.definitions)
    setCategories(workspace.categories)
    setMembers(workspace.members)
    setView('my')
    setModal(null)
  }

  function resetDemo() {
    const workspace = freshDemoWorkspace()
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(workspace))
    setTasks(workspace.tasks)
    setDefinitions(workspace.definitions)
    setCategories(workspace.categories)
    setMembers(workspace.members)
    setSelectedTaskIds([])
    setAgentNotice('Demo workspace reset.')
  }

  function leaveWorkspace() {
    if (demoMode) {
      localStorage.removeItem(DEMO_ACTIVE_KEY)
      setDemoMode(false)
      setUser(null)
      setTasks([])
      setDefinitions([])
      setCategories([])
      setMembers([])
      return
    }
    signOut(auth)
  }

  function taskFormFromAgent(task, input) {
    validateTaskPatch(input)
    if (task.recurring_definition_id && 'status' in input) throw new Error('Recurring occurrences do not expose status changes. Use complete_task when finished.')
    const categoryId = 'category' in input ? resolveCategory(input.category, categories) : task.category_id
    const assignmentTarget = 'assignee' in input ? resolveAssignee(input.assignee, user, members) : assignmentType(task) === 'household' ? 'household' : task.assignee_uids?.[0]
    return {
      title: 'title' in input ? input.title.trim() : task.title,
      description: 'description' in input ? input.description || '' : task.description || '',
      category_id: categoryId || '',
      status: 'status' in input ? input.status : task.status,
      priority: 'priority' in input ? input.priority : task.priority,
      due_date: 'due_date' in input ? input.due_date || '' : task.due_date || '',
      assignment_target: assignmentTarget,
      completion_date: timestampInputDate(task.completed_at),
      completed_by_uid: task.completed_by_uid || user.uid,
      recurrence: task.recurrence || {},
    }
  }

  async function createFromAgent(input) {
    if (!input.title?.trim() || input.title.trim().length > 200) throw new Error('Title must be between 1 and 200 characters.')
    if (String(input.description || '').length > 10000) throw new Error('Description cannot exceed 10,000 characters.')
    if (input.due_date && !isValidDateString(input.due_date)) throw new Error('due_date must use YYYY-MM-DD and be a real calendar date.')
    if (input.priority && !['high', 'medium', 'low'].includes(input.priority)) throw new Error('Priority must be high, medium, or low.')
    if (input.status && !['not_started', 'in_progress', 'waiting'].includes(input.status)) throw new Error('Use complete_task to create completion history.')
    const categoryId = input.category === undefined ? filters.category : resolveCategory(input.category, categories)
    const assignmentTarget = input.assignee === undefined ? user.uid : resolveAssignee(input.assignee, user, members)
    const id = await saveTask({ title: input.title.trim(), description: input.description || '', category_id: categoryId || '', status: input.status || 'not_started', priority: input.priority || 'medium', due_date: input.due_date || '', assignment_target: assignmentTarget, completion_date: '', completed_by_uid: user.uid, recurrence: {} })
    const message = `Created “${input.title.trim()}”${input.due_date ? ` due ${input.due_date}` : ''}.`
    setAgentNotice(message)
    return toolResult(message, { task: { id, title: input.title.trim(), due_date: input.due_date || null, priority: input.priority || 'medium' } })
  }

  async function updateFromAgent(input, { quiet = false } = {}) {
    const task = tasks.find(item => item.id === input.task_id)
    if (!task) throw new Error(`Task ${input.task_id} was not found or is not accessible.`)
    await saveTask(taskFormFromAgent(task, input), task)
    const changed = Object.keys(input).filter(key => key !== 'task_id')
    const message = `Updated “${task.title}”: ${changed.join(', ')}.`
    if (!quiet) setAgentNotice(message)
    return { id: task.id, title: task.title, changed }
  }

  async function completeFromAgent(input) {
    const task = tasks.find(item => item.id === input.task_id)
    if (!task) throw new Error(`Task ${input.task_id} was not found or is not accessible.`)
    if (task.status === 'completed') return toolResult(`“${task.title}” was already completed.`, { task: taskSummary(task, categories, members), already_completed: true })
    const completedOn = input.completed_on || dateString()
    if (!isValidDateString(completedOn)) throw new Error('completed_on must use YYYY-MM-DD and be a real calendar date.')
    if (completedOn > dateString()) throw new Error('The completion date cannot be in the future.')
    const completedBy = input.completed_by === undefined ? user.uid : resolveAssignee(input.completed_by, user, members)
    if (completedBy === 'household') throw new Error('Choose one household member as the completer.')
    await complete(task, { date: completedOn, completed_by_uid: completedBy })
    const message = `Completed “${task.title}” on ${completedOn}.`
    setAgentNotice(message)
    return toolResult(message, { task_id: task.id, completed_on: completedOn, recurring: Boolean(task.recurring_definition_id) })
  }

  async function batchUpdateFromAgent(input) {
    validateBatchUpdates(input.updates, new Set(tasks.map(task => task.id)))
    const updated = []
    for (const item of input.updates) updated.push(await updateFromAgent(item, { quiet: true }))
    const message = `Updated ${updated.length} task${updated.length === 1 ? '' : 's'}: ${updated.map(item => item.title).join(', ')}.`
    setAgentNotice(message)
    return toolResult(message, { updated })
  }

  if (!firebaseEnabled && !demoMode) return <main className="login"><div><h1>Firebase is not configured</h1><p>You can still explore the isolated challenge demo.</p><button onClick={enterDemo}>Open demo workspace</button></div></main>
  if (!user) return <Login onDemo={enterDemo} />
  if (user.denied) return <main className="login"><h1>Access not approved</h1><p>Your signed-in account is not an active household member.</p><button onClick={() => signOut(auth)}>Sign out</button></main>

  const { counterpart, visibleCategories, activeCategories, categoryName, toolbarCategories, activeTasks } = deriveWorkspaceView({ tasks, categories, members, user, view, filters })
  const activeSelectedTaskIds = selectedTaskIds.filter(id => activeTasks.some(task => task.id === id))
  const selected = modal?.type === 'detail' ? tasks.find(task => task.id === modal.task.id) : null
  const selectedDefinition = selected?.recurring_definition_id ? definitions.find(definition => definition.id === selected.recurring_definition_id) : null
  const nav = [['my', 'My Tasks'], ['counterpart', `${counterpart?.display_name || 'Other'}’s Tasks`], ['home', 'Home'], ['assigned', 'Assigned to Me'], ['completed', 'Completed'], ['calendar', 'Calendar']]
  const taskCard = task => {
    const recurring = Boolean(task.recurring_definition_id)
    const definition = recurring ? definitions.find(item => item.id === task.recurring_definition_id) : null
    const taskCategory = categoryName(task)
    const urgency = task.due_date ? ` due-card urgency-${recurrenceUrgency(task.due_date)}` : ''
    const detail = recurring ? scheduleLabel(definition?.schedule || task.recurrence) : isHomeCategory(taskCategory) ? '' : label(task.status)
    const lastCompleted = recurring ? completionLabel(definition?.last_completed_at) : ''
    const isSelected = activeSelectedTaskIds.includes(task.id)
    return <article className={`task${isSelected ? ' task-selected' : ''}${recurring ? ' recurring-card' : ''}${urgency}`} aria-selected={isSelected} key={task.id} onClick={() => setModal({ type: 'detail', task })}><label className="task-select" onClick={event => event.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => setSelectedTaskIds(current => current.includes(task.id) ? current.filter(id => id !== task.id) : [...current, task.id])} aria-label={`Select ${task.title}`} /><span aria-hidden="true" /></label><span className={`priority ${task.priority}`} /><div><h2>{task.title}</h2><p>{taskCategory || 'Uncategorized'}{detail && ` · ${detail}`}</p>{recurring && <small>{lastCompleted ? `Last completed: ${lastCompleted}` : 'No completions yet'}</small>}</div><time>{dueLabel(task.due_date)}</time></article>
  }
  return <main>
    <header><h1><img className="brand-flame" src="/taskappflame-transparent.png" alt="" aria-hidden="true" />Tasks{demoMode && <span className="demo-badge">Agent demo</span>}</h1><div className="header-actions"><button className="theme-toggle" onClick={() => setThemePreference(darkMode ? 'light' : 'dark')} aria-label={`Use ${darkMode ? 'light' : 'dark'} mode`} title={`Theme: ${themePreference}`}><span aria-hidden="true">{darkMode ? '☾' : '☼'}</span></button><button className="quick-add" onClick={() => setModal({ type: 'new' })} aria-label="Add task">+</button></div></header>
    <nav>{nav.map(([id, name]) => <button className={view === id ? 'active' : ''} onClick={() => { setView(id); setFilters({ category: '', priority: '', status: '' }); setSelectedTaskIds([]) }} key={id}>{name}</button>)}</nav>
    {error && <p className="error" role="alert">{error}</p>}
    {agentNotice && <div className="agent-notice" role="status"><img src="/taskappflame-transparent.png" alt="" aria-hidden="true" /><span>{agentNotice}</span><button onClick={() => setAgentNotice('')} aria-label="Dismiss agent update">×</button></div>}
    {view !== 'completed' && <section className="toolbar"><select value={filters.category} onChange={event => setFilters({ ...filters, category: event.target.value })}><option value="">All categories</option>{toolbarCategories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select><select value={filters.priority} onChange={event => setFilters({ ...filters, priority: event.target.value })}><option value="">All priorities</option>{['high', 'medium', 'low'].map(item => <option key={item} value={item}>{label(item)}</option>)}</select>{view !== 'home' && <select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">All active statuses</option>{['not_started', 'in_progress', 'waiting'].map(item => <option key={item} value={item}>{label(item)}</option>)}</select>}{!activeCategories.length && <button className="quiet" onClick={seedCategories}>Seed categories</button>}</section>}
    {activeSelectedTaskIds.length > 0 && <section className="selection-bar" aria-live="polite"><span>{activeSelectedTaskIds.length} selected</span><small>Ask your agent to update “these tasks.”</small><button className="text-button" onClick={() => setSelectedTaskIds([])}>Clear</button></section>}
    {view === 'calendar' ? <Calendar tasks={activeTasks} onSelect={task => setModal({ type: 'detail', task })} /> : <section className="task-list">{activeTasks.map(taskCard)}{!activeTasks.length && <p className="empty">Nothing here yet.</p>}</section>}
    <footer className="settings"><button className="text-button" onClick={() => setModal({ type: 'settings' })}>Settings</button><button className="text-button sign-out" onClick={leaveWorkspace}>{demoMode ? 'Exit demo' : 'Log out'}</button></footer>
    {modal?.type === 'settings' && <div className="modal-backdrop"><section className="modal settings-modal"><button className="close" onClick={() => setModal(null)} aria-label="Close">×</button><h2>Settings</h2><fieldset><legend>Appearance</legend><div className="theme-options">{[['system', 'Use device setting'], ['light', 'Light'], ['dark', 'Dark']].map(([value, name]) => <label className="check" key={value}><input type="radio" name="theme" checked={themePreference === value} onChange={() => setThemePreference(value)} />{name}</label>)}</div></fieldset><button onClick={() => setModal({ type: 'categories' })}>Manage categories</button>{demoMode && <button className="quiet" onClick={resetDemo}>Reset judge demo</button>}</section></div>}
    {modal?.type === 'categories' && <div className="modal-backdrop"><section className="modal"><button className="close" onClick={() => setModal(null)}>×</button><h2>Categories</h2>{activeCategories.map((category, index) => <p className="category-row" key={category.id}><span>{category.name}</span><button onClick={() => manageCategory(category, -1)} disabled={!index}>↑</button><button onClick={() => manageCategory(category, 1)} disabled={index === activeCategories.length - 1}>↓</button><button onClick={() => manageCategory(category, 'rename')}>Edit</button><button onClick={() => manageCategory(category, 'archive')}>Archive</button></p>)}<button onClick={addCategory}>Add category</button></section></div>}
    {modal?.type === 'new' && <div className="modal-backdrop"><section className="modal"><button className="close" onClick={() => setModal(null)}>×</button><h2>New task</h2><TaskForm categories={activeCategories} members={members} userId={user.uid} onClose={() => setModal(null)} onSave={saveTask} /></section></div>}
    {selected && <Detail task={selected} categories={visibleCategories} members={members} user={user} definition={selectedDefinition} demo={demoMode} onClose={() => setModal(null)} onComplete={completion => complete(selected, completion)} onDelete={() => removeTask(selected)} onEdit={() => setModal({ type: 'edit', task: selected })} />}
    {modal?.type === 'edit' && <div className="modal-backdrop"><section className="modal"><button className="close" onClick={() => setModal(null)}>×</button><h2>Edit task</h2><TaskForm task={modal.task} categories={activeCategories} members={members} userId={user.uid} onClose={() => setModal(null)} onSave={data => saveTask(data, modal.task)} /></section></div>}
    {webmcpDebug.enabled && <aside className="webmcp-debug"><b>WebMCP {webmcpDebug.available ? 'ready' : 'unavailable'}</b><span>{webmcpDebug.registered.length} tools</span>{webmcpDebug.lastInvocation && <small>{webmcpDebug.lastInvocation.tool}: {webmcpDebug.lastInvocation.ok ? 'ok' : webmcpDebug.lastInvocation.error}</small>}{webmcpDebug.error && <small>{webmcpDebug.error}</small>}</aside>}
  </main>
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
