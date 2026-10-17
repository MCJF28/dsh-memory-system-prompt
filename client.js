/**
 * dsh-memory —— Client 半区
 *
 * 两个槽位：
 *   1. settings.section  「记忆与提示词」——合并页，按 ChatGPT 的分层组织：
 *        主页只有行式开关 + 两个二级入口（管理记忆 / 编辑提示词）
 *        二级页才出现填写表单
 *   2. conversation.input.left  「记忆」按钮——本对话三态开关
 *
 * 一律使用宿主的 --dsw-radius-* / --dsw-alias-* 变量，不自造颜色。
 */

window.__ModuleLoader__.load({
  id: 'dsh-memory',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React

    const CSS = `
.dshmp-root{display:flex;flex-direction:column;gap:20px;font-size:14px;color:var(--dsw-alias-label-primary);max-width:680px}
.dshmp-head{display:flex;flex-direction:column;gap:4px}
.dshmp-title{font-size:16px;font-weight:600;line-height:24px}
.dshmp-desc{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dshmp-card{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.dshmp-row{display:flex;align-items:center;gap:16px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dshmp-row:last-child{border-bottom:0}
.dshmp-row-main{flex:1;min-width:0}
.dshmp-row-title{font-size:14px;font-weight:500;line-height:22px}
.dshmp-row-sub{margin-top:2px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dshmp-switch{position:relative;flex:none;width:40px;height:24px;border-radius:999px;border:0;padding:0;cursor:pointer;background:var(--dsw-alias-border-l2);transition:background-color .15s}
.dshmp-switch[aria-checked="true"]{background:var(--dsw-alias-state-business-primary)}
.dshmp-switch:disabled{opacity:.5;cursor:default}
.dshmp-knob{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:999px;background:#fff;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.dshmp-switch[aria-checked="true"] .dshmp-knob{transform:translateX(16px)}
.dshmp-open{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dshmp-open:last-child{border-bottom:0}
.dshmp-open:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshmp-chev{margin-left:auto;flex:none;color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1}
.dshmp-secondary{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--dsw-alias-label-secondary);line-height:20px;flex-wrap:wrap}
.dshmp-back{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;cursor:pointer}
.dshmp-back:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dshmp-sel-root{position:relative;flex:none}
.dshmp-select{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px 0 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;font-weight:500;line-height:20px;cursor:pointer;white-space:nowrap;transition:background-color .1s,border-color .1s}
.dshmp-select:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshmp-select:disabled{opacity:.5;cursor:default}
.dshmp-select-text{max-width:180px;overflow:hidden;text-overflow:ellipsis}
.dshmp-select-chev{font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary);transform:translateY(-1px)}
/*
 * 下拉面板用 fixed 定位，脱离父级 overflow 的裁剪。
 * 之前用 absolute 挂在按钮下方，而设置卡片普遍带圆角 + overflow:hidden，
 * 面板一开就被切掉一半（截图里只剩顶上一条）。坐标由组件按按钮位置实时算。
 */
.dshmp-sel-panel{position:fixed;z-index:1200;max-height:min(320px,60vh);overflow-y:auto;padding:6px;border-radius:var(--dsw-radius-panel);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-elevation-soft);display:flex;flex-direction:column;gap:1px;animation:dshmp-pop .12s ease-out}
@keyframes dshmp-pop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.dshmp-sel-item{appearance:none;display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer;white-space:nowrap}
.dshmp-sel-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshmp-sel-item[aria-selected="true"]{background:var(--dsw-alias-interactive-bg-hover)}
.dshmp-sel-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.dshmp-sel-check{flex:none;font-size:13px;color:var(--dsw-alias-label-primary)}
.dshmp-field{display:flex;flex-direction:column;gap:6px}
.dshmp-label{font-size:13px;font-weight:500;line-height:20px}
.dshmp-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dshmp-input,.dshmp-area{width:100%;box-sizing:border-box;background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);padding:8px 12px;font-size:14px;font-family:inherit;line-height:22px;outline:none;transition:border-color .1s}
.dshmp-input:focus,.dshmp-area:focus{border-color:var(--dsw-alias-state-business-primary)}
.dshmp-area{resize:vertical;min-height:180px}
.dshmp-area.mono{font-family:ui-monospace,Consolas,monospace;font-size:13px;line-height:1.7}
.dshmp-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dshmp-btn{appearance:none;height:32px;padding:0 14px;border:0;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;font-weight:500;cursor:pointer;transition:background-color .1s}
.dshmp-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}
.dshmp-btn:disabled{opacity:.5;cursor:default}
.dshmp-btn.primary{background:var(--dsw-alias-button-info-fill);color:#fff}
.dshmp-btn.primary:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}
.dshmp-btn.ghost{background:transparent;color:var(--dsw-alias-label-secondary)}
.dshmp-btn.ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dshmp-btn.danger{background:transparent;color:var(--dsw-alias-state-error-primary)}
.dshmp-btn.danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshmp-msg{font-size:13px;line-height:20px}
.dshmp-msg.err{color:var(--dsw-alias-state-error-primary)}
.dshmp-msg.ok{color:var(--dsw-alias-state-success-primary)}
.dshmp-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-panel);overflow:hidden;max-height:340px;overflow-y:auto}
.dshmp-entry{display:flex;flex-direction:column;gap:2px;padding:12px 16px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dshmp-entry:last-child{border-bottom:0}
.dshmp-entry:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshmp-entry[data-sel="true"]{background:var(--dsw-alias-interactive-bg-hover);box-shadow:inset 2px 0 0 var(--dsw-alias-state-business-primary)}
.dshmp-entry-title{font-size:14px;font-weight:500;line-height:22px}
.dshmp-entry-sum{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshmp-empty{padding:24px 16px;text-align:center;font-size:13px;color:var(--dsw-alias-label-secondary)}
`

    async function callJson(path, body) {
      const init = body === undefined
        ? { method: 'GET' }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      const response = await fetch(path, init)
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`)
      return data
    }

    /**
     * 跨槽位状态广播。
     * 设置页与输入框按钮是两个独立的 slot entry，各自只在自己挂载时读一次状态，
     * 所以设置页改了全局开关，输入框那边完全不知道 —— 这就是「必须重启才生效」的原因。
     * 这里用一个模块级事件源在两者之间同步：任一方写入后广播，另一方立即重读。
     */
    const changeListeners = new Set()

    function notifyChanged() {
      for (const listener of changeListeners) {
        try {
          listener()
        } catch {
          /* 单个监听器失败不影响其它 */
        }
      }
    }

    function subscribeChanged(listener) {
      changeListeners.add(listener)
      return () => changeListeners.delete(listener)
    }

    /* ---------- 共用控件 ---------- */

    function Switch(props) {
      return h('button', {
        type: 'button',
        role: 'switch',
        className: 'dshmp-switch',
        'aria-checked': props.checked ? 'true' : 'false',
        'aria-label': props.label,
        disabled: props.disabled,
        onClick: props.onChange,
      }, h('span', { className: 'dshmp-knob' }))
    }

    function Row(props) {
      return h('div', { className: 'dshmp-row' },
        h('div', { className: 'dshmp-row-main' },
          h('div', { className: 'dshmp-row-title' }, props.title),
          props.sub ? h('div', { className: 'dshmp-row-sub' }, props.sub) : null
        ),
        props.right
      )
    }

    /**
     * 下拉选择器（自制，不用原生 <select>）。
     *
     * 原生 select 的弹出列表由操作系统绘制，绕不过主题，深色模式下会出现白底蓝高亮，
     * 与宿主外观割裂。这里自己画按钮 + 浮层，全部使用 --dsw-* 变量。
     */
    function Select(props) {
      const [open, setOpen] = useState(false)
      const [pos, setPos] = useState(null)
      const rootRef = React.useRef(null)

      /**
       * 按按钮的实际位置算出固定定位坐标。
       *
       * 面板用 fixed 是为了跳出父级 overflow 的裁剪；代价是坐标要自己算，
       * 并且在滚动 / 改窗口大小时重算，否则会跟按钮脱节。
       * 下方空间不足时向上弹，避免贴着视口底部被切。
       */
      const place = React.useCallback(() => {
        const root = rootRef.current
        if (root === null) return
        const rect = root.getBoundingClientRect()
        const width = Math.max(rect.width, 180)
        const below = window.innerHeight - rect.bottom
        const openUp = below < 240 && rect.top > below
        setPos({
          left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
          width,
          ...(openUp
            ? { bottom: window.innerHeight - rect.top + 6 }
            : { top: rect.bottom + 6 }),
        })
      }, [])

      useEffect(() => {
        if (!open) return undefined
        place()
        const onDown = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        // capture: true 才能收到内层滚动容器的滚动事件。
        window.addEventListener('scroll', place, true)
        window.addEventListener('resize', place)
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          window.removeEventListener('scroll', place, true)
          window.removeEventListener('resize', place)
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open, place])

      const current = props.options.find((option) => option.value === props.value) ?? props.options[0]

      return h('div', { className: 'dshmp-sel-root', ref: rootRef },
        h('button', {
          type: 'button',
          className: 'dshmp-select',
          disabled: props.disabled,
          'aria-label': props.label,
          'aria-haspopup': 'listbox',
          'aria-expanded': open,
          onClick: () => setOpen((value) => !value),
        },
          h('span', { className: 'dshmp-select-text' }, current ? current.label : ''),
          h('span', { className: 'dshmp-select-chev' }, '⌄')
        ),
        open && pos !== null ? h('div', {
          className: 'dshmp-sel-panel',
          role: 'listbox',
          style: pos,
        },
          props.options.map((option) => h('button', {
            key: option.value,
            type: 'button',
            role: 'option',
            className: 'dshmp-sel-item',
            'aria-selected': option.value === props.value ? 'true' : 'false',
            onClick: () => {
              setOpen(false)
              props.onChange(option.value)
            },
          },
            h('span', { className: 'dshmp-sel-label' }, option.label),
            option.value === props.value ? h('span', { className: 'dshmp-sel-check' }, '✓') : null
          ))
        ) : null
      )
    }

    /* ---------- 二级页：记忆管理 ---------- */

    function MemoryManager(props) {
      const [entries, setEntries] = useState([])
      const [selected, setSelected] = useState(null)
      const [title, setTitle] = useState('')
      const [content, setContent] = useState('')
      const [busy, setBusy] = useState(false)
      const [message, setMessage] = useState(null)

      const refresh = useCallback(async () => {
        try {
          const data = await callJson('/dsh-memory/entries')
          setEntries(Array.isArray(data.entries) ? data.entries : [])
        } catch (error) {
          setMessage({ kind: 'err', text: `读取失败：${String(error.message || error)}` })
        }
      }, [])

      useEffect(() => { void refresh() }, [refresh])

      const pick = (entry) => {
        setSelected(entry.slug)
        setTitle(entry.title || '')
        setContent(entry.content || '')
        setMessage(null)
      }

      const startNew = () => {
        setSelected(null)
        setTitle('')
        setContent('')
        setMessage(null)
      }

      const save = async () => {
        if (!title.trim() || !content.trim()) {
          setMessage({ kind: 'err', text: '标题和内容都不能为空。' })
          return
        }
        setBusy(true)
        try {
          // 用户只填标题与内容；slug 与摘要由 Host 自动派生。
          await callJson('/dsh-memory/entries', { slug: selected || undefined, title, content })
          await refresh()
          setMessage({ kind: 'ok', text: '已保存。' })
        } catch (error) {
          setMessage({ kind: 'err', text: `保存失败：${String(error.message || error)}` })
        } finally {
          setBusy(false)
        }
      }

      const remove = async () => {
        if (!selected) return
        setBusy(true)
        try {
          await callJson('/dsh-memory/entries', { action: 'delete', slug: selected })
          startNew()
          await refresh()
          setMessage({ kind: 'ok', text: '已删除。' })
        } catch (error) {
          setMessage({ kind: 'err', text: `删除失败：${String(error.message || error)}` })
        } finally {
          setBusy(false)
        }
      }

      return h('div', { className: 'dshmp-root' },
        h('style', null, CSS),
        h('div', { className: 'dshmp-actions' },
          h('button', { className: 'dshmp-back', onClick: props.onBack }, '‹ 返回'),
          h('span', { style: { flex: 1 } }),
          h('button', { className: 'dshmp-btn ghost', onClick: startNew }, '新建'),
          h('button', { className: 'dshmp-btn ghost', onClick: () => void refresh(), disabled: busy }, '刷新')
        ),

        h('div', { className: 'dshmp-head' },
          h('div', { className: 'dshmp-title' }, '已保存的记忆'),
          h('div', { className: 'dshmp-desc' }, `共 ${entries.length} 条。点击可编辑，点「新建」写一条新的。`)
        ),

        h('div', { className: 'dshmp-list' },
          entries.length === 0
            ? h('div', { className: 'dshmp-empty' }, '还没有记忆。')
            : entries.map((entry) => h('button', {
                key: entry.slug,
                type: 'button',
                className: 'dshmp-entry',
                'data-sel': selected === entry.slug ? 'true' : 'false',
                onClick: () => pick(entry),
              },
                h('div', { className: 'dshmp-entry-title' }, entry.title || entry.slug),
                h('div', { className: 'dshmp-entry-sum' }, entry.summary || entry.content || '')
              ))
        ),

        h('div', { className: 'dshmp-field' },
          h('label', { className: 'dshmp-label' }, '标题'),
          h('input', {
            className: 'dshmp-input',
            value: title,
            placeholder: '这条记忆是关于什么的？',
            onChange: (event) => setTitle(event.target.value),
          })
        ),

        h('div', { className: 'dshmp-field' },
          h('label', { className: 'dshmp-label' }, '内容'),
          h('textarea', {
            className: 'dshmp-area',
            value: content,
            placeholder: '把希望 AI 一直记住的事情写在这里。',
            onChange: (event) => setContent(event.target.value),
          }),
          h('div', { className: 'dshmp-hint' }, '标识与摘要会自动生成，不用手填。')
        ),

        h('div', { className: 'dshmp-actions' },
          h('button', { className: 'dshmp-btn primary', onClick: () => void save(), disabled: busy }, '保存'),
          selected
            ? h('button', { className: 'dshmp-btn danger', onClick: () => void remove(), disabled: busy }, '删除这条')
            : null,
          message
            ? h('span', { className: `dshmp-msg ${message.kind}` }, message.text)
            : null
        )
      )
    }

    /* ---------- 二级页：编辑系统提示词 ---------- */

    function PromptEditor(props) {
      const [text, setText] = useState('')
      const [saved, setSaved] = useState('')
      const [busy, setBusy] = useState(false)
      const [message, setMessage] = useState(null)

      const refresh = useCallback(async () => {
        try {
          const data = await callJson('/dsh-system-prompt/text')
          const value = typeof data.text === 'string' ? data.text : ''
          setText(value)
          setSaved(value)
          setMessage(null)
        } catch (error) {
          setMessage({ kind: 'err', text: `读取失败：${String(error.message || error)}` })
        }
      }, [])

      useEffect(() => { void refresh() }, [refresh])

      const save = async () => {
        setBusy(true)
        try {
          const data = await callJson('/dsh-system-prompt/text', { text })
          const value = typeof data.text === 'string' ? data.text : text
          setSaved(value)
          setMessage({ kind: 'ok', text: '已保存，下一个 step 起生效。' })
        } catch (error) {
          setMessage({ kind: 'err', text: `保存失败：${String(error.message || error)}` })
        } finally {
          setBusy(false)
        }
      }

      const clear = async () => {
        setBusy(true)
        try {
          await callJson('/dsh-system-prompt/text', { text: '' })
          setText('')
          setSaved('')
          setMessage({ kind: 'ok', text: '已清空。' })
        } catch (error) {
          setMessage({ kind: 'err', text: `清空失败：${String(error.message || error)}` })
        } finally {
          setBusy(false)
        }
      }

      const dirty = text !== saved

      return h('div', { className: 'dshmp-root' },
        h('style', null, CSS),
        h('div', { className: 'dshmp-actions' },
          h('button', { className: 'dshmp-back', onClick: props.onBack }, '‹ 返回')
        ),

        h('div', { className: 'dshmp-head' },
          h('div', { className: 'dshmp-title' }, '系统提示词'),
          h('div', { className: 'dshmp-desc' },
            '对所有对话生效，位于人格设定之后、工具说明之前。留空则完全不注入。')
        ),

        h('textarea', {
          className: 'dshmp-area mono',
          value: text,
          placeholder: '例如：\n- 始终用简体中文回答\n- 给代码时先说明思路，再给完整可运行片段\n- 不确定的地方直接说不知道，不要编造',
          onChange: (event) => setText(event.target.value),
        }),

        h('div', { className: 'dshmp-actions' },
          h('button', { className: 'dshmp-btn primary', onClick: () => void save(), disabled: busy || !dirty }, '保存'),
          h('button', { className: 'dshmp-btn ghost', onClick: () => void clear(), disabled: busy || (text === '' && saved === '') }, '清空'),
          h('span', { className: 'dshmp-hint' }, `${text.length} 字符`),
          dirty ? h('span', { className: 'dshmp-hint' }, '有未保存的修改') : null,
          message ? h('span', { className: `dshmp-msg ${message.kind}` }, message.text) : null
        )
      )
    }

    /* ---------- 主页：两个开关 + 两个二级入口 ---------- */

    function MemoryAndPrompt(props) {
      const [view, setView] = useState('home')
      const [memEnabled, setMemEnabled] = useState(true)
      const [spEnabled, setSpEnabled] = useState(true)
      const [prefs, setPrefs] = useState({
        indexDetail: 'summary',
        maxEntries: 20,
        injectTiming: 'turn',
        promptPosition: 'system',
      })
      const [styleItems, setStyleItems] = useState([])
      const [style, setStyle] = useState({})
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const [count, setCount] = useState(0)

      // 设置页控制**全局**开关（与输入框按钮的按会话开关并存）。
      const load = useCallback(async () => {
        try {
          const [entries, memGlobal, spGlobal, prefData] = await Promise.all([
            callJson('/dsh-memory/entries'),
            callJson('/dsh-memory/global'),
            callJson('/dsh-system-prompt/global'),
            callJson('/dsh-memory/prefs'),
          ])
          setCount(Array.isArray(entries.entries) ? entries.entries.length : 0)
          setMemEnabled(memGlobal.enabled !== false)
          setSpEnabled(spGlobal.enabled !== false)
          // promptPosition / style 由 dsh-system-prompt 保管，其余三项由 dsh-memory 保管。
          if (spGlobal.items) setStyleItems(spGlobal.items)
          if (spGlobal.style) setStyle(spGlobal.style)
          if (prefData.prefs) {
            setPrefs({
              ...prefData.prefs,
              promptPosition: spGlobal.promptPosition === 'context' ? 'context' : 'system',
            })
          }
          setError(null)
        } catch (e) {
          setError(String(e.message || e))
        }
      }, [])

      useEffect(() => { void load() }, [load])

      const setPref = async (patch) => {
        setBusy(true)
        try {
          const data = await callJson('/dsh-memory/prefs', patch)
          if (data.prefs) setPrefs((prev) => ({ ...prev, ...data.prefs }))
          setError(null)
        } catch (e) {
          setError(String(e.message || e))
        } finally {
          setBusy(false)
        }
      }

      /** 提示词注入位置由 dsh-system-prompt 的 Host 保管，单独走它的路由。 */
      const setPromptPosition = async (next) => {
        setBusy(true)
        try {
          const data = await callJson('/dsh-system-prompt/global', { promptPosition: next })
          setPrefs((prev) => ({ ...prev, promptPosition: data.promptPosition === 'context' ? 'context' : 'system' }))
          setError(null)
        } catch (e) {
          setError(String(e.message || e))
        } finally {
          setBusy(false)
        }
      }

      /** 风格档位：同样由 dsh-system-prompt 保管，会被拼进注入文本。 */
      const setStyleItem = async (key, value) => {
        setBusy(true)
        try {
          const next = { ...style, [key]: value }
          const data = await callJson('/dsh-system-prompt/global', { style: next })
          setStyle(data.style && typeof data.style === 'object' ? data.style : next)
          setError(null)
        } catch (e) {
          setError(String(e.message || e))
        } finally {
          setBusy(false)
        }
      }

      const toggleMem = async () => {
        setBusy(true)
        try {
          const data = await callJson('/dsh-memory/global', { enabled: !memEnabled })
          setMemEnabled(data.enabled !== false)
          notifyChanged()
        } catch (e) {
          setError(String(e.message || e))
        } finally {
          setBusy(false)
        }
      }

      const toggleSp = async () => {
        setBusy(true)
        try {
          const data = await callJson('/dsh-system-prompt/global', { enabled: !spEnabled })
          setSpEnabled(data.enabled !== false)
          notifyChanged()
        } catch (e) {
          setError(String(e.message || e))
        } finally {
          setBusy(false)
        }
      }

      if (view === 'memory') return h(MemoryManager, { onBack: () => { setView('home'); void load() } })
      if (view === 'prompt') return h(PromptEditor, { onBack: () => { setView('home'); void load() } })

      return h('div', { className: 'dshmp-root' },
        h('style', null, CSS),

        h('div', { className: 'dshmp-head' },
          h('div', { className: 'dshmp-title' }, '记忆与提示词'),
          h('div', { className: 'dshmp-desc' },
            '这两项都会在对话时自动带进上下文。这里的开关是全局的，对所有对话生效；',
            '单个对话的临时开关在输入框左侧的「记忆」按钮里。')
        ),

        h('div', { className: 'dshmp-card' },
          h(Row, {
            title: '启用记忆',
            sub: memEnabled
              ? '所有对话都会带上记忆索引。'
              : '已全局关闭：任何对话都不注入索引，AI 也无法读取记忆。',
            right: h(Switch, {
              checked: memEnabled,
              disabled: busy,
              label: '启用记忆',
              onChange: () => void toggleMem(),
            }),
          }),
          h('button', { className: 'dshmp-open', type: 'button', onClick: () => setView('memory') },
            h('div', { className: 'dshmp-row-main' },
              h('div', { className: 'dshmp-row-title' }, '管理记忆'),
              h('div', { className: 'dshmp-row-sub' },
                count === 0 ? '还没有保存任何记忆' : `查看与编辑已保存的 ${count} 条记忆`)
            ),
            h('span', { className: 'dshmp-chev' }, '›')
          )
        ),

        h('div', { className: 'dshmp-card' },
          h(Row, {
            title: '启用系统提示词',
            sub: spEnabled
              ? '所有对话都会带上你编写的提示词。'
              : '已全局关闭：任何对话都不注入系统提示词。',
            right: h(Switch, {
              checked: spEnabled,
              disabled: busy,
              label: '启用系统提示词',
              onChange: () => void toggleSp(),
            }),
          }),
          h('button', { className: 'dshmp-open', type: 'button', onClick: () => setView('prompt') },
            h('div', { className: 'dshmp-row-main' },
              h('div', { className: 'dshmp-row-title' }, '编辑提示词'),
              h('div', { className: 'dshmp-row-sub' }, '对所有对话生效的自定义指令')
            ),
            h('span', { className: 'dshmp-chev' }, '›')
          )
        ),

        h('div', { className: 'dshmp-secondary' },
          '存放在 ',
          h('code', null, '~/.dsh/memory/entries.json'),
          ' 与 ',
          h('code', null, '~/.dsh/system-prompt/prompt.md'),
          '。'
        ),

        h('div', { className: 'dshmp-head' },
          h('div', { className: 'dshmp-title', style: { fontSize: 14 } }, '注入偏好'),
          h('div', { className: 'dshmp-desc' }, '这些选项直接改变实际注入的内容与时机。')
        ),

        h('div', { className: 'dshmp-card' },
          h(Row, {
            title: '索引详细程度',
            sub: '索引里每条记忆显示多少内容。越简略越省上下文。',
            right: h(Select, {
              value: prefs.indexDetail,
              disabled: busy,
              label: '索引详细程度',
              options: [
                { value: 'title', label: '仅标题' },
                { value: 'summary', label: '标题 + 摘要' },
              ],
              onChange: (next) => void setPref({ indexDetail: next }),
            }),
          }),
          h(Row, {
            title: '索引条数上限',
            sub: '最多列出多少条记忆，按最近更新排序。',
            right: h(Select, {
              value: String(prefs.maxEntries),
              disabled: busy,
              label: '索引条数上限',
              options: [
                { value: '5', label: '5 条' },
                { value: '10', label: '10 条' },
                { value: '20', label: '20 条' },
                { value: '50', label: '50 条' },
              ],
              onChange: (next) => void setPref({ maxEntries: Number(next) }),
            }),
          }),
          h(Row, {
            title: '注入时机',
            sub: '每轮注入一次更省 token；每次模型调用都注入更不容易被忘掉。',
            right: h(Select, {
              value: prefs.injectTiming,
              disabled: busy,
              label: '注入时机',
              options: [
                { value: 'turn', label: '每轮一次' },
                { value: 'step', label: '每次调用' },
              ],
              onChange: (next) => void setPref({ injectTiming: next }),
            }),
          }),
          h(Row, {
            title: '提示词注入位置',
            sub: prefs.promptPosition === 'system'
              ? '作为系统提示词的一部分（语气更强，位置固定）。'
              : '作为每轮动态上下文插入（更容易被后续对话覆盖）。',
            right: h(Select, {
              value: prefs.promptPosition,
              disabled: busy,
              label: '提示词注入位置',
              options: [
                { value: 'system', label: '系统提示词' },
                { value: 'context', label: '每轮上下文' },
              ],
              // 这一项属于 dsh-system-prompt 的 Host，走它自己的 global 路由。
              onChange: (next) => void setPromptPosition(next),
            }),
          })
        ),

        styleItems.length > 0
          ? h('div', null,
              h('div', { className: 'dshmp-head' },
                h('div', { className: 'dshmp-title', style: { fontSize: 14 } }, '回答风格'),
                h('div', { className: 'dshmp-desc' }, '这些档位会拼成一段行为指令，随提示词一起注入。全部为默认时不产生任何额外内容。')
              ),
              h('div', { className: 'dshmp-card' },
                styleItems.map((item) => {
                  const pairs = Object.entries(item.options || {})
                  if (pairs.length === 0) return null
                  const options = pairs.map(([value, label]) => ({ value, label }))
                  const fallback = options[Math.min(1, options.length - 1)].value
                  return h(Row, {
                    key: item.key,
                    title: item.label,
                    right: h(Select, {
                      value: style[item.key] || fallback,
                      disabled: busy,
                      label: item.label,
                      options,
                      onChange: (next) => void setStyleItem(item.key, next),
                    }),
                  })
                })
              )
            )
          : null,

        error ? h('div', { className: 'dshmp-msg err' }, error) : null
      )
    }

    /* ---------- 输入框左侧：合并开关 ---------- */

    const TOGGLE_CSS = `
.dshdip-root{position:relative;display:inline-flex;align-items:center}
.dshdip-btn{appearance:none;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;line-height:20px;cursor:pointer;white-space:nowrap;transition:background-color .1s,color .1s}
.dshdip-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dshdip-btn:disabled{opacity:.5;cursor:default}
.dshdip-dot{width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-state-success-primary);flex:none}
.dshdip-btn[data-state="partial"] .dshdip-dot{background:var(--dsw-alias-state-warn-primary)}
.dshdip-btn[data-state="off"] .dshdip-dot{background:var(--dsw-alias-state-idle-primary)}
.dshdip-btn[data-state="partial"]{color:var(--dsw-alias-state-warn-primary)}
.dshdip-panel{position:absolute;bottom:calc(100% + 8px);left:0;z-index:60;min-width:280px;padding:6px;border-radius:var(--dsw-radius-panel);background:var(--dsw-specific-input-major);box-shadow:var(--dsw-elevation-soft);border:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;gap:1px}
.dshdip-title{padding:6px 10px 4px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dshdip-item{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer;text-align:left;transition:background-color .1s}
.dshdip-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshdip-item:disabled{opacity:.5;cursor:default}
.dshdip-item-main{flex:1;min-width:0}
.dshdip-state{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dshdip-state.on{color:var(--dsw-alias-state-success-primary)}
.dshdip-state.warn{color:var(--dsw-alias-state-warn-primary)}
.dshdip-hint{padding:2px 10px 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dshdip-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1)}
.dshdip-link{appearance:none;border:0;background:none;padding:0;font:inherit;color:var(--dsw-alias-state-business-primary);cursor:pointer}
.dshdip-link:hover{text-decoration:underline}
.dshdip-guide{position:fixed;z-index:102;width:320px;max-width:min(360px,90vw);padding:16px 18px;border-radius:var(--dsw-radius-panel);background:var(--dsw-specific-input-major);box-shadow:var(--dsw-elevation-soft);border:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;gap:8px;pointer-events:auto}
/* 教程期间拦住下层交互：覆盖全屏、吃掉点击；界面仍可见，压暗由 spot 的巨幅阴影完成。 */
.dshdip-blocker{position:fixed;inset:0;z-index:100;background:transparent}
/* 聚光灯：只压暗目标以外区域，中间镂空，界面本身照常可见。 */
.dshdip-spot{position:fixed;z-index:101;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.5),0 0 0 2px var(--dsw-alias-state-business-primary);pointer-events:none;transition:top .18s ease,left .18s ease,width .18s ease,height .18s ease}
.dshdip-row{display:flex;align-items:center;gap:10px;padding:8px 10px}
.dshdip-row-label{flex:1;min-width:0;font-size:13px;color:var(--dsw-alias-label-primary)}
.dshdip-seg{display:inline-flex;flex:none;padding:2px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);gap:2px}
.dshdip-seg-btn{appearance:none;border:0;border-radius:999px;padding:3px 10px;font:inherit;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);background:transparent;cursor:pointer;transition:background-color .12s,color .12s;white-space:nowrap}
.dshdip-seg-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.dshdip-seg-btn[aria-checked="true"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.18)}
.dshdip-seg-btn:disabled{opacity:.5;cursor:default}
.dshdip-guide-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dshdip-guide-step{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dshdip-guide-title{font-size:14px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}
.dshdip-guide-body{font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
.dshdip-guide-dots{display:flex;gap:5px;margin:2px 0}
.dshdip-guide-dot{width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-border-l2)}
.dshdip-guide-dot.active{background:var(--dsw-alias-state-business-primary)}
.dshdip-guide-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px}
.dshdip-btn-sm{appearance:none;height:28px;padding:0 12px;border:0;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.dshdip-btn-sm:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.dshdip-btn-sm.primary{background:var(--dsw-alias-button-info-fill);color:#fff}
.dshdip-btn-sm.primary:hover{background:var(--dsw-alias-button-info-hover)}
`

    function ComposerToggle(props) {
      const sessionId = props && typeof props.sessionId === 'string' ? props.sessionId : undefined
      const [open, setOpen] = useState(false)
      const [memAccess, setMemAccess] = useState('auto')
      const [spOff, setSpOff] = useState(false)
      const [memGlobal, setMemGlobal] = useState(true)
      const [spGlobal, setSpGlobal] = useState(true)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const rootRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const memRowRef = React.useRef(null)
      const spRowRef = React.useRef(null)
      const bubbleRef = React.useRef(null)
      const [bubbleHeight, setBubbleHeight] = useState(0)

      // 气泡高度随文案变化，量出来再定位，避免估算值把目标压住。
      useEffect(() => {
        const node = bubbleRef.current
        if (!node) return
        const height = node.getBoundingClientRect().height
        if (height > 0 && Math.abs(height - bubbleHeight) > 1) setBubbleHeight(height)
      })

      // 新手引导：首次安装后自动出现，用聚光灯框住本按钮并分步说明。
      // 记在 localStorage，跳过或走完后不再自动出现。
      const GUIDE_KEY = 'dsh-memory:guide-done'
      const [guideStep, setGuideStep] = useState(0)
      const [spotRect, setSpotRect] = useState(null)
      const [guideDone, setGuideDone] = useState(() => {
        try {
          return window.localStorage.getItem(GUIDE_KEY) === '1'
        } catch {
          return false
        }
      })

      const finishGuide = useCallback(() => {
        setGuideDone(true)
        setGuideStep(0)
        try {
          window.localStorage.setItem(GUIDE_KEY, '1')
        } catch {
          /* 隐私模式下写不进去也不影响使用 */
        }
      }, [])

      // 第 2 步讲记忆、第 3 步讲系统提示词 —— 两处都要把面板打开，
      // 否则用户看不到要讲的东西。第 1 步只讲按钮本身，保持收起。
      useEffect(() => {
        if (guideDone) return
        setOpen(guideStep >= 1)
      }, [guideDone, guideStep])

      // 引导期间持续测量高亮目标：
      //   第 1 步 → 输入框按钮本身
      //   第 2 步 → 面板里的「记忆」那一行
      //   第 3 步 → 面板里的「系统提示词」那一行
      // 逐行聚光而不是框整个面板，因为两者语义不同，用户需要分别看清。
      useEffect(() => {
        if (guideDone) return undefined
        const pick = () => {
          if (guideStep === 1) return memRowRef.current
          if (guideStep === 2) return spRowRef.current
          return rootRef.current
        }
        const measure = () => {
          const target = pick()
          if (!target) return
          const rect = target.getBoundingClientRect()
          setSpotRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
        }
        measure()
        window.addEventListener('resize', measure)
        window.addEventListener('scroll', measure, true)
        const timer = setInterval(measure, 300)
        return () => {
          window.removeEventListener('resize', measure)
          window.removeEventListener('scroll', measure, true)
          clearInterval(timer)
        }
      }, [guideDone, guideStep, open])

      const load = useCallback(async () => {
        if (!sessionId) return
        try {
          const [mem, sp, memG, spG] = await Promise.all([
            callJson(`/dsh-memory/session-pref?sessionId=${encodeURIComponent(sessionId)}`),
            callJson(`/dsh-system-prompt/session-pref?sessionId=${encodeURIComponent(sessionId)}`),
            callJson('/dsh-memory/global'),
            callJson('/dsh-system-prompt/global'),
          ])
          setMemAccess(mem.access || 'auto')
          setSpOff(sp.disabled === true)
          setMemGlobal(memG.enabled !== false)
          setSpGlobal(spG.enabled !== false)
          setError(null)
        } catch (e) {
          setError(String(e.message || e))
        }
      }, [sessionId])

      useEffect(() => { void load() }, [load])

      // 设置页改了全局开关后立即同步过来（否则必须重启才看到变化）。
      useEffect(() => subscribeChanged(() => { void load() }), [load])

      // 打开面板时重读一次，保证看到的是最新状态。
      useEffect(() => {
        if (open) void load()
      }, [open, load])

      // 窗口重新获得焦点时重读：从设置页返回对话时状态可能已变。
      useEffect(() => {
        const onFocus = () => { void load() }
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
      }, [load])

      useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      /** 直接设定记忆三态（分段滑块用），不走循环。 */
      const setMemoryAccess = async (nextAccess) => {
        if (!sessionId) return
        setBusy(true)
        try {
          const data = await callJson('/dsh-memory/session-pref', { sessionId, access: nextAccess })
          setMemAccess(data.access || 'auto')
          setError(null)
          notifyChanged()
        } catch (e) {
          setError(String(e.message || e))
          // 409 锁定等情况：以 Host 的真实状态为准，别让 UI 停在旧值。
          void load()
        } finally {
          setBusy(false)
        }
      }

      /** 直接设定系统提示词开关（分段滑块用）。 */
      const setSystemPromptOn = async (on) => {
        if (!sessionId) return
        setBusy(true)
        try {
          const data = await callJson('/dsh-system-prompt/session-pref', { sessionId, disabled: !on })
          setSpOff(data.disabled === true)
          setError(null)
          notifyChanged()
        } catch (e) {
          setError(String(e.message || e))
          void load()
        } finally {
          setBusy(false)
        }
      }

      const memLabel = memAccess === 'auto' ? '记忆·开' : memAccess === 'manual' ? '记忆·部分' : '记忆·关'
      const memState = memAccess === 'auto' ? 'on' : memAccess === 'manual' ? 'partial' : 'off'
      // 全局关闭时，本对话按钮一律灰显为「已全局关闭」，不可点——
      // 否则它会显示旧的会话状态，点一下才翻转，看起来像在闪。
      const anyGlobalOff = !memGlobal || !spGlobal
      const label = !sessionId
        ? '记忆'
        : !memGlobal && !spGlobal
          ? '记忆·已全局关闭'
          : !memGlobal
            ? '记忆·已全局关闭'
            : !spGlobal
              ? '系统提示词·已全局关闭'
              : spOff
                ? '系统提示词已关闭'
                : memLabel
      const state = !sessionId ? 'off' : anyGlobalOff ? 'off' : spOff ? 'off' : memState

      return h('div', { className: 'dshdip-root', ref: rootRef, 'data-dsh-memory-toggle': '1' },
        h('style', null, TOGGLE_CSS),
        h('button', {
          className: 'dshdip-btn',
          'data-state': state,
          type: 'button',
          title: anyGlobalOff
            ? '已在设置里全局关闭，请到「设置 → 记忆与提示词」重新开启'
            : '记忆与系统提示词（本对话）',
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          onClick: () => setOpen((v) => !v),
        },
          h('span', { className: 'dshdip-dot' }),
          h('span', null, label)
        ),
        // 引导未完成：显示光圈 + 气泡，并拦截下层点击。
        // 第 2、3 步都要露出面板，用户才能看到对应那一行。
        !guideDone
          ? h(React.Fragment, null,
              guideStep >= 1 && open ? renderCompact() : null,
              renderGuide(),
            )
          : (open ? renderCompact() : null)
      )

      /* ---- 三态分段滑块：关 / 部分 / 开 ---- */
      function Segmented(props) {
        const options = props.options
        return h('div', { className: 'dshdip-seg', role: 'radiogroup', 'aria-label': props.label },
          options.map((option) => h('button', {
            key: option.value,
            type: 'button',
            role: 'radio',
            className: 'dshdip-seg-btn',
            'aria-checked': option.value === props.value ? 'true' : 'false',
            disabled: props.disabled,
            title: option.hint,
            onClick: () => {
              if (option.value !== props.value) props.onChange(option.value)
            },
          }, option.label))
        )
      }

      /* ---- 精简面板 ---- */
      function renderCompact() {
        const memDisabled = busy || !sessionId || !memGlobal
        const spDisabled = busy || !sessionId || !spGlobal

        return h('div', {
          className: 'dshdip-panel',
          role: 'menu',
          ref: panelRef,
          // 引导第 2、3 步要把它露在光圈里，必须高于拦截层才不会被压暗。
          style: !guideDone && guideStep >= 1 ? { zIndex: 101 } : undefined,
        },
          h('div', { className: 'dshdip-row', ref: memRowRef },
            h('span', { className: 'dshdip-row-label' }, '记忆'),
            h(Segmented, {
              label: '记忆',
              value: memAccess,
              disabled: memDisabled,
              options: [
                { value: 'off', label: '关', hint: '不注入索引，AI 也无法读取' },
                { value: 'manual', label: '部分', hint: '不自动注入，AI 需要时会自己读' },
                { value: 'auto', label: '开', hint: '每轮自动注入索引，AI 可主动读取' },
              ],
              onChange: (next) => void setMemoryAccess(next),
            })
          ),
          h('div', { className: 'dshdip-row', ref: spRowRef },
            h('span', { className: 'dshdip-row-label' }, '系统提示词'),
            h(Segmented, {
              label: '系统提示词',
              value: spOff ? 'off' : 'on',
              disabled: spDisabled,
              options: [
                { value: 'off', label: '关', hint: '本次对话不注入你写的提示词' },
                { value: 'on', label: '开', hint: '本次对话注入你写的提示词' },
              ],
              onChange: (next) => void setSystemPromptOn(next === 'on'),
            })
          ),
          h('div', { className: 'dshdip-hint' },
            (!memGlobal || !spGlobal)
              ? '有一项已在设置里全局关闭，需先到设置里打开。'
              : h('button', {
                  type: 'button',
                  className: 'dshdip-link',
                  onClick: () => { setGuideStep(0); setGuideDone(false) },
                }, '查看说明')
          ),
          error
            ? h('div', { className: 'dshdip-hint', style: { color: 'var(--dsw-alias-state-error-primary)' } }, error)
            : null
        )
      }

      /* ---- 新手引导：聚光灯，界面照常显示，只框住这一处并弹气泡 ---- */
      function renderGuide() {
        const steps = [
          {
            title: '这里是记忆与提示词',
            body: '这个按钮控制当前对话的两个开关。\n点它就能切换，不会影响别的对话。',
          },
          {
            title: '记忆有三种状态',
            body: '关：不注入，AI 也读不到。\n部分：不自动注入，AI 需要时会自己读。\n开：每轮自动带上索引，AI 可主动读取。',
          },
          {
            title: '系统提示词可以单独关',
            body: '关掉后，你写的提示词不会进入本次对话。\n内容的编辑在「设置 → 记忆与提示词」里。',
          },
        ]
        const step = steps[Math.min(guideStep, steps.length - 1)]
        const isLast = guideStep >= steps.length - 1

        // 气泡位置：优先放目标上方，放不下才翻到下方。
        // 难点是气泡实际高度会随文案变化，用估算值会压住目标，
        // 所以先挂上去再用 ref 量真实高度，量之前不显示（避免闪一下错位）。
        const BUBBLE_W = 320
        const vw = typeof window === 'undefined' ? 1200 : window.innerWidth
        const vh = typeof window === 'undefined' ? 800 : window.innerHeight
        const BUBBLE_H = bubbleHeight || 210
        const GAP = 14
        const left = spotRect === null
          ? 24
          : Math.max(12, Math.min(spotRect.left, vw - BUBBLE_W - 12))
        const spaceAbove = spotRect === null ? 0 : spotRect.top - GAP
        const spaceBelow = spotRect === null ? 0 : vh - (spotRect.top + spotRect.height) - GAP
        const above = spotRect !== null && spaceAbove >= BUBBLE_H
        const top = spotRect === null
          ? Math.max(24, vh - 260)
          : above
            ? Math.max(8, spotRect.top - BUBBLE_H - GAP)
            : (spaceBelow >= BUBBLE_H
                ? spotRect.top + spotRect.height + GAP
                : Math.max(8, vh - BUBBLE_H - GAP))

        return h('div', null,
          // 拦截层：教程期间下层不可点，避免点别处让教程中断。
          // 放在光圈之下、气泡之上，气泡自身按钮仍然可点。
          h('div', { className: 'dshdip-blocker', 'aria-hidden': 'true' }),
          spotRect !== null
            ? h('div', {
                className: 'dshdip-spot',
                style: {
                  top: `${spotRect.top - 4}px`,
                  left: `${spotRect.left - 4}px`,
                  width: `${spotRect.width + 8}px`,
                  height: `${spotRect.height + 8}px`,
                },
              })
            : null,
          h('div', {
            className: 'dshdip-guide',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': '使用说明',
            ref: bubbleRef,
            style: {
              left: `${left}px`,
              top: `${top}px`,
              width: `${BUBBLE_W}px`,
              // 量高度期间先不可见，避免看到它跳动。
              visibility: bubbleHeight === 0 ? 'hidden' : 'visible',
            },
          },
            h('div', { className: 'dshdip-guide-head' },
              h('span', { className: 'dshdip-guide-step' }, `${guideStep + 1} / ${steps.length}`),
              h('button', { type: 'button', className: 'dshdip-link', onClick: finishGuide }, '跳过')
            ),
            h('div', { className: 'dshdip-guide-title' }, step.title),
            h('div', { className: 'dshdip-guide-body' }, step.body),
            h('div', { className: 'dshdip-guide-dots' },
              steps.map((_, index) => h('span', {
                key: index,
                className: 'dshdip-guide-dot' + (index === guideStep ? ' active' : ''),
              }))
            ),
            h('div', { className: 'dshdip-guide-actions' },
              guideStep > 0
                ? h('button', {
                    type: 'button',
                    className: 'dshdip-btn-sm',
                    onClick: () => setGuideStep((v) => Math.max(0, v - 1)),
                  }, '上一步')
                : h('span', null),
              h('button', {
                type: 'button',
                className: 'dshdip-btn-sm primary',
                onClick: () => (isLast ? finishGuide() : setGuideStep((v) => v + 1)),
              }, isLast ? '开始使用' : '下一步')
            )
          )
        )
      }
    }

    /** 错误边界：任一子组件抛错时显示可读信息，而不是让整个设置页白屏。 */
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      render() {
        if (this.state.error) {
          return h('div', { className: 'dshmp-root' },
            h('style', null, CSS),
            h('div', { className: 'dshmp-msg err' },
              `记忆与提示词面板出错：${String(this.state.error && this.state.error.message || this.state.error)}`),
            h('div', { className: 'dshmp-hint' },
              '这不是你的操作问题。请完全退出应用后重开；若仍出现，说明后端与前端版本不一致。')
          )
        }
        return this.props.children
      }
    }

    function safe(Component) {
      return function Wrapped(props) {
        return h(Boundary, null, h(Component, props))
      }
    }

    // ── 设置导航图标 ──────────────────────────────────────────────────────

    /*
     * 宿主的设置导航按 section id 硬编码图标，只认 account / models /
     * agent-presets / plugins / archived-sessions 五个，其余一律给齿轮；
     * 而 settings.section 的注册接口没有 icon 字段。
     *
     * 所以自己换：给导航行打 data 属性，再用 mask-image 盖掉默认齿轮。
     * 用 mask 而非 background-image，是为了让颜色跟随 currentColor ——
     * 选中时文字变蓝，图标自动跟着变蓝。
     */
    const NAV_ATTR = 'dshnav'
    const NAV_VALUE = 'dsh-memory'
    const NAV_LABEL = '记忆与提示词'

    /** 书签图标：记忆的常见隐喻。stroke 用纯黑，供 mask 取 alpha。 */
    const NAV_MASK = 'url("data:image/svg+xml,'
      + encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' "
        + "stroke='#000' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'>"
        + "<path d='M6 3h12v18l-6-4.5L6 21z'/>"
        + '</svg>',
      )
      + '")'

    const NAV_CSS = `
button[data-${NAV_ATTR}="${NAV_VALUE}"] > svg{display:none}
button[data-${NAV_ATTR}="${NAV_VALUE}"]::before{
  content:'';flex:none;
  width:16px;height:16px;
  background-color:currentColor;
  -webkit-mask:var(--dshmp-nav-mask) center / contain no-repeat;
  mask:var(--dshmp-nav-mask) center / contain no-repeat;
}
`

    /** 找到设置导航里属于本插件的那一行并打标记；找不到就安静返回。 */
    function decorateNavRow() {
      try {
        const buttons = document.querySelectorAll('button')
        for (const button of buttons) {
          if (button.dataset[NAV_ATTR] === NAV_VALUE) continue
          if (button.querySelector(':scope > svg') === null) continue
          const label = button.querySelector(':scope > span')
          if (label === null || label.textContent.trim() !== NAV_LABEL) continue
          const list = button.parentElement
          if (list === null || !list.textContent.includes('通用设置')) continue
          button.dataset[NAV_ATTR] = NAV_VALUE
          button.style.setProperty('--dshmp-nav-mask', NAV_MASK)
        }
      } catch {
        /* 定位失败不影响设置页本身 */
      }
    }

    /** 装上观察器：设置面板每次打开 DOM 都会重建，需要重新打标记。 */
    function installNavIcons() {
      try {
        const style = document.createElement('style')
        style.textContent = NAV_CSS
        document.head.appendChild(style)
        decorateNavRow()

        let queued = false
        const observer = new MutationObserver(() => {
          if (queued) return
          queued = true
          requestAnimationFrame(() => {
            queued = false
            decorateNavRow()
          })
        })
        observer.observe(document.body, { childList: true, subtree: true })

        return () => {
          observer.disconnect()
          style.remove()
        }
      } catch {
        return undefined
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => installNavIcons())

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dsh-memory',
          order: 40,
          label: () => '记忆与提示词',
        }, safe(MemoryAndPrompt)))

        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'dsh-memory-toggle',
          order: 5,
          label: () => '记忆',
        }, safe(ComposerToggle)))
      },
    }
  },
})
