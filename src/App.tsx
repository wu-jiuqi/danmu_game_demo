import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Engine from './game-engine'

type AnyState = any
type Command = { type: string; [key: string]: unknown }
const api = Engine as any
const SAVE_KEY = api.SAVE_KEY || 'bawei-restaurant-save-v1'

const issue = (type: string, extra: Record<string, unknown> = {}): Command => ({ type, ...extra })

function safeInitial(): AnyState {
  const saved = localStorage.getItem(SAVE_KEY)
  if (saved && api.deserializeState) {
    try { return api.deserializeState(saved) } catch { /* fall through */ }
  }
  if (saved && api.loadState) {
    try { return api.loadState(JSON.parse(saved)) } catch { /* fall through */ }
  }
  return api.createInitialState()
}

function secondsLabel(seconds: number | undefined) {
  return `${Math.max(0, Math.ceil(seconds || 0)).toString().padStart(2, '0')}s`
}

function logTime(tick: number | undefined) {
  const minute = (48 + ((tick || 0) % 12)) % 60
  return `23:${minute.toString().padStart(2, '0')}`
}

const PROTOTYPE_DISH_NAMES: Record<string, string> = {
  D0101: '红烧牛肉面',
  D0102: '鱼香茄子',
  D0103: '夜市炒饭',
  D0104: '冰镇酸梅汤',
}

function App() {
  const [state, setState] = useState<AnyState>(() => safeInitial())
  const [command, setCommand] = useState('')
  const [notice, setNotice] = useState('状态变化会被记录，不绕过规则。')
  const noticeTimer = useRef<number | undefined>(undefined)

  const apply = useCallback((next: AnyState, fallbackMessage?: string, hasNewLog = true) => {
    setState(next)
    const latest = next?.stats?.logs?.[next.stats.logs.length - 1]
    setNotice(hasNewLog ? (latest?.message || fallbackMessage || '') : (fallbackMessage || ''))
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 4800)
  }, [])

  const send = useCallback((nextCommand: Command, fallbackMessage?: string) => {
    const next = api.dispatch(state, nextCommand)
    apply(next, fallbackMessage, (next?.stats?.logs?.length || 0) > (state?.stats?.logs?.length || 0))
  }, [apply, state])

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current: AnyState) => current.clock?.paused ? current : api.tick(current, 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    try {
      const value = api.serializeState ? api.serializeState(state) : JSON.stringify(api.saveState ? api.saveState(state) : state)
      localStorage.setItem(SAVE_KEY, value)
    } catch { /* localStorage is an enhancement */ }
  }, [state])

  const resources = state.resources || {}
  const progress = state.progress || {}
  const runtime = state.runtime || {}
  const effects = state.effects || {}
  const stats = state.stats || {}
  const queue = runtime.queue || []
  const seats = runtime.seats || []
  const stoves = runtime.stoves || []
  const readyOrders = runtime.readyOrders || []
  const guestsById = new Map<string, any>((runtime.guests || []).map((guest: any) => [guest.id, guest] as [string, any]))
  const ordersById = new Map<string, any>((runtime.orders || []).map((order: any) => [order.id, order] as [string, any]))
  const dishes = api.getAllDishes ? api.getAllDishes() : []
  const availableUpgrade = api.getAvailableUpgrade ? api.getAvailableUpgrade(state) : undefined
  const publishedDishes = new Set(progress.publishedDishIds || [])
  const activeDishes = new Set(progress.activeDishIds || [])
  const dishCapacity = api.RESTAURANTS?.[(progress.restaurantLevel || 1) - 1]?.dishSlots ?? 3

  const dishName = useCallback((id: string | undefined) => PROTOTYPE_DISH_NAMES[id || ''] || dishes.find((item: any) => item.id === id)?.name || id || '热菜', [dishes])

  const recipeRows = useMemo(() => ['D0101', 'D0102', 'D0104', 'D0103'].map((id, index) => {
    const dish = dishes.find((item: any) => item.id === id)
    const active = activeDishes.has(id)
    const published = publishedDishes.has(id)
    const researchAffordable = Boolean(dish) && Object.entries(dish.research || {}).every(([key, value]) => (resources[key] ?? 0) >= Number(value))
    const locked = !active && (!dish || dish.tier > (progress.restaurantLevel || 1) || dish.tier > (progress.chefLevel || 1) || !researchAffordable)
    const publishedIndex = [...publishedDishes].indexOf(id)
    const subtitle = active && published
      ? `上架位 ${publishedIndex + 1} / ${dishCapacity} · 可点单`
      : active ? '已激活 · 等待上架位' : `需要饭馆 Lv.${dish?.tier || 2} · 缺 ${dish?.research?.cash || 0} 现金`
    const status = active && published ? '已上架 · 可点单' : active ? '已激活 · 未上架' : '未激活 · 可研发'
    const action = active ? (published ? '下架 / 调整顺序' : '上架') : '研发'
    return { id, dish, name: PROTOTYPE_DISH_NAMES[id] || dish?.name || '热菜', active, published, locked, subtitle, status, action }
  }), [activeDishes, dishCapacity, dishes, progress.chefLevel, progress.restaurantLevel, publishedDishes, resources])

  const latestLog = stats.logs?.[stats.logs.length - 1]
  const displayLogs = [...(stats.logs || [])].slice(-5)
  const visibleStoves = useMemo(() => {
    const result = [...stoves]
    const readyOrder = readyOrders[0]
    const idleIndex = result.findIndex((stove: any) => stove.status === 'idle')
    if (readyOrder && idleIndex >= 0) result[idleIndex] = { id: 'ready-order-stove', status: 'ready', orderId: readyOrder.id, remaining: readyOrder.waitingRemaining }
    else if (readyOrder) result.push({ id: 'ready-order-stove', status: 'ready', orderId: readyOrder.id, remaining: readyOrder.waitingRemaining })
    while (result.length < 2) result.push({ id: `empty-stove-${result.length + 1}`, status: 'idle', remaining: 0 })
    return result.slice(0, 2)
  }, [readyOrders, stoves])

  const handleInput = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    const normalized = trimmed.toLowerCase()
    const commandMap: Record<string, Command> = {
      '出餐': issue('SERVE'), pause: issue(state.clock?.paused ? 'RESUME' : 'PAUSE'), '暂停': issue('PAUSE'), '继续': issue('RESUME'),
      '1倍': issue('SET_SPEED', { speed: 1 }), '2倍': issue('SET_SPEED', { speed: 2 }), '5倍': issue('SET_SPEED', { speed: 5 }),
      '1x': issue('SET_SPEED', { speed: 1 }), '2x': issue('SET_SPEED', { speed: 2 }), '5x': issue('SET_SPEED', { speed: 5 }),
    }
    const queueMatch = normalized.match(/^排([123])$/)
    if (queueMatch) commandMap[normalized] = issue('PRIORITIZE_QUEUE', { position: Number(queueMatch[1]) - 1 })
    const selected = commandMap[normalized]
    if (!selected) { setNotice('可用指令：出餐、暂停、继续、1倍、2倍、5倍、排1/排2/排3'); return }
    send(selected, `弹幕指令「${trimmed}」已生效`)
    setCommand('')
  }

  return (
    <main className="app-shell">
      <section className="game-frame" aria-label="百味饭馆 24 小时经营 Demo">
        <header className="top-status-bar">
          <div className="brand-lockup"><strong>百味饭馆</strong><span>24H 夜市经营</span></div>
          <button className="level-badge restaurant-level" onClick={() => send(issue('UPGRADE_RESTAURANT'), '饭馆升级条件还未满足。')}><strong>饭馆 Lv.{progress.restaurantLevel ?? 1}</strong><span>{availableUpgrade?.restaurant?.affordable ? '可升级' : '稳定经营'}</span></button>
          <button className="level-badge chef-level" onClick={() => send(issue('UPGRADE_CHEF'), '厨师升级条件还未满足。')}><strong>厨师 Lv.{progress.chefLevel ?? 1}</strong><span>炉火稳定</span></button>
          <div className="resource-row"><ResourceBadge label="现金" value={resources.cash ?? 0} icon="$" tone="gold" /><ResourceBadge label="红食材" value={resources.red ?? 0} icon="R" tone="red" /><ResourceBadge label="绿食材" value={resources.green ?? 0} icon="G" tone="green" /><ResourceBadge label="蓝食材" value={resources.blue ?? 0} icon="B" tone="cyan" /><ResourceBadge label="今日客流" value={stats.todayGuests ?? 0} icon="♥" tone="pink" /><ResourceBadge label="营业额" value={`¥${stats.todayRevenue ?? 0}`} icon="↗" tone="cream" /></div>
        </header>

        <div className="workspace-grid">
          <aside className="recipe-panel panel-surface"><PanelHeading title="菜单与升级" subtitle="研发、上架与缺口" /><div className="recipe-list">{recipeRows.map((recipe: any) => <RecipeStateCard key={recipe.id} recipe={recipe} onAction={(commandType: string) => send(issue(commandType, { dishId: recipe.id }), recipe.action === '上架' ? '已端上菜单。' : '已更新菜单状态。')} />)}</div></aside>

          <section className="main-stage panel-surface">
            <PanelHeading title="经营舞台" subtitle={`夜市 23:48 · Tick ${state.clock?.paused ? '暂停' : '进行中'}`} action={<span className="stage-chip">主舞台可见</span>} />
            <div className="lantern-row" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>
            <div className="queue-strip"><div className="queue-label"><strong>排队区</strong><span>{queue.length} 位客人</span></div><div className="queue-avatars">{queue.slice(0, 3).map((guest: any, index: number) => <QueueAvatar key={guest.id || index} guest={guest} index={index} />)}{queue.length === 0 && <span className="queue-empty">等待第一位客人</span>}</div><div className="order-bubble"><strong>{queue[0] ? `已下单：${dishName(queue[0].orderId ? ordersById.get(queue[0].orderId)?.dishId : [...publishedDishes][0] || progress.activeDishIds?.[0])}` : '等待下一笔订单'}</strong><span>{queue[0] ? `排队中 ${secondsLabel(queue[0].patienceRemaining)}` : '排队中 --'}</span><ProgressBar value={queue[0] ? Math.max(0.08, Math.min(1, (queue[0].patienceRemaining || 0) / Math.max(1, queue[0].patience || 1))) : 0.12} tone="queue" /></div></div>
            <h3 className="stage-section-title">桌台与客人状态</h3>
            <div className="table-row">{(seats.length ? seats : [{ id: 'seat-1', status: 'empty' }, { id: 'seat-2', status: 'empty' }, { id: 'seat-3', status: 'empty' }]).slice(0, 3).map((seat: any, index: number) => <TableCard key={seat.id || index} seat={seat} index={index} guest={guestsById.get(seat.guestId)} order={ordersById.get(seat.orderId)} dishName={dishName} />)}</div>
            <div className="chef-station"><div className="chef-copy"><div className="chef-avatar">厨</div><div><strong>厨师与灶眼</strong><span>阿灶师傅 · Lv.{progress.chefLevel ?? 1}</span><small>烹饪规则来自状态机</small></div></div><div className="burner-row">{visibleStoves.map((stove: any, index: number) => <BurnerCard key={stove.id || index} stove={stove} index={index} order={ordersById.get(stove.orderId)} dishName={dishName} onServe={() => send(issue('SERVE'), '现在没有可以出餐的菜。')} />)}</div></div>
            {latestLog?.kind === 'checkout' && <div className="reward-toast">+18 现金 · 结账成功</div>}
          </section>

          <aside className="gift-panel panel-surface"><PanelHeading title="礼物技能" subtitle="高饱和反馈 · 冷却独立" /><div className="skill-list"><SkillTile title="红色仙女棒" description="时间缩短 · 叠加 2/4" meta={effects.wizardCooldown > 0 ? `冷却 ${secondsLabel(effects.wizardCooldown)}` : '可使用'} tone="pink" glyph="P" onClick={() => send(issue('GIFT_WAND'), '没有烹饪中的订单，仙女棒没有消耗。')} /><SkillTile title="能量药丸" description="随机奖励 · 保底" meta={`第 ${((progress.pillDrawCount ?? 0) % 10) + 1} 抽`} tone="cyan" glyph="E" onClick={() => send(issue('GIFT_PILL'), '药丸已送达厨房。')} /><SkillTile title="魔法镜" description={`客流倍率 · 层数 ${effects.mirror?.layers ?? 0}/3`} meta={effects.mirror?.remaining ? `剩余 ${secondsLabel(effects.mirror.remaining)}` : '可使用'} tone="violet" glyph="M" onClick={() => send(issue('GIFT_MIRROR'), '魔法镜最多叠 3 层。')} /><SkillTile title="甜甜圈" description="自动出餐 · 180s 上限" meta={effects.donutRemaining ? `剩余 ${secondsLabel(effects.donutRemaining)}` : '可使用'} tone="green" glyph="D" onClick={() => send(issue('GIFT_DONUT'), '甜甜圈效果已加入队列。')} /><SkillTile title="炸弹" description="一次性招客 · 需空位" meta={effects.bombCooldown ? `冷却 ${secondsLabel(effects.bombCooldown)}` : '可使用'} tone="orange" glyph="B" onClick={() => send(issue('GIFT_BOMB'), '当前空位不足或炸弹仍在冷却。')} /></div></aside>
        </div>

        <footer className="chat-feed"><div className="feed-title"><strong>弹幕日志</strong><span>状态变化会被记录，不绕过规则</span></div><div className="feed-logs">{displayLogs.map((log: any, index: number) => <LogCard key={`${log.id || log.tick}-${index}`} log={log} />)}</div><div className="command-bar"><input aria-label="模拟出餐指令" placeholder="输入框（原型占位）：模拟“出餐”" value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleInput(command) }} /><button onClick={() => command.trim() ? handleInput(command) : send(issue('SERVE'), '当前没有可以出餐的菜。')}>模拟出餐</button></div><div className="a11y-note"><span>可访问性</span><strong>高对比 · 减少动效</strong></div><span className="sr-only" aria-live="polite">{notice}</span></footer>
      </section>
    </main>
  )
}

function ResourceBadge({ label, value, icon, tone }: { label: string; value: string | number; icon: string; tone: string }) { return <div className={`resource-badge tone-${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div> }
function PanelHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="panel-heading"><div><h2>{title}</h2><span>{subtitle}</span></div>{action}</div> }
function RecipeStateCard({ recipe, onAction }: { recipe: any; onAction: (commandType: string) => void }) { const commandType = recipe.active ? (recipe.published ? 'UNPUBLISH_DISH' : 'PUBLISH_DISH') : 'RESEARCH_DISH'; return <article className={`recipe-card ${recipe.locked ? 'is-locked' : ''} tone-${recipe.locked ? 'muted' : recipe.published ? 'green' : 'warning'}`}><span className="state-dot" /><strong>{recipe.name}</strong><span className="recipe-status">{recipe.status}</span><small>{recipe.subtitle}</small><button disabled={recipe.locked && !recipe.active} onClick={() => onAction(commandType)}>{recipe.action}</button></article> }
function QueueAvatar({ guest, index }: { guest: any; index: number }) { return <div className={`queue-avatar avatar-${index}`}><strong>{(guest.name || '客').slice(0, 1)}</strong><span>{guest.name || `客人 ${index + 1}`}</span></div> }
function TableCard({ seat, guest, order, index, dishName }: { seat: any; guest: any; order: any; index: number; dishName: (id?: string) => string }) { const occupied = seat.status === 'occupied'; const status = order?.status === 'ready' ? '等待出餐' : occupied ? '用餐中' : '空闲'; const tone = order?.status === 'ready' ? 'coral' : occupied ? 'green' : 'muted'; const progress = order?.status === 'ready' ? 1 - ((order.waitingRemaining || 0) / Math.max(1, guest?.readyWait || 10)) : occupied ? 0.48 : 0.28; return <article className={`table-card tone-${tone} ${occupied ? 'occupied' : ''}`}><div className="table-avatar">{occupied ? (guest?.name || '客').slice(0, 1) : '空'}</div><div><strong>{occupied ? (guest?.name || '客人') : '空桌'}</strong><span>{status}</span><small>{order ? order.status === 'ready' ? `请出餐 ${secondsLabel(order.waitingRemaining)}` : dishName(order.dishId) : occupied ? '等待下一步' : '等待下一位'}</small></div><ProgressBar value={progress} tone={tone} /></article> }
function BurnerCard({ stove, order, index, dishName, onServe }: { stove: any; order: any; index: number; dishName: (id?: string) => string; onServe: () => void }) { const active = stove.status === 'cooking' && order; const value = active ? Math.max(0.08, Math.min(1, 1 - (stove.remaining / Math.max(1, order.baseSeconds)))) : 0; return <article className={`burner-card ${active ? 'cooking' : 'ready'} tone-${active ? 'orange' : order?.status === 'ready' ? 'coral' : 'muted'}`}><strong>灶眼 0{index + 1} · {active ? '烹饪中' : order?.status === 'ready' ? '待出餐' : '空闲'}</strong><span>{active || order ? dishName(order?.dishId) : '等待订单'}</span>{active ? <><b>{secondsLabel(stove.remaining)}</b><ProgressBar value={value} tone="orange" /></> : order?.status === 'ready' ? <button onClick={onServe}>可以出餐 · 最早订单</button> : <small>等待下一笔订单</small>}</article> }
function ProgressBar({ value, tone }: { value: number; tone: string }) { return <span className={`progress-bar tone-${tone}`}><i style={{ width: `${Math.max(4, Math.min(100, value * 100))}%` }} /></span> }
function SkillTile({ title, description, meta, tone, glyph, onClick }: { title: string; description: string; meta: string; tone: string; glyph: string; onClick: () => void }) { return <button className={`skill-tile tone-${tone}`} onClick={onClick}><span className="skill-glyph">{glyph}</span><span className="skill-copy"><strong>{title}</strong><small>{description}</small><em>{meta}</em></span><b>用</b></button> }
function LogCard({ log }: { log: any }) { const kind = log.kind || 'command'; const label = kind === 'arrival' ? '到访' : kind === 'order' ? '下单' : kind === 'serve' ? '出餐' : kind === 'checkout' ? '结账' : kind === 'gift' ? '礼物' : kind === 'leave' ? '离开' : '状态'; return <article className={`log-card kind-${kind}`}><div><span>{logTime(log.tick)}</span><strong>{label}</strong></div><p>{log.message || log.text}</p></article> }

export default App
