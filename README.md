# dsh-memory-system-prompt

<a id="chinese"></a>

**中文** | [English](#english)

全局记忆插件：AI 可以主动把事实写进记忆文件，并在后续对话里按需读取。记忆索引每轮自动注入系统提示，**不占用对话上下文**。

同时包含**用户级系统提示词**功能（原先独立的 `dsh-system-prompt` 已并入本包），两部分共用同一个设置页。

## 它解决什么

模型本身没有跨会话记忆。这个插件给出一份可持久、可检索的记忆区：

- **AI 主动写**：对话中发现的稳定事实（偏好、约定、环境细节）由模型调用工具写入；
- **索引常驻**：每轮把「标题 + 一句话摘要」注入系统提示，模型知道有什么；
- **正文按需**：需要细节时再调工具读全文，不把整个记忆库塞进上下文；
- **可按对话关**：某个对话不想带记忆时，单独关掉。

## 工具

| 工具 | 作用 |
|---|---|
| `memory_save` | 保存或更新一条记忆（同名覆盖） |
| `memory_read` | 按标识读取一条记忆的正文 |
| `memory_list` | 列出全部记忆（默认只返回索引） |
| `memory_delete` | 删除一条记忆 |

## 用户级系统提示词

写一次，对所有对话生效；也可以按对话单独禁用。

- **自定义正文**：任何想长期强加给模型的要求（语气、格式、禁止事项）；
- **九维风格档位**：不想写长文时，用档位拼出一段行为指令（基础语气、亲切程度、热情程度、表情符号、可视化回答、标题和列表、快速回答、提示词建议、回答长度）；
- **两种注入位置**：作为系统提示的一部分，或作为上下文片段。

档位默认都是「默认」，全部保持默认时不产生任何额外内容。

## 界面

- **输入框左侧开关**：三态（关 / 部分 / 开），按对话生效；
- **设置 → 记忆与提示词**：管理全局开关、单条记忆、系统提示词与风格档位、首次使用引导。

## 存储

| 路径 | 内容 |
|---|---|
| `~/.dsh/memory/` | 每条记忆一个文件 |
| `~/.dsh/memory-settings.json` | 记忆的全局开关与偏好 |
| `~/.dsh/system-prompt/settings.json` | 系统提示词与风格档位 |

## 安装

**推荐：内置插件安装程序。** 打开「设置 → 内置插件」，粘贴包名，点安装，再重启应用：

```
dsh-memory-system-prompt
```

安装程序会自动写进 `dsh.profile.bundles`，不用手改任何文件。

命令行方式（先完全退出应用）：

```bash
cd ~/.dsh/profiles/desktop
pnpm add dsh-memory-system-prompt
```

然后把包名加进 `dsh.profile.bundles`，重启应用。


## 注意

- 记忆索引通过 `systemPrompt.context` 注入，不是 `agent.inject`——后者会排队成一条用户消息，导致模型在回答完再自问自答一轮。
- 索引刷新挂在 `agent/created` 和 `turn/start` 上，因为在 assemble 之后才拿得到最新内容。
- 系统提示词部分**不把 `systemPrompt` 写进 `inject`**，而是运行时用 `agent.ctx.get('systemPrompt')` 取。硬注入会让 fiber 在服务未就绪时被挂起，表现是插件静默不加载、设置里一片空白。

---

<a id="english"></a>

**English** | [中文](#chinese)

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

**The built-in plugin installer is the recommended way.** Open Settings → Built-in Plugins, paste the package name, press install, then restart the app:

```
dsh-memory-system-prompt
```

The installer writes the entry into `dsh.profile.bundles` for you; no manual file edits.

From the command line (quit the app completely first):

```bash
cd ~/.dsh/profiles/desktop
pnpm add dsh-memory-system-prompt
```

Add the package name to `dsh.profile.bundles` and restart the app.


## Notes

- The memory index is injected through `systemPrompt.context`, not `agent.inject`. The latter queues a user message, which makes the model answer its own question for another turn.
- The index refreshes on `agent/created` and `turn/start`, because the content is only current after assembly.
- The system-prompt half deliberately does **not** list `systemPrompt` in `inject`; it resolves the service at runtime via `agent.ctx.get('systemPrompt')`. A hard injection parks the fiber while the service is not ready, which shows up as a silently unloaded plugin and an empty settings page.
