// M14 · Market 分析：多维对比 + 优势研判 + 市场空白（03§6b / FR6）。
import { MarketReport, MarketGap, Verdict } from '../schemas.js'
import { genId, storeError } from '../store.js'
import { discoverCompetitors } from './discover.js'
import { buildComparison } from './features.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const now = () => new Date().toISOString()
const defaultFetch = (...a) => globalThis.fetch(...a)
const median = arr => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export class Market {
  constructor(service, opts = {}) {
    this.service = service
    this.store = service.store
    this.discover = opts.discover || discoverCompetitors
    this.fetch = opts.fetch
    this.demandSignals = opts.demandSignals || {}
  }

  async scan(projectId, actor = 'agent') {
    const projects = projectId ? [this.service.getProject(projectId)].filter(Boolean) : this.service.listProjects()
    const reports = []
    for (const p of projects) reports.push(await this.compare(p.id, actor))
    return reports
  }

  async compare(projectId, actor = 'agent') {
    const project = this.service.getProject(projectId)
    if (!project) throw storeError('NOT_FOUND', `项目 ${projectId} 不存在`)
    let competitors
    const existing = this.store.readMarketReport(projectId)
    const raw = await this.discover(project, { fetch: this.fetch })
    competitors = raw.map(c => ({
      id: c.id || genId('mc'), projectId, name: c.name, url: c.url,
      stars: c.stars, downloads: c.downloads, price: c.price, lastUpdate: c.lastUpdate || c.date,
      features: c.features || c.tags || [], tags: c.tags || [], rating: c.rating, fetchedAt: c.fetchedAt || now(),
    }))
    // 本项目热度（取最新 metrics）
    const ms = this.store.list('metrics').filter(m => m.projectId === projectId)
    const myStars = ms.reduce((a, m) => a + (m.metrics.views || 0), 0)
    const myDownloads = ms.reduce((a, m) => a + (m.metrics.downloads || 0), 0)
    const compStars = median(competitors.map(c => c.stars || 0))
    const compDownloads = median(competitors.map(c => c.downloads || 0))
    // 多维评分（0–1，缺失标 unknown→0.5 中性，不臆断）
    const score = (mine, theirs) => theirs > 0 ? Math.min(1, mine / theirs) : 0.5
    const dimensions = {
      popularity: round(score(myStars, compStars)),
      downloads: round(score(myDownloads, compDownloads)),
      activity: project.lastReleaseAt ? 0.7 : 0.4,
      differentiation: round(uniqueFeatureRatio(project, competitors)),
    }
    const avg = round(Object.values(dimensions).reduce((a, b) => a + b, 0) / Object.values(dimensions).length)
    const crowded = competitors.length >= 5
    let verdict
    if (avg >= 0.6 || dimensions.differentiation >= 0.6) verdict = 'worth-continuing'
    else if (crowded && avg < 0.35) verdict = 'red-ocean-caution'
    else verdict = 'needs-differentiation'
    const strengths = [], weaknesses = []
    if (dimensions.popularity >= 0.6) strengths.push('热度领先同类中位数')
    if (dimensions.differentiation >= 0.6) strengths.push('具备差异化特性')
    if (dimensions.downloads < 0.4) weaknesses.push('下载量低于同类中位数')
    if (crowded) weaknesses.push(`同类竞品 ${competitors.length} 个，市场拥挤`)
    if (!project.lastReleaseAt) weaknesses.push('尚无发布记录')
    const summary = `对比 ${competitors.length} 个同类竞品，综合得分 ${avg}。研判：${verdictLabel(verdict)}。证据驱动，供店主决策，不替决策。`
    // R32：按本项目功能逐项对比 + 多维雷达图
    let featureComparison
    try {
      const myReadme = readFileSync(join(project.rootPath, 'README.md'), 'utf8')
      featureComparison = await buildComparison(project, myReadme, competitors, { fetch: this.fetch, limit: 5 })
      // 注入我的真实热度到雷达首系列
      if (featureComparison.radar?.series?.[0]) {
        featureComparison.radar.series[0].values[1] = round(Math.min(1, myStars / Math.max(1, compStars)))
      }
    } catch { featureComparison = undefined }
    const report = MarketReport.parse({
      projectId, competitors: competitors.map(stripPrivate), dimensions, verdict,
      strengths, weaknesses, summary, generatedAt: now(), source: 'auto', featureComparison,
    })
    this.store.writeMarketReport(report)
    this.service._broadcast({ type: 'steward/changed', entity: 'market-report', entityId: projectId, action: 'compare' })
    return report
  }

  async gaps(channelIds, actor = 'agent', opts = {}) {
    // R34：真实市场空白研判——按细分 niche 实搜平台供给+需求代理+竞争强度，多因子打分（非简单比值）。
    const f = this.fetch || defaultFetch
    const niches = opts.niches || this._defaultNiches()
    // R36：每次重算清空旧空白记录（避免旧假数据/重复累积残留）
    this.store.data['market-gaps'].clear()
    this.store._writeCollection('market-gaps')
    const gaps = []
    for (const niche of niches.slice(0, opts.limit || 8)) {
      const probe = await this._probeNiche(niche, f)
      const supply = probe.npmTotal + probe.ghTotal
      const demand = probe.topStarsSum // 需求代理：头部产品 star 总量（已被验证的兴趣）
      const competition = probe.avgStars // 竞争强度：头部平均 star
      const demandFactor = Math.min(1, demand / 1000)
      const scarcityFactor = 1 / Math.log10(supply + 10)
      const weaknessFactor = 1 - Math.min(1, competition / 500)
      const gapScore = round(demandFactor * scarcityFactor * weaknessFactor * 100, 1)
      const verdict = gapScore >= 25 ? '空白机会显著' : gapScore >= 10 ? '潜在机会' : demand < 50 ? '需求未验证' : '竞争饱和'
      const gap = MarketGap.parse({
        id: genId('mg'), category: niche, niche, channelIds: [],
        supplyCount: supply, demandSignal: demand, competition: round(competition, 1), gapScore,
        demandBasis: `npm 供给 ${probe.npmTotal} + GitHub 供给 ${probe.ghTotal}；头部 star 合计 ${demand}，平均 ${round(competition, 1)}`,
        opportunity: `「${niche}」${verdict}：市场供给 ${supply} 个，头部需求信号 ${demand} star，竞争强度 ${round(competition, 1)}。${gapScore >= 10 ? '供给相对稀缺或 incumbent 较弱，可切入。' : '需求未验证或竞争饱和，慎入。'}`,
        examples: probe.evidence.map(e => e.name), evidence: probe.evidence, fetchedAt: now(),
      })
      await this.store.create('market-gaps', gap, actor, 'market-gap')
      gaps.push(gap)
    }
    return gaps.sort((a, b) => b.gapScore - a.gapScore)
  }

  _defaultNiches() {
    // 结合本店项目领域 + 通用热门细分
    const base = ['dsh plugin', 'project board kanban', 'insurance claim assistant', 'cargo insurance', 'underwriting assistant', 'godot strategy game', 'ai agent tool', 'llm workflow automation']
    const fromProjects = this.service.listProjects().flatMap(p => (p.tags || []).slice(0, 1))
    return [...new Set([...fromProjects, ...base])]
  }

  async _probeNiche(niche, f) {
    let npmTotal = 0, ghTotal = 0, topStarsSum = 0, avgStars = 0
    const evidence = []
    try {
      const r = await f(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(niche)}&size=5`)
      const j = await r.json()
      npmTotal = j.total || 0
      for (const o of (j.objects || []).slice(0, 3)) {
        const p = o.package || {}
        evidence.push({ name: p.name, url: p.links?.npm, downloads: undefined })
      }
    } catch {}
    try {
      const r = await f(`https://api.github.com/search/repositories?q=${encodeURIComponent(niche)}&per_page=5&sort=stars`, { headers: { Accept: 'application/vnd.github+json' } })
      const j = await r.json()
      ghTotal = j.total_count || 0
      const items = j.items || []
      const stars = items.map(x => x.stargazers_count || 0)
      topStarsSum = stars.slice(0, 3).reduce((a, b) => a + b, 0)
      avgStars = stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : 0
      for (const x of items.slice(0, 3)) evidence.push({ name: x.full_name, stars: x.stargazers_count, url: x.html_url })
    } catch {}
    return { npmTotal, ghTotal, topStarsSum, avgStars, evidence: evidence.slice(0, 5) }
  }
}

function uniqueFeatureRatio(project, competitors) {
  const myTags = new Set(project.tags || [])
  if (!myTags.size) return 0.5
  const compTags = new Set(competitors.flatMap(c => c.tags || []))
  const unique = [...myTags].filter(t => !compTags.has(t)).length
  return unique / myTags.size
}
function stripPrivate(c) { const { _description, ...rest } = c; return rest }
function round(n) { return Math.round(n * 100) / 100 }
function verdictLabel(v) { return { 'worth-continuing': '值得继续', 'needs-differentiation': '需差异化', 'red-ocean-caution': '红海慎入' }[v] }