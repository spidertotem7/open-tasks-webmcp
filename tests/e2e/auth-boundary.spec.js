import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const tools = {}
    Object.defineProperty(window, '__webmcpTools', { value: tools })
    Object.defineProperty(document, 'modelContext', {
      value: {
        registerTool: async tool => {
          tools[tool.name] = tool
        },
      },
      configurable: true,
    })
  })
})

test('signed-out visitors only see the private login', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Household tasks, together.' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(1)
})

test('WebMCP tools are not exposed before member authentication', async ({ page }) => {
  await page.goto('/?webmcpDebug=1')
  await page.waitForTimeout(250)

  const registeredTools = await page.evaluate(() => Object.keys(window.__webmcpTools))
  expect(registeredTools).toEqual([])
  await expect(page.locator('.webmcp-debug')).toHaveCount(0)
})
