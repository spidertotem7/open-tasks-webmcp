# Final Demo Shot List

| Time | Exact screen action | Exact prompt | Expected visible result |
| --- | --- | --- | --- |
| 0:00–0:12 | Open the live app in ChatGPT's in-app browser. Click **Open demo workspace**. | — | Seeded task list appears; no sign-in required. |
| 0:12–0:30 | Keep task list and ChatGPT visible. Send prompt. | “Add 'Record launch trailer' for Wednesday and make it high priority.” | `create_task` runs. **Record launch trailer** appears immediately with Wednesday's date and high priority. |
| 0:30–0:45 | Send retrieval prompt. | “What's overdue and what do I have due this week?” | `list_tasks` returns **Send August invoices** as overdue and summarizes dated tasks due this week. No state changes. |
| 0:45–0:54 | Check **Outline podcast episode** and **Draft launch newsletter** in the app. | — | Selection counter shows two selected tasks. |
| 0:54–1:12 | Send the selection-aware prompt. | “Move these to Friday, but leave the launch trailer where it is.” | `get_task_context` exposes the two selected IDs; `batch_update_tasks` moves only those two to Friday. The trailer keeps Wednesday's date. UI updates without refresh. |
| 1:12–1:28 | Send completion prompt. | “Mark Draft launch newsletter complete.” | `complete_task` runs; newsletter leaves the active list. Optionally open **Completed** briefly. |
| 1:28–1:42 | Return to **My Tasks** and hold on updated cards. | — | Shared human/agent workspace and preserved trailer date remain visible. |
| 1:42–1:50 | End on logo and task list. | — | Finish narration; no architecture walkthrough. |

Before recording, use a fresh browser origin or select **Settings → Reset demo data**. Keep `?webmcpDebug=1` available for troubleshooting, but omit it from the polished recording unless a brief registration proof is useful.
