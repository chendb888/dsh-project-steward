// M16 · 从发布渠道扫描导入已上架商品（R33）。扫描平台（npm/GitHub/DSH市场），不扫本地硬盘。
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { genId, storeError } from './store.js'

const defaultFetch = (...a) => globalThis.fetch(...a)
const now = () => new Date().toISOString()

export class ChannelImport {
  constructor(service, opts = {}) {
    this.service = service
    this.store = service.store
    this.fetch = opts.fetch || defaultFetch
    this.account = opts.account || 'chendb888'
    this.scanRoots = opts.scanRoots || ['E:\\']
  }

  // 扫描发布渠道，发现已上架商品（不扫本地文件作为来源；本地仅用于匹配 rootPath）
  async scan(opts = {}) {
    const account = opts.account || this.account
    const found = []
    // npm：按维护者搜索
    try {
      const r = await this.fetch(`https://registry.npmjs.org/-/v1/search?text=maintainer:${account}&size=50`)
      const j = await r.json()
      for (const o of j.objects || []) {
        const p = o.package || {}
        if (p.name?.includes('0.0.0-stage') || p.version === '0.0.0-stage') continue
        found.push({ source: 'npm', channelId: 'ch-npmjs', name: p.name, version: p.version, url: p.links?.npm || `https://npmjs.com/package/${p.name}`, description: p.description || '', date: p.date })
      }
    } catch {}
    // GitHub：用户仓库
    try {
      const r = spawnSync('gh', ['api', `users/${account}/repos`, '--jq', '.[] | {name:.name,full_name:.full_name,url:.html_url,description:.description,pushed_at:.pushed_at,stars:.stargazers_count}', '--paginate'], { encoding: 'utf8', timeout: 30000 })
      if (r.status === 0) {
        for (const line of (r.stdout || '').split('\n').filter(Boolean)) {
          try { const g = JSON.parse(line); found.push({ source: 'github', channelId: 'ch-github', name: g.full_name, version: null, url: g.url, description: g.description || '', date: g.pushed_at, stars: g.stars }) } catch {}
        }
      }
    } catch {}
    // 去重（同名优先 npm）+ 标记已纳管
    const existing = this.service.listProjects()
    const seen = new Set()
    const candidates = []
    for (const f of found) {
      const key = f.name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const matched = existing.find(p => p.remote === f.url || p.name === f.name || f.name.includes(p.name))
      candidates.push({ ...f, alreadyRegistered: !!matched, matchedProjectId: matched?.id || null, localRoot: this._matchLocal(f.name) })
    }
    return candidates
  }

  _matchLocal(name) {
    const short = name.split('/').pop()
    for (const root of this.scanRoots) {
      try {
        for (const d of readdirSync(root, { withFileTypes: true })) {
          if (d.isDirectory() && (d.name === short || d.name.includes(short) || short.includes(d.name))) {
            const full = join(root, d.name)
            if (existsSync(join(full, 'package.json')) || existsSync(join(full, '.git'))) return full
          }
        }
      } catch {}
    }
    return null
  }

  // 导入一个渠道商品为纳管项目 + 上架记录
  async importProduct(candidate, actor = 'user') {
    const rootPath = candidate.localRoot || candidate.url // 无本地源时用 remote URL（远程-only）
    const candRepo = (candidate.url.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1] || '').toLowerCase()
    const candShort = candidate.name.split('/').pop().toLowerCase()
    let project = this.service.listProjects().find(p => {
      const pRepo = ((p.remote || '').match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1] || '').toLowerCase()
      const pShort = (p.name || '').split('/').pop().toLowerCase()
      return p.remote === candidate.url || p.name === candidate.name || (candRepo && pRepo === candRepo) || (pRepo && pRepo.split('/')[1] === candShort) || (pShort && pShort === candShort)
    })
    if (!project) {
      const type = candidate.source === 'npm' ? 'dsh-plugin' : 'research'
      project = await this.service.registerProject({ name: candidate.name, rootPath, type, remote: candidate.url, notes: candidate.description, tags: [candidate.source] }, actor)
    }
    // 记录版本（npm 有 version）
    let releaseId = null
    if (candidate.version) {
      const rel = await this.store.create('releases', { id: genId('rel'), projectId: project.id, runId: 'run-channel-import', version: candidate.version, changelog: candidate.description || ('imported ' + candidate.version), artifacts: [], releasedAt: candidate.date || now() }, actor, 'release-import').catch(() => null)
      releaseId = rel?.id
    }
    // 上架记录（listed）
    let listing = null
    if (releaseId && candidate.channelId) {
      const exists = this.store.list('listings').find(l => l.projectId === project.id && l.channelId === candidate.channelId && l.releaseId === releaseId)
      if (!exists) {
        listing = await this.service.listing.createListing({ projectId: project.id, channelId: candidate.channelId, releaseId }, actor).catch(() => null)
        if (listing) await this.service.listing.transitionListing(listing.id, 'submitted', { actor, note: '渠道导入', waive: true }).catch(() => {})
        if (listing) await this.service.listing.transitionListing(listing.id, 'listed', { actor, platformUrl: candidate.url, note: '已上架（渠道扫描导入）' }).catch(() => {})
      }
    }
    return { project, releaseId, listingId: listing?.id || null }
  }
}