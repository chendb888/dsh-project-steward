// 项目管家 · M7 StewardService：唯一写入口的领域组装（02 M7 / 06§1）
// 组装 Store + Registry，后续任务挂载 pipeline/listing/ops/collector/market。
import { Store } from './store.js'
import { Registry } from './registry.js'
import { Pipeline } from './pipeline.js'
import { ListingMgr } from './listing.js'
import { Ops } from './ops.js'
import { Collector } from './collector-sched.js'
import { Market } from './market/analyze.js'
import { Docs } from './docs.js'
import { ChannelImport } from './channel-import.js'
import { WebsiteMgr } from './website.js'

export class StewardService {
  constructor(opts = {}) {
    this.dataDir = opts.dataDir
    this.listeners = new Set()
    this.store = new Store(this.dataDir, { emit: e => this._broadcast(e) })
    this.registry = new Registry(this.store)
    // 领域模块挂载
    this.ops = new Ops(this)
    this.listing = new ListingMgr(this)
    this.pipeline = new Pipeline(this, { dryRun: opts.dryRun ?? true, confirmGates: opts.confirmGates ?? false })
    this.market = new Market(this, { fetch: opts.fetch })
    this.docs = new Docs(this)
    this.channelImport = new ChannelImport(this)
    this.website = new WebsiteMgr(this)
    this.collector = new Collector(this, { intervalMinutes: opts.collectIntervalMinutes ?? 60, onUrgent: e => this._broadcast({ type: 'steward/urgent', ...e }) })
  }

  _broadcast(e) { for (const fn of this.listeners) { try { fn(e) } catch {} } }
  onChanged(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }

  // ---- registry 门面 ----
  listProjects(filter) {
    let arr = this.registry.list()
    if (filter?.type) arr = arr.filter(p => p.type === filter.type)
    if (filter?.stage) arr = arr.filter(p => p.stage === filter.stage)
    if (filter?.tag) arr = arr.filter(p => (p.tags || []).includes(filter.tag))
    return arr
  }
  getProject(id) { return this.registry.get(id) }
  registerProject(input, actor) { return this.registry.register(input, actor) }
  updateProject(id, patch, actor) { return this.registry.update(id, patch, actor) }
  transitionStage(id, to, actor, reason) { return this.registry.transitionStage(id, to, actor, reason) }
  scanCandidates(roots, opts) { return this.registry.scanCandidates(roots, opts) }

  // ---- 聚合投影 ----
  overview() {
    const projects = this.registry.list()
    const byStage = {}, byType = {}
    for (const p of projects) {
      byStage[p.stage] = (byStage[p.stage] || 0) + 1
      byType[p.type] = (byType[p.type] || 0) + 1
    }
    const runs = this.store.listRuns()
    const blockedRuns = runs.filter(r => r.status === 'blocked')
    const reminders = this.store.list('reminders').filter(r => r.status === 'active')
    const now = Date.now()
    const expiredReminders = reminders.filter(r => Date.parse(r.dueAt) < now)
    const listings = this.store.list('listings')
    const rejected = listings.filter(l => l.status === 'rejected')
    const anomalies = [
      ...blockedRuns.map(r => ({ kind: 'blocked-run', ref: r.id, projectId: r.projectId })),
      ...rejected.map(l => ({ kind: 'rejected-listing', ref: l.id, projectId: l.projectId })),
      ...expiredReminders.map(r => ({ kind: 'expired-reminder', ref: r.id, projectId: r.projectId })),
    ]
    const listedListings = listings.filter(l => l.status === 'listed')
    const listedProjects = new Set(listedListings.map(l => l.projectId)).size
    return {
      counts: { projects: projects.length, byStage, byType, listed: listedProjects, listedListings: listedListings.length },
      anomalies,
      recent: this._recentJournal(10),
    }
  }

  storeSummary() {
    const projects = this.registry.list()
    const metrics = this.store.list('metrics')
    const totals = { downloads: 0, views: 0, comments: 0, revenue: 0, downloadsCumulative: 0, downloadsYesterday: 0, organicYesterday: 0, viewsYesterday: 0, clones: 0, clonesYesterday: 0 }
    const perProject = []
    for (const p of projects) {
      const ms = metrics.filter(m => m.projectId === p.id)
      const latest = latestByDate(ms)
      const sum = { downloads: 0, views: 0, comments: 0, revenue: 0, downloadsCumulative: 0, downloadsYesterday: 0, organicYesterday: 0, viewsYesterday: 0, clones: 0, clonesYesterday: 0 }
      const channels = []
      for (const m of latest) {
        const x = m.metrics
        sum.downloads += x.downloads || 0
        sum.views += x.views || 0
        sum.comments += x.comments || 0
        sum.revenue += x.revenue || 0
        sum.downloadsCumulative += x.downloadsRaw || x.downloads || 0
        sum.downloadsYesterday += x.downloadsYesterday || 0
        sum.organicYesterday += x.organicYesterday || 0
        sum.viewsYesterday += x.viewsYesterday || 0
        sum.clones += x.clones || 0
        sum.clonesYesterday += x.clonesYesterday || 0
        channels.push({ channelId: m.channelId, date: m.date, downloads: x.downloadsRaw || x.downloads || 0, downloadsYesterday: x.downloadsYesterday || 0, views: x.views || 0, comments: x.comments || 0, clones: x.clones || 0, revenue: x.revenue || 0, stars: x.stars || 0, forks: x.forks || 0 })
      }
      channels.sort((a, b) => b.downloads - a.downloads)
      for (const k of Object.keys(totals)) totals[k] += sum[k]
      perProject.push({ projectId: p.id, name: p.name, type: p.type, stage: p.stage, channels, ...sum })
    }
    return { totals, perProject }
  }

  _recentJournal(n) {
    try {
      const entries = this.store._readJournal()
      return entries.slice(-n).reverse().map(e => ({ seq: e.seq, at: e.at, actor: e.actor, entity: e.entity, entityId: e.entityId, action: e.action }))
    } catch { return [] }
  }
}

function latestByDate(metrics) {
  const map = new Map()
  for (const m of metrics) {
    const key = m.channelId || '_'
    const cur = map.get(key)
    if (!cur || m.date > cur.date) map.set(key, m)
  }
  return [...map.values()]
}