/**
 * dsh-memory —— Host 半区
 *
 * 记忆是**文件**，不占上下文：每轮只注入一份「索引」（slug + 标题 + 摘要），
 * 正文由 AI 用 `memory_read` 按需展开。
 *
 * 工具：memory_save / memory_read / memory_list / memory_delete
 * 注入：agent/pre-step waterfall，每轮一次；本对话可禁用（只禁自动注入）。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { apply as applySystemPrompt } from './system-prompt.js'

export const name = 'dsh-memory'

export const inject = ['tools', 'webServer', 'commands']

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const MEMORY_DIR = join(DSH_HOME, 'memory')
const MEMORY_FILE = join(MEMORY_DIR, 'entries.json')
const GLOBAL_CFG_FILE = join(DSH_HOME, 'memory-settings.json')

/**
 * 两层开关：
 *   全局 `globalMemoryEnabled` —— 设置页的总开关，关掉则所有对话都不带记忆
 *   本对话 `accessBySession` —— 输入框按钮的三态，仅在全局开启时生效
 *
 * 本对话的记忆访问级别（三态）：
 *   'auto'   —— 自动注入索引 + AI 可主动读取（默认）
 *   'manual' —— 不自动注入索引，但 AI 仍可主动读取
 *   'off'    —— 完全不参与：不注入，且 memory_* 工具一律不可用
 * 键为 sessionKey。
 */
const accessBySession = new Map()
/** sessionKey -> 该会话的 section 清理函数（运行时上下文注入） */
const contextDisposers = new Map()
/** sessionKey -> 已渲染的索引文本（供同步 provider 读取） */
const indexTextBySession = new Map()

/** 全局总开关（持久化在 ~/.dsh/memory-settings.json）。 */
let globalMemoryEnabled = loadGlobalCfg().enabled !== false

function loadGlobalCfg() {
  try {
    const parsed = JSON.parse(readFileSync(GLOBAL_CFG_FILE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveGlobalCfg(next) {
  try {
    mkdirSync(DSH_HOME, { recursive: true })
    writeFileSync(GLOBAL_CFG_FILE, JSON.stringify(next, null, 2), 'utf8')
    globalMemoryEnabled = next.enabled !== false
  } catch {
    /* 写盘失败不应影响对话 */
  }
}

const ACCESS_AUTO = 'auto'
const ACCESS_MANUAL = 'manual'
const ACCESS_OFF = 'off'

function normalizeAccess(value) {
  return value === ACCESS_OFF || value === ACCESS_MANUAL ? value : ACCESS_AUTO
}

/**
 * 该会话实际生效的访问级别。
 * 全局关闭时一律视为 'off'（连工具都不可用），这样「全局关」才是真的全局关。
 */
function accessOf(sessionKey) {
  if (!globalMemoryEnabled) return ACCESS_OFF
  if (sessionKey === undefined || sessionKey === null) return ACCESS_AUTO
  return normalizeAccess(accessBySession.get(sessionKey))
}

const SUMMARY_MAX = 200
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }

/** 注入偏好（持久化在同一份 memory-settings.json 里）。 */
const PREF_DEFAULTS = {
  indexDetail: 'summary',   // 'title' | 'summary'
  maxEntries: 20,           // 1..200
  injectTiming: 'turn',     // 'turn' | 'step'
  promptPosition: 'system', // 'system' | 'context'
}

function normalizePrefs(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const detail = source.indexDetail === 'title' ? 'title' : 'summary'
  const maxRaw = Number(source.maxEntries)
  const max = Number.isFinite(maxRaw) ? Math.min(200, Math.max(1, Math.round(maxRaw))) : PREF_DEFAULTS.maxEntries
  const timing = source.injectTiming === 'step' ? 'step' : 'turn'
  const position = source.promptPosition === 'context' ? 'context' : 'system'
  return { indexDetail: detail, maxEntries: max, injectTiming: timing, promptPosition: position }
}

/** 当前偏好；与全局开关一起持久化在同一份文件里。 */
let prefs = normalizePrefs(loadGlobalCfg().prefs)

async function readAll() {
  try {
    const text = await readFile(MEMORY_FILE, 'utf8')
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeAll(entries) {
  await mkdir(MEMORY_DIR, { recursive: true })
  await writeFile(MEMORY_FILE, JSON.stringify(entries, null, 2), 'utf8')
}

function slugify(input) {
  const base = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return base.slice(0, 64) || `memory-${Date.now()}`
}

function summarize(content, summary) {
  if (summary) return String(summary).slice(0, SUMMARY_MAX)
  return String(content || '').split('\n')[0].slice(0, SUMMARY_MAX)
}

function renderIndex(entries) {
  if (entries.length === 0) return ''
  // 偏好：只显示标题 / 标题+摘要；并限制条数（按最近更新优先）。
  const limited = entries
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, prefs.maxEntries)
  const lines = limited.map((entry, i) => (
    prefs.indexDetail === 'title'
      ? `${i + 1}. [${entry.slug}] ${entry.title}`
      : `${i + 1}. [${entry.slug}] ${entry.title} — ${entry.summary || '（无摘要）'}`
  ))
  const truncated = entries.length > limited.length
    ? ['', `（共 ${entries.length} 条，此处只列最近更新的 ${limited.length} 条；其余可用 memory_list 查看。）`]
    : []
  return [
    '## 全局记忆索引（系统注入，非用户发言）',
    '',
    '以下是已保存记忆的索引。需要细节时用 `memory_read` 按 slug 取正文，不要凭标题猜测；',
    '要更新某条时用 `memory_save`（同名 slug 覆盖）。',
    '',
    ...lines,
    ...truncated,
  ].join('\n')
}

function upsert(entries, parsed) {
  const slug = slugify(parsed.slug || parsed.title)
  const now = new Date().toISOString()
  const existing = entries.find((entry) => entry.slug === slug)
  const content = String(parsed.content ?? '')
  const record = {
    slug,
    title: String(parsed.title || slug).slice(0, 200),
    summary: summarize(content, parsed.summary),
    content,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 20) : [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  return {
    slug,
    existing: Boolean(existing),
    next: existing ? entries.map((entry) => (entry.slug === slug ? record : entry)) : [...entries, record],
  }
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/** 从 pre-step 的 agent 上取一个稳定的会话键（session.id 或 session 对象本身）。 */
function sessionKeyOf(agent) {
  const session = agent?.session
  if (!session) return undefined
  return session.id ?? session
}

/**
 * 工具侧的访问闸门：'off' 时拒绝一切记忆工具，返回给模型一个明确的拒绝结果。
 * @returns 被拒绝时的规范返回值，未被拒绝时为 undefined。
 */
function deniedByAccess(exec) {
  const agent = exec?.agent
  const key = sessionKeyOf(agent)
  if (accessOf(key) !== ACCESS_OFF) return undefined
  return { denied: true }
}

const DENY_TEXT = '记忆已被用户在本对话中关闭（关闭状态包含禁止读取），因此无法访问任何记忆。'
  + '如需使用，请让用户在输入框左侧的「记忆」按钮里把它切换为「部分」或「开」。'

/** 刷新某会话的索引文本（异步读盘后写入缓存，下一步装配即生效）。 */
async function refreshIndex(key) {
  if (accessOf(key) !== ACCESS_AUTO) {
    indexTextBySession.delete(key)
    return
  }
  try {
    indexTextBySession.set(key, renderIndex(await readAll()))
  } catch {
    /* 读盘失败保留旧值 */
  }
}

export function apply(ctx) {
  // 系统提示词逻辑（原先独立的 dsh-system-prompt 包，现已并入本包）
  applySystemPrompt(ctx)

  /**
   * `/memory`：查看或切换本对话的记忆开关。
   *
   * 不带参数只报告状态；带参数在 on / manual / off 之间切换，
   * 并在切换后立即重算索引 —— 否则下一步装配还会用旧文本。
   * 全局关闭时拒绝切换：那样才符合「全局关就是真的关」的语义。
   */
  ctx.commands.register({
    name: 'memory',
    description: '查看或切换本对话的记忆开关',
    handler: async (inv) => {
      const sessionId = inv.agent?.session?.id
      const key = sessionId === undefined ? undefined : String(sessionId)
      const raw = inv.rawInput.trim().toLowerCase()

      const labelOf = (value) => (value === ACCESS_OFF ? '关' : value === ACCESS_MANUAL ? '部分' : '开')

      if (raw === '') {
        const entries = await readAll()
        const access = accessOf(key)
        const lines = [
          `全局记忆：${globalMemoryEnabled ? '开启' : '已关闭'}`,
          `本对话：${labelOf(access)}`,
          `已保存 ${entries.length} 条记忆`,
        ]
        if (!globalMemoryEnabled) {
          lines.push('全局已关，单对话开关不生效。')
        }
        lines.push('用 /memory on | manual | off 切换本对话；其余在「设置 → 记忆与提示词」。')
        return { kind: 'success', text: lines.join('\n') }
      }

      if (raw !== 'on' && raw !== 'auto' && raw !== 'manual' && raw !== 'off') {
        return { kind: 'error', text: '用法：/memory [on|manual|off]，不带参数只查看状态。' }
      }

      if (!globalMemoryEnabled) {
        return {
          kind: 'error',
          text: '记忆已在设置里全局关闭，单对话无法打开。请先到「设置 → 记忆与提示词」重新开启。',
        }
      }
      if (key === undefined) {
        return { kind: 'error', text: '取不到当前会话，无法切换。' }
      }

      const next = raw === 'off' ? ACCESS_OFF : raw === 'manual' ? ACCESS_MANUAL : ACCESS_AUTO
      accessBySession.set(key, next)
      void refreshIndex(key)
      return { kind: 'success', text: `本对话的记忆已切换为「${labelOf(next)}」。` }
    },
  })

  /* ---------------- AI 工具 ---------------- */

  ctx.tools.register(
    defineTool({
      name: 'memory_save',
      description:
        '保存或更新一条全局记忆（跨会话持久，不占用当前上下文）。'
        + '用于记录稳定的偏好、事实、决定与结论；同名 slug 会覆盖旧内容。',
      parameters: {
        slug: { type: 'string', required: true, description: '稳定标识，同 slug 覆盖；建议短横线小写。' },
        title: { type: 'string', required: true, description: '一句话标题，用于索引。' },
        summary: { type: 'string', description: '一句话摘要（≤200 字），用于索引；省略时取正文首行。' },
        content: { type: 'string', required: true, description: '记忆正文，可多段 Markdown。' },
        tags: { type: 'array', items: { type: 'string' }, description: '可选标签。' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            slug: { type: 'string', required: true },
            created: { type: 'boolean', required: true },
            total: { type: 'integer', required: true },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: `记忆 \`${value.slug}\` 已${value.created ? '创建' : '更新'}；当前共 ${value.total} 条。`,
          },
        ],
      },
      async execute(args, exec) {
        if (deniedByAccess(exec)) throw new Error(DENY_TEXT)
        const { slug, existing, next } = upsert(await readAll(), args)
        await writeAll(next)
        return { slug, created: !existing, total: next.length }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'memory_read',
      description: '按 slug 读取一条全局记忆的完整正文。',
      parameters: {
        slug: { type: 'string', required: true, description: '记忆标识。' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', required: true },
            slug: { type: 'string', required: true },
            title: { type: 'string' },
            content: { type: 'string' },
            updatedAt: { type: 'string' },
          },
        },
        render: (_args, value) =>
          value.found
            ? [{ type: 'text', text: `# ${value.title}\n\n${value.content}` }]
            : [{ type: 'text', text: `未找到记忆 \`${value.slug}\`。` }],
      },
      async execute(args, exec) {
        if (deniedByAccess(exec)) throw new Error(DENY_TEXT)
        const slug = slugify(args.slug)
        const found = (await readAll()).find((entry) => entry.slug === slug)
        if (!found) return { found: false, slug }
        return { found: true, slug, title: found.title, content: found.content, updatedAt: found.updatedAt }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'memory_list',
      description: '列出全局记忆。默认只返回索引；full=true 时返回完整正文。',
      parameters: {
        full: { type: 'boolean', description: '是否返回完整正文，默认 false。' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            total: { type: 'integer', required: true },
            entries: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  slug: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  summary: { type: 'string' },
                  content: { type: 'string' },
                  updatedAt: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value) =>
          value.total === 0
            ? [{ type: 'text', text: '暂无记忆。' }]
            : [
                {
                  type: 'text',
                  text: value.entries
                    .map((entry) => `- [\`${entry.slug}\`] ${entry.title}${entry.content ? `\n\n${entry.content}` : ''}`)
                    .join('\n\n'),
                },
              ],
      },
      async execute(args, exec) {
        if (deniedByAccess(exec)) throw new Error(DENY_TEXT)
        const entries = await readAll()
        return {
          total: entries.length,
          entries: entries.map((entry) => ({
            slug: entry.slug,
            title: entry.title,
            summary: entry.summary,
            ...(args.full === true ? { content: entry.content } : {}),
            updatedAt: entry.updatedAt,
          })),
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'memory_delete',
      description: '删除一条全局记忆。',
      parameters: {
        slug: { type: 'string', required: true, description: '记忆标识。' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            removed: { type: 'boolean', required: true },
            total: { type: 'integer', required: true },
          },
        },
        render: (_args, value) => [
          { type: 'text', text: value.removed ? `已删除；当前共 ${value.total} 条。` : '未找到该记忆。' },
        ],
      },
      async execute(args, exec) {
        if (deniedByAccess(exec)) throw new Error(DENY_TEXT)
        const entries = await readAll()
        const slug = slugify(args.slug)
        const next = entries.filter((entry) => entry.slug !== slug)
        const removed = next.length !== entries.length
        if (removed) await writeAll(next)
        return { removed, total: next.length }
      },
    }),
  )

  /* ---------------- 索引注入 ---------------- */

  /**
   * 注入方式说明（重要，别再改回 agent.inject）：
   *
   * 早期用 `agent.inject()` 把索引当作一条**用户消息**塞进收件箱。
   * 那会造成一个真实故障：模型本步已经答完、本轮本该结束，但收件箱里还有这条消息，
   * 驱动于是再跑一轮，模型看到"新消息"又回一段（例如"我注意到这是系统注入的记忆索引"），
   * 表现为「答完之后又自言自语一段才停」，而且多烧一轮 token。
   *
   * 改用 `systemPrompt.context()`：它被装配进每步的**运行时上下文**（和
   * "Current runtime context" 同一层），既不会变成用户消息、也不会触发额外轮次。
   * 每步重新求值，因此内容变化会自然反映到下一次装配，无需自己记账。
   */
  ctx.on('agent/created', async ({ agent }) => {
    const key = sessionKeyOf(agent)
    if (key === undefined) return

    // 关键：装配发生在 pre-step 之前，所以这里必须**先把文本算好**，
    // 否则第一次装配拿到空字符串，模型就会以为"没有记忆"。
    await refreshIndex(key)

    try {
      const systemPrompt = agent.ctx.systemPrompt ?? agent.ctx.get?.('systemPrompt')
      if (systemPrompt === undefined || typeof systemPrompt.context !== 'function') return

      const dispose = systemPrompt.context({
        name: 'dsh-memory:index',
        order: 200,
        // provider 必须同步：读缓存，由 refreshIndex 负责更新。
        text: () => (accessOf(key) === ACCESS_AUTO ? (indexTextBySession.get(key) ?? '') : ''),
      })
      contextDisposers.set(key, dispose)
    } catch {
      /* 注入失败绝不影响对话 */
    }
  })

  /**
   * 刷新时机说明（踩过坑的结论，改之前请先读）：
   *
   * agent-loop 的顺序是：
   *     1. systemPrompt.assemble(...)     ← 装配，读 context 的 text provider
   *     2. dispatch('agent/pre-step')     ← 之后才触发 pre-step
   *
   * 所以**不能在 pre-step 里刷新缓存**：那时本步已经装配完，刷新只对下一步生效，
   * 表现为"模型总看到上一轮的记忆"。
   *
   * turn/start 作为 session 事件在装配之前落库，因此在这里刷新正好赶上本轮装配。
   */
  ctx.on('session/event', async (session, event) => {
    if (event?.type !== 'turn/start') return
    try {
      const key = session?.id ?? session
      if (key !== undefined) await refreshIndex(key)
    } catch {
      /* 刷新失败不影响对话 */
    }
  })

  ctx.on('agent/disposed', ({ agent }) => {
    const key = sessionKeyOf(agent)
    if (key === undefined) return
    const dispose = contextDisposers.get(key)
    if (typeof dispose === 'function') {
      try {
        dispose()
      } catch {
        /* 忽略 */
      }
    }
    contextDisposers.delete(key)
    indexTextBySession.delete(key)
    accessBySession.delete(key)
  })

  /* ---------------- UI 路由 ---------------- */

  const disposers = []

  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-memory/entries',
      handler: async (req, res) => {
        try {
          if (req.method === 'POST' || req.method === 'PUT') {
            const parsed = JSON.parse((await readBody(req)) || '{}')
            const entries = await readAll()

            if (parsed.action === 'delete') {
              const slug = slugify(parsed.slug)
              const next = entries.filter((entry) => entry.slug !== slug)
              await writeAll(next)
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify({ ok: true, entries: next }))
              return
            }

            const { next } = upsert(entries, parsed)
            await writeAll(next)
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify({ ok: true, entries: next }))
            return
          }

          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: true, entries: await readAll() }))
        } catch (error) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }))
        }
      },
    }),
  )

  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-memory/session-pref',
      handler: async (req, res) => {
        try {
          // GET 也要能读状态：sessionId 从查询串取，POST 从 body 取。
          const url = new URL(req.url ?? '/', 'http://localhost')
          const queryKey = url.searchParams.get('sessionId') ?? ''
          const parsed = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : {}
          const key = String(parsed.sessionId || queryKey)
          if (req.method === 'POST' && key) {
            // 全局关闭时，会话级三态一律无效：不允许在单个对话里把全局关掉的东西重新打开。
            if (!globalMemoryEnabled) {
              res.writeHead(409, JSON_HEADERS)
              res.end(JSON.stringify({
                ok: false,
                error: '记忆已在设置里全局关闭，请先到「设置 → 记忆与提示词」重新开启。',
                access: ACCESS_OFF,
                global: false,
                locked: true,
              }))
              return
            }
            // 三态：auto / manual / off；也兼容旧的 disabled 布尔写法。
            if (typeof parsed.access === 'string') {
              accessBySession.set(key, normalizeAccess(parsed.access))
            } else if (parsed.disabled === true) {
              accessBySession.set(key, ACCESS_OFF)
            } else if (parsed.disabled === false) {
              accessBySession.set(key, ACCESS_AUTO)
            }
            // 切换后立即重算该会话的索引文本（下一步装配即反映新状态）。
            void refreshIndex(key)
          }
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({
            ok: true,
            access: key ? accessOf(key) : (globalMemoryEnabled ? ACCESS_AUTO : ACCESS_OFF),
            global: globalMemoryEnabled,
            locked: !globalMemoryEnabled,
          }))
        } catch (error) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }))
        }
      },
    }),
  )

  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-memory/global',
      handler: async (req, res) => {
        try {
          if (req.method === 'POST' || req.method === 'PUT') {
            const parsed = JSON.parse((await readBody(req)) || '{}')
            // 保留 prefs，只改 enabled —— 之前这里整体覆盖，把 prefs 抹掉了。
            saveGlobalCfg({ ...loadGlobalCfg(), enabled: parsed.enabled !== false, prefs })
            // 全局开关变了：所有会话的缓存文本作废，下一步重新计算。
            for (const sessionKey of contextDisposers.keys()) void refreshIndex(sessionKey)
          }
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: true, enabled: globalMemoryEnabled }))
        } catch (error) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }))
        }
      },
    }),
  )

  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-memory/prefs',
      handler: async (req, res) => {
        try {
          if (req.method === 'POST' || req.method === 'PUT') {
            const parsed = JSON.parse((await readBody(req)) || '{}')
            prefs = normalizePrefs({ ...prefs, ...parsed })
            saveGlobalCfg({
              ...loadGlobalCfg(),
              enabled: globalMemoryEnabled,
              prefs,
            })
            // 偏好变了（详细程度/条数/时机）：所有会话的缓存文本重算。
            for (const sessionKey of contextDisposers.keys()) void refreshIndex(sessionKey)
          }
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: true, prefs }))
        } catch (error) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }))
        }
      },
    }),
  )

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* 卸载期忽略 */
      }
    }
  })
}
