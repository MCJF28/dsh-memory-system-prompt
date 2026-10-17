/**
 * dsh-system-prompt —— Host 半区
 *
 * 用户在设置里写一段全局提示词，它会被装配进**每一个**对话的系统提示。
 *
 * 实现要点
 * --------
 * - `ctx.systemPrompt.section()` 注册 section；`text` provider 必须同步，
 *   所以正文缓存在内存 `currentPrompt`：启动时同步读盘，写入时同步更新缓存。
 * - section 注册在**该 agent 自己的 ctx** 上（`agent.ctx`），scope 过滤让它只作用于
 *   这个 agent，disposal 时自动清理，且能按会话决定装不装。
 * - 「本对话禁用」存 Host 的 session 集合；切换时对该 agent 重装 section。
 *
 * 诊断：apply() 各阶段都写 ~/.dsh/system-prompt/diag.json。
 * Cordis 中 apply 抛错会表现为「插件静默不加载」，没有落盘日志很难归因。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// 原 dsh-system-prompt 插件，已并入 dsh-memory；对外仍用 dsh-memory 这一个包名。

// inject 由 dsh-memory 统一声明：['tools', 'webServer']

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROMPT_DIR = join(DSH_HOME, 'system-prompt')
const PROMPT_FILE = join(PROMPT_DIR, 'prompt.md')
const DIAG_FILE = join(PROMPT_DIR, 'diag.json')

const SECTION_NAME = 'user:global-system-prompt'
const SECTION_ORDER = 100

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }

const SETTINGS_FILE = join(PROMPT_DIR, 'settings.json')

let currentPrompt = loadSync()

/** 全局总开关：设置页控制；关闭时任何会话都不注入。 */
let globalEnabled = loadSettings().enabled !== false
/** 注入位置：'system' 系统提示词 section / 'context' 每轮动态上下文。 */
let promptPosition = loadSettings().promptPosition === 'context' ? 'context' : 'system'
/** 风格档位：会被拼进最终提示词文本，真实生效。 */
let style = loadSettings().style && typeof loadSettings().style === 'object' ? loadSettings().style : {}

/**
 * 风格档位定义。每一项都是「明确的行为指令」，拼成一段简短文字追加到用户提示词之后。
 * 之所以用指令而不是「参数」，是因为这里是提示词层，模型只认得文字。
 */
const STYLE_ITEMS = [
  {
    key: 'tone',
    label: '基础风格和语气',
    options: { professional: '专业可靠', friendly: '亲切随和', direct: '直接简洁' },
    prompt: { professional: '保持专业、准确、可靠的语气。', friendly: '保持亲切、随和的语气。', direct: '保持直接、简洁的语气，不说客套话。' },
  },
  {
    key: 'warmth',
    label: '亲切程度',
    options: { less: '减弱', normal: '默认', more: '增强' },
    prompt: { less: '少用寒暄和共情表达。', normal: '', more: '可以多一些共情与鼓励。' },
  },
  {
    key: 'enthusiasm',
    label: '热情程度',
    options: { less: '减弱', normal: '默认', more: '增强' },
    prompt: { less: '语气克制，不用感叹号。', normal: '', more: '语气可以更热情一些。' },
  },
  {
    key: 'emoji',
    label: '表情符号',
    options: { none: '不用', less: '减弱', normal: '默认', more: '增强' },
    prompt: { none: '完全不使用表情符号。', less: '尽量少用表情符号。', normal: '', more: '可以适度使用表情符号。' },
  },
  {
    key: 'visual',
    label: '可视化回答',
    options: { less: '减弱', normal: '默认', more: '增强' },
    prompt: { less: '尽量用文字说清，少画表格与图。', normal: '', more: '适合时用表格或结构化图示表达。' },
  },
  {
    key: 'headings',
    label: '标题和列表',
    options: { less: '减弱', normal: '默认', more: '增强' },
    prompt: { less: '少用标题和列表，尽量写成连贯段落。', normal: '', more: '多用标题和列表组织内容，便于扫读。' },
  },
  {
    key: 'quickAnswer',
    label: '快速回答',
    options: { off: '关闭', on: '开启' },
    prompt: { off: '', on: '如果已有把握，可以先给出结论再补充说明，不要过度铺垫。' },
  },
  {
    key: 'suggestions',
    label: '提示词建议',
    options: { off: '关闭', on: '开启' },
    prompt: { off: '', on: '回答结束时，如果合适，给出一两条可以继续追问的方向。' },
  },
  {
    key: 'verbosity',
    label: '回答长度',
    options: { brief: '简短', normal: '默认', detailed: '详细' },
    prompt: { brief: '尽量简短，只给必要信息。', normal: '', detailed: '尽量解释清楚背景与取舍。' },
  },
]

/** 把风格档位拼成一段指令文本；全部为默认时返回空串。 */
function renderStyle() {
  const lines = []
  for (const item of STYLE_ITEMS) {
    const chosen = style[item.key]
    const text = chosen && item.prompt[chosen]
    if (text) lines.push(`- ${text}`)
  }
  if (lines.length === 0) return ''
  return ['<用户偏好>', ...lines, '</用户偏好>'].join('\n')
}


function loadSettings() {
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveSettings(next) {
  try {
    mkdirSync(PROMPT_DIR, { recursive: true })
    writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8')
    globalEnabled = next.enabled !== false
    promptPosition = next.promptPosition === 'context' ? 'context' : 'system'
    style = next.style && typeof next.style === 'object' ? next.style : {}
  } catch {
    /* 写盘失败不影响对话 */
  }
}

/** 真正注入的文本：用户提示词 + 风格档位。 */
function renderPrompt() {
  const parts = []
  if (currentPrompt.trim()) parts.push(currentPrompt.trim())
  const styleText = renderStyle()
  if (styleText) parts.push(styleText)
  return parts.join('\n\n')
}

const disabledSessions = new Set()
const sectionDisposers = new Map()
const diagSteps = []

function diag(step, detail) {
  diagSteps.push({ step, detail: detail === undefined ? null : String(detail), at: new Date().toISOString() })
  try {
    mkdirSync(PROMPT_DIR, { recursive: true })
    writeFileSync(DIAG_FILE, JSON.stringify({ steps: diagSteps }, null, 2), 'utf8')
  } catch {
    /* 诊断不能影响主流程 */
  }
}

function loadSync() {
  try {
    return readFileSync(PROMPT_FILE, 'utf8')
  } catch {
    return ''
  }
}

function saveSync(text) {
  mkdirSync(PROMPT_DIR, { recursive: true })
  writeFileSync(PROMPT_FILE, text, 'utf8')
  currentPrompt = text
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function sessionKeyOf(agent) {
  const session = agent?.session
  if (!session) return undefined
  return session.id ?? session
}

export function apply(ctx) {
  diag('apply-enter')

  function installFor(agent) {
    const key = sessionKeyOf(agent)
    if (key === undefined) return

    const previous = sectionDisposers.get(key)
    if (typeof previous === 'function') {
      try {
        previous()
      } catch {
        /* 忽略 */
      }
      sectionDisposers.delete(key)
    }

    // 全局关闭，或本对话关闭 → 不装 section。
    if (!globalEnabled || disabledSessions.has(key)) return

    // systemPrompt 通过运行时获取，不作为硬 inject：某些装配下它不在注入解析表里，
    // 硬 inject 会让插件一直等待而不激活（表现为静默不加载）。
    const systemPrompt = agent.ctx.systemPrompt ?? agent.ctx.get?.('systemPrompt')
    if (!systemPrompt) {
      diag('systemPrompt-unavailable', key)
      return
    }

    // 注入位置：'system' 用系统提示词 section（语气更强）；
    // 'context' 用每轮动态上下文（更容易被后续对话覆盖，但改完立刻可见）。
    const useContext = promptPosition === 'context'

    if (useContext) {
      if (typeof systemPrompt.context !== 'function') {
        diag('context-unavailable', key)
        return
      }
      const dispose = systemPrompt.context({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        text: () => renderPrompt(),
      })
      sectionDisposers.set(key, dispose)
      return
    }

    if (typeof systemPrompt.section !== 'function') {
      diag('section-unavailable', key)
      return
    }

    const dispose = systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text: () => renderPrompt(),
      interpolate: false,
    })
    sectionDisposers.set(key, dispose)
  }

  /* ---- 路由 ---- */
  try {
    const disposers = [
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-system-prompt/text',
        handler: async (req, res) => {
          try {
            if (req.method === 'POST' || req.method === 'PUT') {
              const parsed = JSON.parse((await readBody(req)) || '{}')
              saveSync(String(parsed.text ?? ''))
              res.writeHead(200, JSON_HEADERS)
              res.end(JSON.stringify({ ok: true, text: currentPrompt }))
              return
            }
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify({ ok: true, text: currentPrompt }))
          } catch (error) {
            res.writeHead(400, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }))
          }
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-system-prompt/session-pref',
        handler: async (req, res) => {
          try {
            // GET 也要能读状态：sessionId 从查询串取，POST 从 body 取。
            const url = new URL(req.url ?? '/', 'http://localhost')
            const queryKey = url.searchParams.get('sessionId') ?? ''
            const parsed = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : {}
            const key = String(parsed.sessionId || queryKey)
            if (req.method === 'POST' && key) {
              // 全局关闭时，会话级开关一律无效：不允许在单个对话里把全局关掉的东西重新打开。
              if (!globalEnabled) {
                res.writeHead(409, JSON_HEADERS)
                res.end(JSON.stringify({
                  ok: false,
                  error: '系统提示词已在设置里全局关闭，请先到「设置 → 记忆与提示词」重新开启。',
                  global: false,
                  disabled: true,
                  locked: true,
                }))
                return
              }
              if (parsed.disabled === true) disabledSessions.add(key)
              else disabledSessions.delete(key)
              const agent = ctx.get('agents')?.get?.(key)
              if (agent) installFor(agent)
            }
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify({
              ok: true,
              disabled: !globalEnabled || (key ? disabledSessions.has(key) : false),
              global: globalEnabled,
              locked: !globalEnabled,
            }))
          } catch (error) {
            res.writeHead(400, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }))
          }
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-system-prompt/global',
        handler: async (req, res) => {
          try {
            if (req.method === 'POST' || req.method === 'PUT') {
              const parsed = JSON.parse((await readBody(req)) || '{}')
              const current = loadSettings()
              saveSettings({
                ...current,
                enabled: parsed.enabled !== false,
                ...(typeof parsed.promptPosition === 'string' ? { promptPosition: parsed.promptPosition } : {}),
                ...(parsed.style && typeof parsed.style === 'object' ? { style: parsed.style } : {}),
              })
              // 立即应用到所有在线会话（开关、注入位置、风格都可能变了，需要重装）。
              for (const agent of ctx.get('agents')?.list?.() ?? []) {
                try {
                  installFor(agent)
                } catch {
                  /* 单个会话失败不阻断其它 */
                }
              }
            }
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify({ ok: true, enabled: globalEnabled, promptPosition, style, items: STYLE_ITEMS }))
          } catch (error) {
            res.writeHead(400, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }))
          }
        },
      }),
    ]
    diag('routes-installed', disposers.length)

    ctx.effect(() => () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          /* 忽略 */
        }
      }
      for (const dispose of sectionDisposers.values()) {
        try {
          dispose()
        } catch {
          /* 忽略 */
        }
      }
      sectionDisposers.clear()
    })
  } catch (error) {
    diag('routes-FAILED', error && error.stack ? error.stack : error)
    throw error
  }

  /* ---- agent 生命周期 ---- */
  try {
    ctx.on('agent/created', ({ agent }) => {
      try {
        installFor(agent)
        diag('agent-created-installed', sessionKeyOf(agent))
      } catch (error) {
        diag('agent-created-FAILED', error && error.stack ? error.stack : error)
      }
    })

    ctx.on('agent/disposed', ({ agent }) => {
      const key = sessionKeyOf(agent)
      if (key === undefined) return
      const dispose = sectionDisposers.get(key)
      if (typeof dispose === 'function') {
        try {
          dispose()
        } catch {
          /* 忽略 */
        }
      }
      sectionDisposers.delete(key)
      disabledSessions.delete(key)
    })

    diag('listeners-registered')
  } catch (error) {
    diag('listeners-FAILED', error && error.stack ? error.stack : error)
    throw error
  }
}
