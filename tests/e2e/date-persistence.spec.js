import { expect, test } from '@playwright/test'

async function openCleanDemo(page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open demo workspace' }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Reset judge demo' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
}

async function openTask(page, title) {
  await page.getByRole('heading', { name: title, exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const tools = {}
    Object.defineProperty(window, '__webmcpTools', { value: tools })
    Object.defineProperty(document, 'modelContext', {
      value: { registerTool: async tool => { tools[tool.name] = tool } },
      configurable: true,
    })
  })
  await openCleanDemo(page)
})

test('create persists a date set with Playwright fill after reopen and reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Add task' }).click()
  await page.getByLabel('Title').fill('Filled date task')
  await page.getByLabel('Due date').fill('2026-09-01')
  await expect(page.getByLabel('Due date')).toHaveValue('2026-09-01')
  await page.getByRole('button', { name: 'Create task' }).click()

  await openTask(page, 'Filled date task')
  await expect(page.locator('.meta')).toContainText('Due 2026-09-01')
  await page.reload()
  await openTask(page, 'Filled date task')
  await expect(page.locator('.meta')).toContainText('Due 2026-09-01')
})

test('edit persists a date set with Playwright fill', async ({ page }) => {
  await openTask(page, 'Outline podcast episode')
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Due date').fill('2026-09-06')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await openTask(page, 'Outline podcast episode')
  await expect(page.locator('.meta')).toContainText('Due 2026-09-06')
  await page.reload()
  await openTask(page, 'Outline podcast episode')
  await expect(page.locator('.meta')).toContainText('Due 2026-09-06')
})

test('clearing an existing due date persists after reload', async ({ page }) => {
  await openTask(page, 'Outline podcast episode')
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Due date').fill('')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await openTask(page, 'Outline podcast episode')
  await expect(page.locator('.meta')).not.toContainText('Due ')
  await page.reload()
  await openTask(page, 'Outline podcast episode')
  await expect(page.locator('.meta')).not.toContainText('Due ')
})

test('WebMCP create_task and update_task persist YYYY-MM-DD due dates', async ({ page }) => {
  await page.waitForFunction(() => window.__webmcpTools?.create_task && window.__webmcpTools?.update_task)
  const created = await page.evaluate(async () => window.__webmcpTools.create_task.execute({
    title: 'WebMCP dated task',
    due_date: '2026-09-02',
    priority: 'high',
  }))
  const taskId = created.structuredContent.task.id
  await openTask(page, 'WebMCP dated task')
  await expect(page.locator('.meta')).toContainText('Due 2026-09-02')
  await page.getByRole('button', { name: 'Close' }).click()

  await page.evaluate(async id => window.__webmcpTools.update_task.execute({ task_id: id, due_date: '2026-09-07' }), taskId)
  await openTask(page, 'WebMCP dated task')
  await expect(page.locator('.meta')).toContainText('Due 2026-09-07')
  await page.reload()
  await openTask(page, 'WebMCP dated task')
  await expect(page.locator('.meta')).toContainText('Due 2026-09-07')
})
