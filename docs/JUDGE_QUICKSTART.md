# Judge Quickstart

1. Open [Open Tasks](https://yanely-jordan-task-hub.vercel.app) in ChatGPT's WebMCP-capable in-app browser.
2. Choose **Open demo workspace**. No account is required.
3. Use these prompts in order:
   - **Create:** “Add ‘Record launch trailer’ for Wednesday and make it high priority.”
   - **List:** “What's overdue and what do I have due this week?”
   - **Context + batch:** Select **Outline podcast episode** and **Draft launch newsletter**, then ask: “Move these to Friday, but leave the launch trailer where it is.”
   - **Complete:** “Mark Draft launch newsletter complete.”

Every mutation should appear immediately in the task UI. The selected-task prompt demonstrates `get_task_context` plus `batch_update_tasks` using exact stable IDs.

Optional diagnostics: open `https://yanely-jordan-task-hub.vercel.app/?webmcpDebug=1` to show WebMCP availability, all six registered tools, and the last invocation/result.

The demo is seeded browser-local data and cannot access private household Firebase data.
