// M13 · Collector 调度（07 M13 / 0.5）：定时采集+退避+stale+增量事件+紧急推送。
import { CollectRun } from './schemas.js'
import { genId } from './store.js'
import { adapters as defaultAdapters } from './collectors/index.js'

const now = () => new Date().toISOString()

export class Collector {
  constructor(service, opts = {}) {
    this.service = service
    this.store = service.store
    this.adapters = opts.adapters || defaultAdapters
    this.io = opts.io || {}
    this.timer = opts.timer || { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: id => clearInterval(id) }
    this.intervalMs = (opts.intervalMinutes ?? 60) * 60000
    this._handle = null
    this._failCount = {}
    this._seen = {}
    this.onUrgent = opts.onUrgent || (() => {})
    this.sleep = opts.sleep || sleep
  }

  start(minutes) {
    if (minutes != null) this.intervalMs = minutes * 60000
    this.stop()
    this._handle = this.timer.setInterval(() => { this.collectNow().catch(() => {}) }, this.intervalMs)
    return this._handle
  }
  stop() { if (this._handle != null) { this.timer.clearInterval(this._handle); this._handle = null } }

  async collectNow(channelId) {
    let channels = this.store.list('channels').filter(c => c.status === 'active')
    if (channelId) channels = channels.filter(c => c.id === channelId)
    const runs = []
    // 并发≤3
    for (let i = 0; i < channels.length; i += 3) {
      const batch = channels.slice(i, i + 3)
      const rs = await Promise.all(batch.map(c => this._collectChannel(c)))
      runs.push(...rs)
    }
    return runs
  }

  async _collectChannel(channel) {
    const run = { id: genId('cr'), channelId: channel.id, listingIds: [], startedAt: now(), status: 'running', metricsWritten: 0, newComments: 0, newPayments: 0, staleMarked: false }
    const listings = this.store.list('listings').filter(l => l.channelId === channel.id && l.status === 'listed')
    run.listingIds = listings.map(l => l.id)
    const adapter = this.adapters[channel.category]
    if (!adapter || listings.length === 0) {
      run.status = 'ok'; run.finishedAt = now()
      await this.store.create('collect-runs', CollectRun.parse(run), 'collector', 'collect')
      return run
    }
    const items = listings.map(l => {
      const proj = this.service.getProject(l.projectId) || {}
      const meta = deriveMeta(proj)
      // 发布日（含次日镜像滞后）：用于剔除自动化下载脉冲，估算真实下载
      const publishDays = new Set()
      for (const r of this.store.list('releases').filter(r => r.projectId === l.projectId)) {
        const d = (r.releasedAt || '').slice(0, 10)
        if (d) { publishDays.add(d); const nx = new Date(d + 'T00:00:00Z'); nx.setUTCDate(nx.getUTCDate() + 1); publishDays.add(nx.toISOString().slice(0, 10)) }
      }
      return { id: l.id, name: l.platformUrl || l.id, pkgName: l.pkgName || meta.pkgName, repo: l.repo || meta.repo, healthUrl: l.healthUrl || meta.healthUrl, publishDays: [...publishDays] }
    })
    let result, lastErr
    for (let attempt = 0; attempt < 3; attempt++) {
      try { result = await adapter.fetch(items, channel.credentialRef, this.io); lastErr = null; break }
      catch (e) { lastErr = e; await this.sleep(backoff(attempt)) }
    }
    if (lastErr) {
      run.status = 'failed'; run.error = String(lastErr.message || lastErr); run.staleMarked = true
      this._failCount[channel.id] = (this._failCount[channel.id] || 0) + 1
      if (this._failCount[channel.id] >= 3) this.onUrgent({ kind: 'collect-stale', channelId: channel.id, reason: run.error, consecutiveFailures: this._failCount[channel.id] })
      run.finishedAt = now()
      await this.store.create('collect-runs', CollectRun.parse(run), 'collector', 'collect')
      this.service._broadcast({ type: 'steward/collect-stale', channelId: channel.id, reason: run.error })
      return run
    }
    this._failCount[channel.id] = 0
    // 写指标
    const today = new Date().toISOString().slice(0, 10)
    for (const l of listings) {
      const m = result.metrics?.[l.id]
      if (m && Object.keys(m).length) {
        await this.service.ops.addMetric({ projectId: l.projectId, channelId: channel.id, date: today, metrics: m, overwrite: true }, 'collector', 'collector')
        run.metricsWritten++
      }
    }
    // 增量留言/付款
    const seenKey = channel.id
    const prev = this._seen[seenKey] || { comments: [], payments: [] }
    const newComments = (result.comments || []).filter(c => !prev.comments.includes(c.id || c.text))
    const newPayments = (result.payments || []).filter(p => !prev.payments.includes(p.id))
    this._seen[seenKey] = { comments: (result.comments || []).map(c => c.id || c.text), payments: (result.payments || []).map(p => p.id) }
    for (const c of newComments) {
      await this.service.ops.addEvent({ projectId: listings[0].projectId, kind: 'comment', severity: 'info', text: c.text || '新留言', listingId: listings[0].id }, 'collector')
      run.newComments++
    }
    for (const p of newPayments) {
      await this.service.ops.addEvent({ projectId: listings[0].projectId, kind: 'payment', severity: 'info', text: `新付款 ${p.amount || ''}`, listingId: listings[0].id }, 'collector')
      run.newPayments++
      this.onUrgent({ kind: 'payment', channelId: channel.id, amount: p.amount })
    }
    run.status = 'ok'; run.finishedAt = now()
    await this.store.create('collect-runs', CollectRun.parse(run), 'collector', 'collect')
    this.service._broadcast({ type: 'steward/collect-updated', channelId: channel.id, metricsWritten: run.metricsWritten, newComments: run.newComments, newPayments: run.newPayments })
    return run
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const backoff = attempt => Math.min(1000 * 2 ** attempt, 8000)

// 从项目元数据推导采集所需的包名/仓库/健康地址
function deriveMeta(proj) {
  const out = {}
  const remote = proj.remote || ''
  const gh = remote.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)
  if (gh) out.repo = gh[1]
  const notes = (proj.notes || '') + ' ' + (proj.name || '')
  const pkg = notes.match(/@[\w.-]+\/[\w.-]+/) || notes.match(/\b(dsh-[\w-]+)\b/)
  if (pkg) out.pkgName = pkg[0]
  if (proj.healthUrl) out.healthUrl = proj.healthUrl
  return out
}