# dsh-memory-system-prompt

English | [中文](./README.zh.md)

Global memory for DeepSeek Harness: the model can write facts into a persistent store and read them back later. The index is injected into the system prompt every turn, **without consuming conversation context**.

The package also carries the **user-level system prompt** feature (the former standalone `dsh-system-prompt` is merged in). Both halves share one settings page.

## What it solves

Models have no cross-session memory. This plugin provides a persistent, searchable memory area:

- **The model writes**: stable facts discovered in conversation (preferences, conventions, environment details) are saved through tools;
- **The index is always present**: each turn injects "title + one-line summary" into the system prompt, so the model knows what exists;
- **Bodies are on demand**: the full text is read only when needed, so the whole store never floods the context;
- **Per-conversation opt-out**: a conversation that should not carry memory can turn it off.

## Tools

| Tool | Purpose |
|---|---|
| `memory_save` | Save or update one memory (same slug overwrites) |
| `memory_read` | Read one memory body by slug |
| `memory_list` | List memories (index only by default) |
| `memory_delete` | Delete one memory |

## User-level system prompt

Written once, applied to every conversation; can also be disabled per conversation.

- **Custom body**: anything you want to impose on the model long-term (tone, format, prohibitions);
- **Nine style dials**: build a behavior instruction from dials instead of prose — base tone, warmth, enthusiasm, emoji, visual answers, headings and lists, quick answers, suggestions, verbosity;
- **Two injection positions**: part of the system prompt, or a context fragment.

Every dial defaults to "default"; keeping all of them default produces no extra content.

## UI

- **Composer toggle (left side)**: three states (off / partial / on), per conversation;
- **Settings → Memory & Prompt**: global switch, individual memories, system prompt and style dials, first-run guide.

## Storage

| Path | Contents |
|---|---|
| `~/.dsh/memory/` | One file per memory |
| `~/.dsh/memory-settings.json` | Global switch and preferences for memory |
| `~/.dsh/system-prompt/settings.json` | System prompt and style dials |

## Install

```bash
pnpm add github:MCJF28/dsh-memory-system-prompt
```

Then add `dsh-memory-system-prompt` to `dsh.profile.bundles` in your profile and restart the app.

> If you previously installed the standalone `dsh-system-prompt`, remove it from both `dependencies` and `bundles` first — otherwise the system prompt is injected twice.

## Notes

- The memory index is injected through `systemPrompt.context`, not `agent.inject`. The latter queues a user message, which makes the model answer its own question for another turn.
- The index refreshes on `agent/created` and `turn/start`, because the content is only current after assembly.
- The system-prompt half deliberately does **not** list `systemPrompt` in `inject`; it resolves the service at runtime via `agent.ctx.get('systemPrompt')`. A hard injection parks the fiber while the service is not ready, which shows up as a silently unloaded plugin and an empty settings page.
