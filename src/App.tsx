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
    try { return api.deserializeState(saved) } catch { /* fall through to a clean run */ }
  }
  if (saved && api.loadState) {
    try { return api.loadState(JSON.parse(saved)) } catch { /* fall through */ }
  }
  return api.createInitialState()
}

function formatTime(seconds: number | undefined) {
  const value = Math.max(0, Math.ceil(seconds || 0))
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`
}

function App() {
  const [state, setState] = useState<AnyState>(() => safeInitial())
  const [command, setCommand] = useState('')
  const [notice, setNotice] = useState('欢迎来到百味饭馆，弹幕会改变这间小馆的节奏。')
  const [activeTab, setActiveTab] = useState<'menu' | 'upgrade' | 'gifts'>('menu')
  const noticeTimer = useRef<number | undefined>(undefined)

  const apply = useCallback((next: AnyState, fallbackMessage?: string) => {
    setState(next)
    const latest = next?.stats?.logs?.[next.stats.logs.length - 1]
    if (latest?.message) {
      setNotice(latest.message)
    } else if (fallbackMessage) {
      setNotice(fallbackMessage)
    }
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 4800)
  }, [])

  const send = useCallback((nextCommand: Command, fallbackMessage?: string) => {
    const next = api.dispatch(state, nextCommand)
    apply(next, fallbackMessage)
  }, [apply, state])

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current: AnyState) => {
        if (current.clock?.paused) return current
        // The engine owns the 1x/2x/5x expansion so the UI has a single clock.
        return api.tick(current, 1)
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    try {
      const value = api.serializeState ? api.serializeState(state) : JSON.stringify(api.saveState ? api.saveState(state) : state)
      localStorage.setItem(SAVE_KEY, value)
    } catch { /* localStorage is an enhancement; the run remains playable if blocked */ }
  }, [state])

  const resources = state.resources || {}
  const progress = state.progress || {}
  const runtime = state.runtime || {}
  const effects = state.effects || {}
  const stats = state.stats || {}
  const logs = [...(stats.logs || [])].slice(-7).reverse()
  const queue = runtime.queue || []
  const seats = runtime.seats || []
  const stoves = runtime.stoves || []
  const readyOrders = runtime.readyOrders || []
  const guestsById = new Map((runtime.guests || []).map((guest: any) => [guest.id, guest]))
  const ordersById = new Map((runtime.orders || []).map((order: any) => [order.id, order]))
  const dishName = (id: string | undefined) => dishes.find((item: any) => item.id === id)?.name || id || '热菜'
  const dishes = api.getAllDishes ? api.getAllDishes() : (api.getVisibleDishes ? api.getVisibleDishes(state) : [])
  const availableUpgrade = api.getAvailableUpgrade ? api.getAvailableUpgrade(state) : null
  const activeDishes = new Set(progress.activeDishIds || [])
  const publishedDishes = new Set(progress.publishedDishIds || [])
  const speed = state.clock?.speed || 1

  const handleInput = (value: string) => {
    setCommand(value)
    if (value.trim() === '') return
    const normalized = value.trim().toLowerCase()
    const map: Record<string, Command> = {
      '出餐': issue('SERVE'), 'pause': issue('PAUSE'), '暂停': issue('PAUSE'),
      '1倍': issue('SET_SPEED', { speed: 1 }), '2倍': issue('SET_SPEED', { speed: 2 }), '5倍': issue('SET_SPEED', { speed: 5 }),
      '1x': issue('SET_SPEED', { speed: 1 }), '2x': issue('SET_SPEED', { speed: 2 }), '5x': issue('SET_SPEED', { speed: 5 }),
    }
    const parsedQueue = normalized.match(/^排([123])$/)
    if (parsedQueue) map[normalized] = issue('PRIORITIZE_QUEUE', { position: Number(parsedQueue[1]) - 1 })
    const selected = map[normalized]
    if (!selected) {
      setNotice('可用指令：出餐、暂停、1倍、2倍、5倍、排1/排2/排3')
      return
    }
    send(selected, `弹幕指令「${value.trim()}」已生效`)
    setCommand('')
  }

  const dishRows = useMemo(() => (dishes || []).map((dish: any) => ({
    ...dish,
    active: activeDishes.has(dish.id),
    published: publishedDishes.has(dish.id),
    locked: dish.tier > (progress.restaurantLevel || 1) || dish.tier > (progress.chefLevel || 1),
  })), [dishes, progress.activeDishIds, progress.publishedDishIds])

  return (
    <main className="app-shell">
      <div className="atmosphere" aria-hidden="true" />
      <div className="phone-shell">
      <section className="game-frame">
        <header className="topbar glass-panel">
          <div className="brand"><span className="brand-mark">味</span><div><b>百味饭馆</b><small>弹幕经营实验场</small></div></div>
          <div className="resource-strip">
            <Resource icon="🪙" label="现金" value={resources.cash ?? 0} tone="gold" />
            <Resource icon="🔴" label="红" value={resources.red ?? 0} tone="red" />
            <Resource icon="🟢" label="绿" value={resources.green ?? 0} tone="green" />
            <Resource icon="🔵" label="蓝" value={resources.blue ?? 0} tone="blue" />
            <Resource icon="✦" label="铭牌" value={resources.badges ?? 0} tone="purple" />
          </div>
          <div className="run-status"><span className="live-dot" /> LIVE · 第 {state.clock?.tick ?? 0} 秒</div>
        </header>

        <section className="hero-copy">
          <div><span className="eyebrow">NIGHT MARKET / 01</span><h1>今晚，听弹幕开饭。</h1><p>客人会来、订单会排队，掌勺猫正在等你的下一条指令。</p></div>
          <div className="hero-badges"><span>Lv.{progress.restaurantLevel ?? 1} {state.restaurantName || '折叠面摊'}</span><span>厨师 Lv.{progress.chefLevel ?? 1}</span></div>
        </section>

        <section className="restaurant-board glass-panel">
          <div className="board-heading"><div><span className="section-kicker">01 · 来客动线</span><h2>小馆正在营业</h2></div><div className="board-metrics"><span>今日客流 <b>{stats.todayGuests ?? 0}</b></span><span>营业额 <b>¥{stats.todayRevenue ?? 0}</b></span></div></div>
          <div className="flow-grid">
            <Stage title="排队区" subtitle={`${queue.length}/${state.config?.queueCapacity ?? (progress.restaurantLevel === 3 ? 8 : progress.restaurantLevel === 2 ? 6 : 5)} 位`} className="queue-stage">
              <div className="queue-list">{queue.length ? queue.map((guest: any, index: number) => <GuestCard key={guest.id || index} guest={guest} index={index} />) : <EmptyState icon="☾" text="等第一位客人" />}</div>
            </Stage>
            <Stage title="桌位区" subtitle={`${seats.filter((seat: any) => seat.status !== 'empty').length}/${seats.length || 3} 桌`} className="seat-stage">
              <div className="seat-list">{seats.map((seat: any, index: number) => <SeatCard key={seat.id || index} seat={{ ...seat, guestName: (guestsById.get(seat.guestId) as any)?.name }} index={index} />)}</div>
            </Stage>
            <Stage title="灶眼区" subtitle={`${stoves.filter((stove: any) => stove.orderId).length}/${stoves.length || 1} 开火`} className="stove-stage">
              <div className="stove-list">{stoves.map((stove: any, index: number) => <StoveCard key={stove.id || index} stove={{ ...stove, dishName: dishName((ordersById.get(stove.orderId) as any)?.dishId) }} index={index} />)}</div>
            </Stage>
            <Stage title="待出餐" subtitle={`${readyOrders.length} 道菜`} className="ready-stage">
              <div className="ready-list">{readyOrders.length ? readyOrders.map((order: any, index: number) => <div className="ready-order" key={order.id || index}><span className="dish-bowl">🥣</span><div><b>{dishName(order.dishId)}</b><small>等待 {formatTime(order.waitingRemaining)}</small></div></div>) : <EmptyState icon="♨" text="灶台还在忙" />}</div>
              <button className="primary-button serve-button" onClick={() => send(issue('SERVE'), '现在没有可以出餐的菜。')}>出餐 <span>↗</span></button>
            </Stage>
          </div>
        </section>

        <section className="chef-strip">
          <div className="chef-placeholder"><div className="chef-halo" /><div className="chef-face">🐱</div><span>掌勺猫</span></div>
          <div className="kitchen-copy"><span className="section-kicker">厨房状态</span><h3>{stoves.some((stove: any) => stove.orderId) ? '火候正旺，别让客人等太久' : '灶台空着，下一桌客人快来了'}</h3><p>{effects.donutRemaining > 0 ? `甜甜圈自动出餐剩余 ${formatTime(effects.donutRemaining)}` : '输入「出餐」或点击按钮，把热气送到桌边。'}</p></div>
          <div className="mini-stats"><span>上架菜 <b>{publishedDishes.size}/{state.config?.dishCapacity ?? 3}</b></span><span>药丸抽数 <b>{progress.pillDrawCount ?? 0}/10</b></span></div>
        </section>

        <section className="control-grid">
          <div className="control-card glass-panel menu-card">
            <div className="tabs"><button className={activeTab === 'menu' ? 'active' : ''} onClick={() => setActiveTab('menu')}>菜单 / 研发</button><button className={activeTab === 'upgrade' ? 'active' : ''} onClick={() => setActiveTab('upgrade')}>成长</button><button className={activeTab === 'gifts' ? 'active' : ''} onClick={() => setActiveTab('gifts')}>礼物互动</button></div>
            {activeTab === 'menu' && <div className="panel-body"><div className="panel-title"><div><span className="section-kicker">厨房菜单</span><h3>选择今晚的招牌</h3></div><span className="capacity-chip">{publishedDishes.size}/{state.config?.dishCapacity ?? 3} 上架</span></div><div className="dish-grid">{dishRows.slice(0, 8).map((dish: any) => <div className={`dish-row ${dish.active && !dish.locked ? 'unlocked' : 'locked'}`} key={dish.id}><span className={`dish-dot tier-${dish.tier}`}>{dish.tier}</span><div className="dish-info"><b>{dish.name}</b><small>¥{dish.price} · {dish.cookSeconds}s {dish.locked ? '· 条件未满足' : ''}</small></div>{dish.active ? <button className={dish.published ? 'tiny-button selected' : 'tiny-button'} onClick={() => send(issue(dish.published ? 'UNPUBLISH_DISH' : 'PUBLISH_DISH', { dishId: dish.id }), dish.published ? '已从菜单撤下。' : '已端上菜单。')}>{dish.published ? '上架中' : '上架'}</button> : <button className="tiny-button research" onClick={() => send(issue('RESEARCH_DISH', { dishId: dish.id }), '研发条件不足，先攒一攒资源。')} disabled={dish.locked}>研发</button>}</div>)}</div></div>}
            {activeTab === 'upgrade' && <div className="panel-body upgrade-body"><UpgradeRow title="饭馆升级" current={`Lv.${progress.restaurantLevel ?? 1}`} detail={availableUpgrade?.restaurant?.requirement || '下一等级提升桌位、灶眼和客流'} onClick={() => send(issue('UPGRADE_RESTAURANT'), '饭馆升级条件还未满足。')} /><UpgradeRow title="厨师升级" current={`Lv.${progress.chefLevel ?? 1}`} detail={availableUpgrade?.chef?.requirement || '提升可做品级与烹饪速度'} onClick={() => send(issue('UPGRADE_CHEF'), '厨师升级条件还未满足。')} /></div>}
            {activeTab === 'gifts' && <div className="panel-body gift-body"><GiftButton icon="🪄" title="仙女棒" sub={`当前订单最多 4 根`} onClick={() => send(issue('GIFT_WAND'), '没有烹饪中的订单，仙女棒没有消耗。')} /><GiftButton icon="💊" title="能量药丸" sub={`第 ${((progress.pillDrawCount ?? 0) % 10) + 1} 抽`} onClick={() => send(issue('GIFT_PILL'), '药丸已送达厨房。')} /><GiftButton icon="🪞" title="魔法镜" sub={`${effects.mirror?.layers ?? 0}/3 层`} onClick={() => send(issue('GIFT_MIRROR'), '魔法镜最多叠 3 层。')} /><GiftButton icon="🍩" title="甜甜圈" sub={`${formatTime(effects.donutRemaining)} 自动出餐`} onClick={() => send(issue('GIFT_DONUT'), '甜甜圈效果已加入队列。')} /><GiftButton icon="💣" title="炸弹" sub={effects.bombCooldown > 0 ? `冷却 ${formatTime(effects.bombCooldown)}` : '招揽客人'} onClick={() => send(issue('GIFT_BOMB'), '当前空位不足，炸弹没有消耗。')} /></div>}
          </div>

          <div className="control-card glass-panel debug-card"><div className="panel-title"><div><span className="section-kicker">LIVE CONTROL</span><h3>直播控制台</h3></div><span className="pulse-label"><span className="live-dot" /> 状态同步中</span></div><div className="speed-row"><span>时间倍率</span><div className="segmented">{[1, 2, 5].map((value) => <button key={value} className={speed === value ? 'active' : ''} onClick={() => send(issue('SET_SPEED', { speed: value }))}>{value}×</button>)}</div><button className="pause-button" onClick={() => send(issue(state.clock?.paused ? 'RESUME' : 'PAUSE'))}>{state.clock?.paused ? '继续' : '暂停'}</button></div><div className="command-box"><span className="command-icon">▸</span><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleInput(command) }} placeholder="输入弹幕指令，例如：出餐" /><button onClick={() => handleInput(command)}>发送</button></div><div className="notice-line">{notice || '观众正在等待你的下一条操作…'}</div><div className="log-list">{logs.map((log: any, index: number) => <div className="log-row" key={`${log.tick}-${index}`}><span className="log-time">{formatTime(log.tick)}</span><span>{log.message || log.text}</span></div>)}</div></div>
        </section>
        <section className="gift-rail glass-panel"><div className="gift-rail-copy"><span className="section-kicker">观众礼物</span><b>把热度送进厨房</b></div><div className="gift-rail-buttons"><QuickGift icon="💗" label="心动" onClick={() => send(issue('GIFT_MIRROR'))} /><QuickGift icon="⏱" label="加速" onClick={() => send(issue('GIFT_DONUT'))} /><QuickGift icon="👨‍🍳" label="上菜" onClick={() => send(issue('SERVE'))} /><QuickGift icon="🔥" label="仙女棒" onClick={() => send(issue('GIFT_WAND'))} /><QuickGift icon="❄" label="炸弹" onClick={() => send(issue('GIFT_BOMB'))} /></div><div className="viewer-strip"><span className="viewer-avatar">👤</span><span className="viewer-avatar">🐼</span><span className="viewer-avatar">🌸</span><small>3,126 位观众正在围观</small></div></section>
        <footer><span>SVG / 占位图视觉冻结 · 规则来自 H5 实现方案 v1</span><span>本地模拟事件 · 无真实平台接入</span></footer>
      </section>
      </div>
    </main>
  )
}

function Resource({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) { return <div className={`resource resource-${tone}`}><span>{icon}</span><div><small>{label}</small><b>{value}</b></div></div> }
function Stage({ title, subtitle, className, children }: { title: string; subtitle: string; className: string; children: React.ReactNode }) { return <div className={`stage ${className}`}><div className="stage-title"><span>{title}</span><small>{subtitle}</small></div>{children}</div> }
function EmptyState({ icon, text }: { icon: string; text: string }) { return <div className="empty-state"><span>{icon}</span><small>{text}</small></div> }
function GuestCard({ guest, index }: { guest: any; index: number }) { return <div className="guest-card"><span className="avatar">{['🧑🏻‍🎓', '👷🏻', '🧑🏻‍💼', '🧑🏻‍🍳', '👴🏻'][index % 5]}</span><div><b>{guest.name || guest.type || '食客'}</b><small>{formatTime(guest.patienceRemaining ?? guest.patience)} 耐心</small></div><span className="queue-index">#{index + 1}</span></div> }
function SeatCard({ seat, index }: { seat: any; index: number }) { const occupied = seat.status && seat.status !== 'empty'; return <div className={`seat-card ${occupied ? 'occupied' : ''}`}><span className="seat-icon">{occupied ? '🍜' : '○'}</span><div><b>{occupied ? (seat.guestName || seat.guestId || '用餐中') : `空桌 ${index + 1}`}</b><small>{occupied ? (seat.status || '等待') : '等待来客'}</small></div></div> }
function StoveCard({ stove, index }: { stove: any; index: number }) { const active = Boolean(stove.orderId); const percent = active ? Math.max(0, Math.min(100, (1 - ((stove.remainingSeconds ?? stove.remaining ?? 0) / Math.max(1, stove.totalSeconds ?? stove.total ?? 1))) * 100)) : 0; return <div className={`stove-card ${active ? 'cooking' : ''}`}><span className="stove-icon">{active ? '🔥' : '♨'}</span><div className="stove-info"><b>{active ? (stove.dishName || stove.orderId) : `灶眼 ${index + 1}`}</b><div className="progress"><i style={{ width: `${percent}%` }} /></div><small>{active ? formatTime(stove.remainingSeconds ?? stove.remaining) : '空闲'}</small></div></div> }
function UpgradeRow({ title, current, detail, onClick }: { title: string; current: string; detail: string; onClick: () => void }) { return <div className="upgrade-row"><div className="upgrade-icon">↗</div><div><span>{title}</span><b>{current}</b><small>{detail}</small></div><button className="tiny-button" onClick={onClick}>升级</button></div> }
function GiftButton({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) { return <button className="gift-button" onClick={onClick}><span className="gift-icon">{icon}</span><span><b>{title}</b><small>{sub}</small></span><em>+</em></button> }
function QuickGift({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) { return <button className="quick-gift" onClick={onClick}><span>{icon}</span><small>{label}</small></button> }

export default App
