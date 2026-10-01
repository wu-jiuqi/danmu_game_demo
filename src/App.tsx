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

function App() {
  const [state, setState] = useState<AnyState>(() => safeInitial())
  const [command, setCommand] = useState('')
  const [upgradeModal, setUpgradeModal] = useState<'restaurant' | 'chef' | null>(null)
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

  useEffect(() => {
    if (!upgradeModal) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUpgradeModal(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [upgradeModal])

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
  const currentRestaurant = api.RESTAURANTS?.[(progress.restaurantLevel || 1) - 1] || { seats: 3, stoves: 1, dishSlots: 3 }
  const dishCapacity = currentRestaurant.dishSlots ?? 3
  const seatCapacity = currentRestaurant.seats ?? 3
  const stoveCapacity = currentRestaurant.stoves ?? 1

  // The engine's dishId is the only source of truth. Never substitute prototype
  // labels here: the same ID is used for the order, stove, serving and checkout.
  const dishName = useCallback((id: string | undefined) => dishes.find((item: any) => item.id === id)?.name || id || '热菜', [dishes])

  const recipeRows = useMemo(() => dishes.map((dish: any) => {
    const id = dish.id
    const active = activeDishes.has(id)
    const published = publishedDishes.has(id)
    const researchAffordable = Boolean(dish) && Object.entries(dish.research || {}).every(([key, value]) => (resources[key] ?? 0) >= Number(value))
    const restaurantLocked = !dish || dish.tier > (progress.restaurantLevel || 1)
    const chefLocked = !dish || dish.tier > (progress.chefLevel || 1)
    const researchGap = Object.entries(dish?.research || {}).map(([key, value]) => [resourceLabels[key] || key, Math.max(0, Number(value) - Number(resources[key] || 0))] as const).filter(([, value]) => value > 0).map(([key, value]) => `${key}${value}`)
    const researchCost = Object.entries(dish?.research || {}).map(([key, value]) => `${resourceLabels[key] || key}${value}`).join('、') || '免费'
    const researchLocked = restaurantLocked || !researchAffordable
    const cookLocked = active && chefLocked
    const locked = (!active && researchLocked) || cookLocked
    const publishedIndex = [...publishedDishes].indexOf(id)
    const lockReason = [
      restaurantLocked ? `饭馆 Lv.${dish?.tier || 2} 解锁` : '',
      chefLocked ? `厨师 Lv.${dish?.tier || 2} 解锁烹饪` : '',
      !active ? `研发消耗 ${researchCost}` : '',
      researchGap.length ? `还差${researchGap.join('、')}` : '',
    ].filter(Boolean).join(' · ') || '可研发'
    const subtitle = cookLocked
      ? `厨师 Lv.${dish?.tier || 2} 解锁 · 暂不可烹饪`
      : active && published
      ? `上架位 ${publishedIndex + 1} / ${dishCapacity} · 可点单`
      : active ? '已激活 · 等待上架位' : lockReason
    const status = cookLocked ? '厨师锁定' : active && published ? '已上架' : active ? '已激活' : researchLocked ? '已锁定' : '可研发'
    const action = active ? (published ? '下架' : '上架') : '研发'
    return { id, dish, name: dish?.name || '热菜', active, published, locked: locked || cookLocked, subtitle, status, action }
  }), [activeDishes, dishCapacity, dishes, progress.chefLevel, progress.restaurantLevel, publishedDishes, resources])

  const latestLog = stats.logs?.[stats.logs.length - 1]
  const displayLogs = [...(stats.logs || [])].slice(-5)
  const visibleStoves = useMemo(() => {
    const result = [...stoves]
    const readyOrder = readyOrders[0]
    const idleIndex = result.findIndex((stove: any) => stove.status === 'idle')
    if (readyOrder && idleIndex >= 0) result[idleIndex] = { id: 'ready-order-stove', status: 'ready', orderId: readyOrder.id, remaining: readyOrder.waitingRemaining }
    // If every burner is occupied, the dedicated ready-orders panel remains the
    // source of truth and the burner row keeps its configured capacity.
    while (result.length < stoveCapacity) result.push({ id: `empty-stove-${result.length + 1}`, status: 'idle', remaining: 0 })
    return result
  }, [readyOrders, stoveCapacity, stoves])

  const readyPreview = readyOrders.slice(0, 3)
  const cookingOrder = stoves.map((stove: any) => ordersById.get(stove.orderId)).find((order: any) => order?.status === 'cooking')
  const latestCheckout = latestLog?.kind === 'checkout' ? latestLog : undefined
  const nextRestaurant = availableUpgrade?.restaurant
  const nextChef = availableUpgrade?.chef
  const upgradeRestaurantConfig = nextRestaurant ? api.RESTAURANTS?.[nextRestaurant.level - 1] : undefined
  const upgradeChefConfig = nextChef ? api.CHEFS?.[nextChef.level - 1] : undefined
  const currentRestaurantLevel = progress.restaurantLevel ?? 1
  const currentChefLevel = progress.chefLevel ?? 1
  const currentChefConfig = api.CHEFS?.[currentChefLevel - 1]
  const currentRestaurantConfig = api.RESTAURANTS?.[currentRestaurantLevel - 1]

  const handleUpgrade = (kind: 'restaurant' | 'chef') => {
    const commandType = kind === 'restaurant' ? 'UPGRADE_RESTAURANT' : 'UPGRADE_CHEF'
    const beforeLevel = kind === 'restaurant' ? currentRestaurantLevel : currentChefLevel
    const next = api.dispatch(state, issue(commandType))
    const afterLevel = kind === 'restaurant' ? next.progress?.restaurantLevel : next.progress?.chefLevel
    const upgraded = afterLevel > beforeLevel
    apply(next, upgraded ? `${kind === 'restaurant' ? '饭馆' : '厨师'}已升级到 Lv.${afterLevel}` : `${kind === 'restaurant' ? '饭馆' : '厨师'}升级条件还未满足。`, true)
    if (upgraded) setUpgradeModal(null)
  }

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
          <div className="brand-lockup"><div className="live-brand"><span className="live-pill">LIVE</span><strong>百味饭馆</strong></div><span>24H 夜市经营 · 观众互动中</span></div>
          <button className="level-badge restaurant-level" onClick={() => setUpgradeModal('restaurant')} aria-label="打开饭馆升级详情"><strong>饭馆 Lv.{progress.restaurantLevel ?? 1}</strong><span>{availableUpgrade?.restaurant ? (availableUpgrade.restaurant.affordable ? '查看 · 可升级' : '查看升级条件') : '已满级'}</span></button>
          <button className="level-badge chef-level" onClick={() => setUpgradeModal('chef')} aria-label="打开厨师升级详情"><strong>厨师 Lv.{progress.chefLevel ?? 1}</strong><span>{availableUpgrade?.chef ? (availableUpgrade.chef.affordable ? '查看 · 可升级' : '查看升级条件') : '已满级'}</span></button>
          <div className="resource-row"><ResourceBadge label="现金" value={resources.cash ?? 0} icon="$" tone="gold" /><ResourceBadge label="红食材" value={resources.red ?? 0} icon="R" tone="red" /><ResourceBadge label="绿食材" value={resources.green ?? 0} icon="G" tone="green" /><ResourceBadge label="蓝食材" value={resources.blue ?? 0} icon="B" tone="cyan" /><ResourceBadge label="铭牌碎片" value={resources.badges ?? 0} icon="✦" tone="violet" /><ResourceBadge label="今日客流" value={stats.todayGuests ?? 0} icon="♥" tone="pink" /><ResourceBadge label="营业额" value={`¥${stats.todayRevenue ?? 0}`} icon="↗" tone="cream" /></div>
        </header>

        <div className="workspace-grid">
          <aside className="recipe-panel panel-surface"><PanelHeading title="菜单与升级" subtitle={`${recipeRows.length} 道菜 · 研发 / 上架 / 锁定`} /><div className="recipe-list">{recipeRows.map((recipe: any) => <RecipeStateCard key={recipe.id} recipe={recipe} onAction={(commandType: string) => send(issue(commandType, { dishId: recipe.id }), recipe.action === '上架' ? '已端上菜单。' : '已更新菜单状态。')} />)}</div><div className="upgrade-summary"><div className="upgrade-summary-head"><strong>升级中心</strong><span>点击查看详情</span></div><UpgradeMiniCard kind="restaurant" currentLevel={currentRestaurantLevel} next={nextRestaurant} config={upgradeRestaurantConfig} onClick={() => setUpgradeModal('restaurant')} /><UpgradeMiniCard kind="chef" currentLevel={currentChefLevel} next={nextChef} config={upgradeChefConfig} onClick={() => setUpgradeModal('chef')} /></div></aside>

          <section className="main-stage panel-surface">
            <PanelHeading title="经营舞台" subtitle={`夜市 23:48 · Tick ${state.clock?.paused ? '暂停' : '进行中'}`} action={<span className="stage-chip">主舞台可见</span>} />
            <div className="lantern-row" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>
            <div className="queue-strip"><div className="queue-label"><strong>排队区</strong><span>{queue.length} 位客人</span></div><div className="queue-avatars">{queue.slice(0, 3).map((guest: any, index: number) => <QueueAvatar key={guest.id || index} guest={guest} index={index} />)}{queue.length === 0 && <span className="queue-empty">等待第一位客人</span>}</div><div className="order-bubble"><strong>{queue[0] ? '等待落座后点单' : '等待下一笔订单'}</strong><span>{queue[0] ? `耐心 ${secondsLabel(queue[0].patienceRemaining)}` : '排队中 --'}</span><ProgressBar value={queue[0] ? Math.max(0.08, Math.min(1, (queue[0].patienceRemaining || 0) / Math.max(1, queue[0].patience || 1))) : 0.12} tone="queue" /></div></div>
            <h3 className="stage-section-title">桌台与客人状态</h3>
            <div className="table-row">{(seats.length ? seats : Array.from({ length: seatCapacity }, (_, index) => ({ id: `seat-${index + 1}`, status: 'empty' }))).slice(0, seatCapacity).map((seat: any, index: number) => <TableCard key={seat.id || index} seat={seat} index={index} guest={guestsById.get(seat.guestId)} order={ordersById.get(seat.orderId)} dishName={dishName} />)}</div>
            <div className="ready-orders-panel"><div><strong>待出餐</strong><span>{readyOrders.length} 份 · 超时将离开且不结算</span></div><div className="ready-order-list">{readyPreview.length ? readyPreview.map((order: any) => <button key={order.id} onClick={() => send(issue('SERVE', { orderId: order.id }), '已尝试出餐。')}><span>{dishName(order.dishId)}</span><b>{secondsLabel(order.waitingRemaining)}</b></button>) : <small>暂无待出餐订单</small>}</div></div>
            <div className="chef-station"><div className="chef-copy"><div className="chef-avatar">厨</div><div><strong>厨师与灶眼</strong><span>阿灶师傅 · Lv.{progress.chefLevel ?? 1}</span><small>灶眼 {stoveCapacity} 个 · 烹饪规则来自状态机</small></div></div><div className="burner-row">{visibleStoves.map((stove: any, index: number) => <BurnerCard key={stove.id || index} stove={stove} index={index} order={ordersById.get(stove.orderId)} dishName={dishName} onServe={() => send(issue('SERVE'), '现在没有可以出餐的菜。')} />)}</div></div>
            {latestCheckout && <div className="reward-toast">{latestCheckout.message} · 结账成功</div>}
          </section>

          <aside className="gift-panel panel-surface"><div className="live-gift-head"><span className="live-pill">LIVE</span><strong>直播间礼物</strong><span>观众互动会即时影响厨房</span></div><PanelHeading title="礼物技能" subtitle="点击礼物送入厨房 · 规则由状态机校验" /><div className="skill-list"><SkillTile title="红色仙女棒" description={`时间缩短 · ${cookingOrder?.wandUses ?? 0}/4 根`} meta={effects.wizardCooldown > 0 ? `冷却 ${secondsLabel(effects.wizardCooldown)}` : '可使用'} tone="pink" glyph="P" onClick={() => send(issue('GIFT_WAND'), '没有烹饪中的订单，仙女棒没有消耗。')} /><SkillTile title="能量药丸" description="随机奖励 · 10 抽保底" meta={`第 ${((progress.pillDrawCount ?? 0) % 10) + 1} 抽`} tone="cyan" glyph="E" onClick={() => send(issue('GIFT_PILL'), '药丸已送达厨房。')} /><SkillTile title="魔法镜" description={`客流倍率 · 层数 ${effects.mirror?.layers ?? 0}/3`} meta={effects.mirror?.remaining ? `剩余 ${secondsLabel(effects.mirror.remaining)}` : '持续 30s · 可使用'} tone="violet" glyph="M" onClick={() => send(issue('GIFT_MIRROR'), '魔法镜最多叠 3 层。')} /><SkillTile title="甜甜圈" description="自动出餐 · 单次 60s" meta={effects.donutRemaining ? `剩余 ${secondsLabel(effects.donutRemaining)} / 180s` : '最多储存 180s'} tone="green" glyph="D" onClick={() => send(issue('GIFT_DONUT'), '甜甜圈效果已加入队列。')} /><SkillTile title="炸弹" description={`一次性招客 · 至少 3 个空位`} meta={effects.bombCooldown ? `冷却 ${secondsLabel(effects.bombCooldown)}` : '可使用'} tone="orange" glyph="B" onClick={() => send(issue('GIFT_BOMB'), '当前空位不足或炸弹仍在冷却。')} /></div></aside>
        </div>

        <footer className="chat-feed"><div className="feed-title"><strong>弹幕日志</strong><span>状态变化会被记录，不绕过规则</span></div><div className="feed-logs">{displayLogs.map((log: any, index: number) => <LogCard key={`${log.id || log.tick}-${index}`} log={log} />)}</div><div className="command-bar"><input aria-label="模拟出餐指令" placeholder="输入框（原型占位）：出餐 / 排1 / 暂停" value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleInput(command) }} /><button onClick={() => command.trim() ? handleInput(command) : send(issue('SERVE'), '当前没有可以出餐的菜。')}>模拟出餐</button><div className="debug-controls"><span>调试</span><button className={state.clock?.paused ? 'active' : ''} onClick={() => send(issue(state.clock?.paused ? 'RESUME' : 'PAUSE'))}>{state.clock?.paused ? '继续' : '暂停'}</button><button className={state.clock?.speed === 1 ? 'active' : ''} onClick={() => send(issue('SET_SPEED', { speed: 1 }))}>1x</button><button className={state.clock?.speed === 2 ? 'active' : ''} onClick={() => send(issue('SET_SPEED', { speed: 2 }))}>2x</button><button className={state.clock?.speed === 5 ? 'active' : ''} onClick={() => send(issue('SET_SPEED', { speed: 5 }))}>5x</button></div></div><div className="a11y-note"><span>可访问性</span><strong>高对比 · 减少动效</strong></div><span className="sr-only" aria-live="polite">{notice}</span></footer>
        {upgradeModal && <UpgradeModal kind={upgradeModal} currentLevel={upgradeModal === 'restaurant' ? currentRestaurantLevel : currentChefLevel} currentConfig={upgradeModal === 'restaurant' ? currentRestaurantConfig : currentChefConfig} next={upgradeModal === 'restaurant' ? nextRestaurant : nextChef} nextConfig={upgradeModal === 'restaurant' ? upgradeRestaurantConfig : upgradeChefConfig} resources={resources} restaurantLevel={currentRestaurantLevel} onUpgrade={() => handleUpgrade(upgradeModal)} onClose={() => setUpgradeModal(null)} />}
      </section>
    </main>
  )
}

function ResourceBadge({ label, value, icon, tone }: { label: string; value: string | number; icon: string; tone: string }) { return <div className={`resource-badge tone-${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div> }
function PanelHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="panel-heading"><div><h2>{title}</h2><span>{subtitle}</span></div>{action}</div> }
const levelNames = { restaurant: ['折叠面摊', '家常小饭馆', '热闹小酒楼'], chef: ['学徒帮厨', '家常厨师', '掌勺厨师'] } as const
const resourceLabels: Record<string, string> = { cash: '现金', badges: '铭牌碎片', red: '红食材', green: '绿食材', blue: '蓝食材' }

function UpgradeMiniCard({ kind, currentLevel, next, config, onClick }: { kind: 'restaurant' | 'chef'; currentLevel: number; next: any; config: any; onClick: () => void }) {
  const isMax = !next || !config
  const effect = kind === 'restaurant' ? (isMax ? '容量已达上限' : `桌位 ${config.seats} · 灶眼 ${config.stoves}`) : (isMax ? '效率已达上限' : `速度 ×${config.speed} · 可做 Lv.${config.maxTier}`)
  const cost = next?.cost ? Object.entries(next.cost).map(([key, value]) => `${resourceLabels[key] || key} ${value}`).join(' · ') : '无需继续升级'
  return <button className={`upgrade-mini-card ${kind === 'chef' ? 'is-chef' : ''} ${isMax ? 'is-max' : ''}`} onClick={onClick}><span className="upgrade-mini-icon">{kind === 'restaurant' ? '馆' : '厨'}</span><span className="upgrade-mini-copy"><strong>{kind === 'restaurant' ? '饭馆' : '厨师'} Lv.{currentLevel}{isMax ? ' · MAX' : ` → Lv.${next.level}`}</strong><small>{isMax ? effect : `${cost} · ${effect}`}</small></span><b>{isMax ? '查看' : '详情'}</b></button>
}

function UpgradeModal({ kind, currentLevel, currentConfig, next, nextConfig, resources, restaurantLevel, onUpgrade, onClose }: { kind: 'restaurant' | 'chef'; currentLevel: number; currentConfig: any; next: any; nextConfig: any; resources: AnyState; restaurantLevel: number; onUpgrade: () => void; onClose: () => void }) {
  const isMax = !next || !nextConfig
  const currentName = levelNames[kind][Math.max(0, currentLevel - 1)]
  const nextName = next ? levelNames[kind][Math.max(0, next.level - 1)] : '已达最高等级'
  const costs = Object.entries(next?.cost || {}) as [string, number][]
  const missingResources = costs.filter(([key, value]) => Number(resources[key] || 0) < Number(value))
  const missingRestaurant = kind === 'chef' && Boolean(nextConfig?.restaurant) && restaurantLevel < Number(nextConfig.restaurant)
  const blockers = [
    ...missingResources.map(([key, value]) => `还差${resourceLabels[key] || key}${Number(value) - Number(resources[key] || 0)}`),
    ...(missingRestaurant ? [`需要饭馆 Lv.${nextConfig.restaurant}`] : []),
  ]
  const canUpgrade = Boolean(next && next.affordable && !missingRestaurant)
  const metricRows = kind === 'restaurant'
    ? [['桌位', currentConfig?.seats, nextConfig?.seats], ['排队位', currentConfig?.queue, nextConfig?.queue], ['灶眼', currentConfig?.stoves, nextConfig?.stoves], ['菜位', currentConfig?.dishSlots, nextConfig?.dishSlots], ['客流 / 分钟', currentConfig?.guestsPerMinute, nextConfig?.guestsPerMinute]]
    : [['烹饪速度', currentConfig?.speed ? `×${currentConfig.speed.toFixed(2)}` : '—', nextConfig?.speed ? `×${nextConfig.speed.toFixed(2)}` : '—'], ['可做菜品', currentConfig?.maxTier ? `Lv.${currentConfig.maxTier}` : '—', nextConfig?.maxTier ? `Lv.${nextConfig.maxTier}` : '—']]
  return <div className="upgrade-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`upgrade-modal ${kind === 'chef' ? 'is-chef' : ''}`} role="dialog" aria-modal="true" aria-labelledby="upgrade-modal-title"><header className="upgrade-modal-header"><div><span className="upgrade-kicker">成长路线 · {kind === 'restaurant' ? '经营空间' : '厨房效率'}</span><h2 id="upgrade-modal-title">{kind === 'restaurant' ? '饭馆升级' : '厨师升级'}</h2><p>{currentName} <span>→</span> {nextName}</p></div><button className="upgrade-modal-close" onClick={onClose} aria-label="关闭升级详情">×</button></header>{isMax ? <div className="upgrade-max-state"><strong>已达到 Lv.3 最高等级</strong><span>{kind === 'restaurant' ? '桌位、排队位、灶眼和菜位都已开放到当前 Demo 上限。' : '已可制作全部 3 级菜，烹饪速度达到 ×1.50。'}</span></div> : <><div className="upgrade-cost-row"><strong>升级消耗</strong><div className="upgrade-costs">{costs.length ? costs.map(([key, value]) => <span key={key} className={Number(resources[key] || 0) >= Number(value) ? 'is-ready' : 'is-missing'}><b>{resourceLabels[key] || key}</b><em>{resources[key] || 0} / {value}</em></span>) : <span className="is-ready"><b>免费</b><em>无需消耗</em></span>}</div></div><div className="upgrade-metrics"><div className="upgrade-metrics-head"><strong>升级后变化</strong><span>当前 → 下一级</span></div>{metricRows.map(([label, before, after]) => <div className="upgrade-metric" key={String(label)}><span>{label}</span><strong>{String(before ?? '—')} <b>→</b> {String(after ?? '—')}</strong></div>)}</div><div className={`upgrade-requirement ${canUpgrade ? 'is-ready' : 'is-blocked'}`}><span>{canUpgrade ? '✓' : '!'}</span><div><strong>{canUpgrade ? '升级条件已满足' : blockers.length ? blockers.join(' · ') : next.requirement}</strong><small>{canUpgrade ? '升级后会立即同步到经营舞台和菜单解锁。' : '补齐条件后再回来升级，规则由状态机统一校验。'}</small></div></div><button className="upgrade-primary" disabled={!canUpgrade} onClick={onUpgrade}>{canUpgrade ? `升级到 Lv.${next.level}` : '条件未满足'}</button></>}</section></div>
}
function RecipeStateCard({ recipe, onAction }: { recipe: any; onAction: (commandType: string) => void }) { const commandType = recipe.active ? (recipe.published ? 'UNPUBLISH_DISH' : 'PUBLISH_DISH') : 'RESEARCH_DISH'; const disabled = recipe.locked; const buttonLabel = recipe.locked && recipe.active ? '需升级' : recipe.locked && recipe.subtitle.includes('还差') ? '缺资源' : recipe.action; return <article className={`recipe-card ${recipe.locked ? 'is-locked' : ''} tone-${recipe.locked ? 'muted' : recipe.published ? 'green' : 'warning'}`}><span className="state-dot" /><strong>{recipe.name}</strong><span className="recipe-status">{recipe.status}</span><small title={recipe.subtitle}>{recipe.subtitle}</small><button disabled={disabled} title={recipe.subtitle} aria-label={`${recipe.name}：${recipe.subtitle}`} onClick={() => onAction(commandType)}>{buttonLabel}</button></article> }
function QueueAvatar({ guest, index }: { guest: any; index: number }) { return <div className={`queue-avatar avatar-${index}`}><strong>{(guest.name || '客').slice(0, 1)}</strong><span>{guest.name || `客人 ${index + 1}`}</span></div> }
function TableCard({ seat, guest, order, index, dishName }: { seat: any; guest: any; order: any; index: number; dishName: (id?: string) => string }) { const occupied = seat.status === 'occupied'; const status = !occupied ? '空闲' : order?.status === 'queued' ? '等待上灶' : order?.status === 'cooking' ? '烹饪中' : order?.status === 'ready' ? '等待出餐' : order?.status === 'served' ? '用餐中' : '处理中'; const tone = !occupied ? 'muted' : order?.status === 'ready' ? 'coral' : order?.status === 'cooking' ? 'orange' : 'green'; const progress = order?.status === 'ready' ? 1 - ((order.waitingRemaining || 0) / Math.max(1, order.waitingTotal || 10)) : order?.status === 'cooking' ? Math.max(0.08, Math.min(1, 1 - ((order.remaining || 0) / Math.max(1, order.baseSeconds || 1)))) : order?.status === 'served' ? 0.9 : occupied ? 0.2 : 0.28; const dishLabel = order ? dishName(order.dishId) : occupied ? '等待点单' : '等待下一位'; return <article className={`table-card tone-${tone} ${occupied ? 'occupied' : ''}`}><div className="table-avatar">{occupied ? (guest?.name || '客').slice(0, 1) : '空'}</div><div><strong>{occupied ? (guest?.name || '客人') : '空桌'}</strong><span>{status}</span><small>{order?.status === 'ready' ? `${dishLabel} · 请出餐 ${secondsLabel(order.waitingRemaining)}` : order?.status === 'cooking' ? `${dishLabel} · ${secondsLabel(order.remaining)}` : dishLabel}</small></div><ProgressBar value={progress} tone={tone} /></article> }
function BurnerCard({ stove, order, index, dishName, onServe }: { stove: any; order: any; index: number; dishName: (id?: string) => string; onServe: () => void }) { const active = stove.status === 'cooking' && order; const value = active ? Math.max(0.08, Math.min(1, 1 - (stove.remaining / Math.max(1, order.baseSeconds)))) : 0; return <article className={`burner-card ${active ? 'cooking' : 'ready'} tone-${active ? 'orange' : order?.status === 'ready' ? 'coral' : 'muted'}`}><strong>灶眼 0{index + 1} · {active ? '烹饪中' : order?.status === 'ready' ? '待出餐' : '空闲'}</strong><span>{active || order ? dishName(order?.dishId) : '等待订单'}</span>{active ? <><b>{secondsLabel(stove.remaining)}</b><ProgressBar value={value} tone="orange" /></> : order?.status === 'ready' ? <button onClick={onServe}>可以出餐 · 最早订单</button> : <small>等待下一笔订单</small>}</article> }
function ProgressBar({ value, tone }: { value: number; tone: string }) { return <span className={`progress-bar tone-${tone}`}><i style={{ width: `${Math.max(4, Math.min(100, value * 100))}%` }} /></span> }
function SkillTile({ title, description, meta, tone, glyph, onClick }: { title: string; description: string; meta: string; tone: string; glyph: string; onClick: () => void }) { return <button className={`skill-tile tone-${tone}`} onClick={onClick}><span className="skill-glyph">{glyph}</span><span className="skill-copy"><strong>{title}</strong><small>{description}</small><em>{meta}</em></span><b>用</b></button> }
function LogCard({ log }: { log: any }) { const kind = log.kind || 'command'; const label = kind === 'arrival' ? '到访' : kind === 'order' ? '下单' : kind === 'serve' ? '出餐' : kind === 'checkout' ? '结账' : kind === 'gift' ? '礼物' : kind === 'leave' ? '离开' : '状态'; return <article className={`log-card kind-${kind}`}><div><span>{logTime(log.tick)}</span><strong>{label}</strong></div><p>{log.message || log.text}</p></article> }

export default App
