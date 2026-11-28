// M17 · 个人网站（FR8 / R40/R41/R42）。宣传·作品展示同步（GEO）+ 维护监控；域名/部署可配置，适配任何个人域名。
import tls from 'node:tls'
import { spawnSync } from 'node:child_process'
import { writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Website, WebsiteStatus } from './schemas.js'
import { genId, storeError } from './store.js'
const now = () => new Date().toISOString()
const defaultFetch = (...a) => globalThis.fetch(...a)

export class WebsiteMgr {
  constructor(service, opts = {}) { this.service = service; this.store = service.store; this.fetch = opts.fetch || defaultFetch }

  list() { return this.store.list('websites').filter(w => w.status !== 'removed') }

  async add({ name, url, domain, owner, tags, certWarnDays }, actor = 'user') {
    const d = domain || new URL(url).hostname
    if (this.store.list('websites').some(w => w.domain === d)) throw storeError('DUPLICATE', `网站 ${d} 已登记`)
    const w = Website.parse({ id: genId('web'), name: name || d, url, domain: d, owner, tags: tags || [], certWarnDays: certWarnDays || 30, createdAt: now(), updatedAt: now() })
    return this.store.create('websites', w, actor, 'website-add')
  }

  remove(id, reason, actor = 'user') {
    const w = this.store.get('websites', id)
    if (!w) throw storeError('NOT_FOUND', `网站 ${id} 不存在`)
    if (!reason) throw storeError('REASON_REQUIRED', '移除网站需 reason（G4）')
    return this.store.update('websites', id, d => { d.status = 'removed'; d.updatedAt = now() }, actor, 'website-remove', reason)
  }

  _cert(domain, timeout = 10000) {
    return new Promise(resolve => {
      const s = tls.connect(443, domain, { servername: domain, rejectUnauthorized: false }, () => {
        const c = s.getPeerCertificate()
        const days = Math.round((Date.parse(c.valid_to) - Date.now()) / 86400000)
        resolve({ validTo: new Date(c.valid_to).toISOString(), daysLeft: days, issuer: c.issuer?.O || c.issuer?.CN || '' })
        s.end()
      })
      s.on('error', () => resolve(null))
      setTimeout(() => { try { s.destroy() } catch {} resolve(null) }, timeout)
    })
  }

  async _uptime(url, timeout = 10000) {
    const t0 = Date.now()
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout)
      const r = await this.fetch(url, { signal: ctrl.signal, redirect: 'follow' })
      clearTimeout(t)
      return { status: r.status, ms: Date.now() - t0 }
    } catch { return { status: 0, ms: Date.now() - t0 } }
  }

  async check(id, actor = 'agent') {
    const sites = id ? [this.store.get('websites', id)].filter(Boolean) : this.list()
    const results = []
    for (const w of sites) {
      const cert = await this._cert(w.domain)
      const up = await this._uptime(w.url)
      const issues = []
      if (!cert) issues.push('cert-unreachable')
      else if (cert.daysLeft < 0) issues.push('cert-expired')
      else if (cert.daysLeft <= w.certWarnDays) issues.push('cert-expiring')
      if (up.status === 0) issues.push('site-down')
      else if (up.status >= 400) issues.push('http-' + up.status)
      const st = WebsiteStatus.parse({
        id: genId('ws'), websiteId: w.id, at: now(),
        certValidTo: cert?.validTo, certDaysLeft: cert?.daysLeft, certIssuer: cert?.issuer,
        httpStatus: up.status, responseMs: up.ms, ok: issues.length === 0, issues,
      })
      await this.store.create('website-status', st, actor, 'website-check')
      // 异常事件 + 证书续期提醒
      for (const iss of issues) {
        await this.store.create('events', { id: genId('ev'), projectId: w.id, kind: iss.startsWith('cert') ? 'notice' : 'incident', severity: iss === 'cert-expired' || iss === 'site-down' ? 'critical' : 'warn', text: `网站 ${w.domain}：${iss}（证书剩 ${cert?.daysLeft ?? '?'} 天 / HTTP ${up.status}）`, at: now() }, actor, 'website-issue').catch(() => {})
      }
      if (cert && cert.daysLeft <= w.certWarnDays) {
        const due = cert.validTo
        const exists = this.store.list('reminders').some(r => r.projectId === w.id && r.kind === 'renewal' && r.status === 'active')
        if (!exists) await this.store.create('reminders', { id: genId('rm'), projectId: w.id, kind: 'renewal', dueAt: due, leadDays: Math.min(w.certWarnDays, 30), note: `网站 ${w.domain} SSL 证书 ${due.slice(0, 10)} 到期，需续期`, status: 'active' }, actor, 'cert-reminder').catch(() => {})
      }
      results.push({ website: w, status: st })
    }
    return results
  }

  // FR8.7 宣传·作品展示：从货架已上架公开商品生成个人网站「作品展示」专栏内容
  showcase() {
    const projects = this.service.listProjects().filter(p => (p.distribution || 'public') === 'public')
    const listings = this.store.list('listings')
    const items = []
    for (const p of projects) {
      const listed = listings.filter(l => l.projectId === p.id && l.status === 'listed')
      if (!listed.length) continue // 仅展示已上架商品
      const repo = (p.remote || '').match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1]
      const cover = repo ? `https://raw.githubusercontent.com/${repo}/main/docs/images/cover.png` : null
      const icon = repo ? `https://raw.githubusercontent.com/${repo}/main/docs/images/icon.png` : null
      const ms = this.store.list('metrics').filter(m => m.projectId === p.id)
      // 经营数据：每渠道取最新快照再汇总（与店铺概况同口径：按 date 取最新，at 兜底），避免跨时间重复累加
      const latestByCh = {}
      for (const m of ms) {
        const cur = latestByCh[m.channelId]
        if (!cur || (m.date || '') > (cur.date || '') || ((m.date || '') === (cur.date || '') && (m.at || '') > (cur.at || ''))) latestByCh[m.channelId] = m
      }
      const sum = k => Object.values(latestByCh).reduce((a, m) => a + (m.metrics[k] || 0), 0)
      const metrics = { downloads: sum('downloads'), views: sum('views'), comments: sum('comments'), revenue: sum('revenue') }
      const rel = this.store.list('releases').filter(r => r.projectId === p.id).sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))[0]
      items.push({
        id: p.id, name: p.name, type: p.type, description: p.notes || '',
        cover, icon, url: p.remote || (listed[0] && listed[0].platformUrl) || '',
        version: rel?.version || null, downloads: metrics.downloads, metrics,
        channels: [...new Set(listed.map(l => l.channelId))],
      })
    }
    return { section: '作品展示', generatedAt: now(), items }
  }

  showcaseHtml() {
    const { items } = this.showcase()
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const cards = items.map(it => `
      <article class="work-card">
        ${it.cover ? `<img src="${esc(it.cover)}" alt="${esc(it.name)}" loading="lazy"/>` : ''}
        <div class="work-body">
          <h3>${esc(it.name)}${it.version ? ` <span class="ver">v${esc(it.version)}</span>` : ''}</h3>
          <p>${esc(it.description)}</p>
          <div class="work-meta"><span>⬇ ${it.downloads}</span><span>${it.channels.length} 渠道上架</span></div>
          ${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">查看项目 →</a>` : ''}
        </div>
      </article>`).join('')
    return `<!-- 作品展示专栏（项目管家自动生成 ${now()}） -->
<section id="works" class="works-showcase">
  <h2>作品展示</h2>
  <div class="works-grid">${cards}
  </div>
</section>
<style>
.works-showcase{padding:48px 24px;max-width:1100px;margin:0 auto}
.works-showcase h2{font-size:28px;margin-bottom:24px}
.works-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px}
.work-card{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.work-card img{width:100%;height:160px;object-fit:cover;display:block}
.work-body{padding:16px}
.work-body h3{font-size:18px;margin:0 0 8px}
.work-body .ver{font-size:12px;color:#6b7280;font-weight:normal}
.work-body p{font-size:14px;color:#4b5563;margin:0 0 12px}
.work-meta{display:flex;gap:16px;font-size:13px;color:#6b7280;margin-bottom:12px}
.work-body a{color:#ff5000;text-decoration:none;font-size:14px}
</style>`
  }

  // FR8.8 项目→个人网站同步（GEO/AIO 宣传）。按 website.deploy 配置适配任何站点。
  _worksData() {
    const { items } = this.showcase()
    const typeLabel = { 'dsh-plugin': 'DSH 插件', game: '游戏', 'web-app': 'Web 应用', 'business-system': '业务系统', engine: '引擎', research: '工具' }
    return items.map(it => ({
      title: it.name, subtitle: (typeLabel[it.type] || it.type) + ' · 已上架',
      cover: it.cover, icon: it.icon, description: it.description,
      status: `已上架 ${it.channels.length} 个渠道` + (it.version ? `（v${it.version}）` : ''),
      period: String(new Date().getFullYear()), role: '独立开发', version: it.version,
      metrics: it.metrics,
      links: it.url ? [{ label: '查看项目', href: it.url }] : [],
    }))
  }

  async deployShowcase(websiteId, opts = {}) {
    const w = this.store.get('websites', websiteId)
    if (!w) throw storeError('NOT_FOUND', `网站 ${websiteId} 不存在`)
    const dep = w.deploy || { method: 'manual' }
    const data = this._worksData()
    const html = this.showcaseHtml()
    if (dep.method === 'manual' || !dep.path) {
      return { synced: false, method: 'manual', works: data.length, html, data, note: '未配置自动部署；已生成 works 数据/HTML，可手动放入网站' }
    }
    const tmp = join(tmpdir(), `steward-works-${w.id}.json`)
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    const log = []
    const ssh = (cmd) => spawnSync('ssh', ['-o', 'ConnectTimeout=20', dep.sshHost, cmd], { encoding: 'utf8', timeout: 300000 })
    try {
      if (dep.method === 'nextjs-json') {
        if (dep.sshHost) { const r = spawnSync('scp', ['-o', 'ConnectTimeout=20', tmp, `${dep.sshHost}:${dep.path}`], { encoding: 'utf8', timeout: 60000 }); log.push('scp works.json ' + (r.status === 0 ? '✓' : '✗')) }
        else { copyFileSync(tmp, dep.path); log.push('write works.json ✓') }
        if (opts.build !== false && dep.buildCmd) { const r = dep.sshHost ? ssh(dep.buildCmd) : spawnSync(dep.buildCmd, { shell: true, encoding: 'utf8', timeout: 300000 }); log.push('build ' + (r.status === 0 ? '✓' : '✗')) }
        if (opts.build !== false && dep.restartCmd) { const r = dep.sshHost ? ssh(dep.restartCmd) : spawnSync(dep.restartCmd, { shell: true, encoding: 'utf8', timeout: 60000 }); log.push('restart ' + (r.status === 0 ? '✓' : '✗')) }
      } else if (dep.method === 'static-html') {
        const tmpHtml = join(tmpdir(), `steward-works-${w.id}.html`)
        writeFileSync(tmpHtml, html)
        if (dep.sshHost) { const r = spawnSync('scp', ['-o', 'ConnectTimeout=20', tmpHtml, `${dep.sshHost}:${dep.path}`], { encoding: 'utf8', timeout: 60000 }); log.push('scp works.html ' + (r.status === 0 ? '✓' : '✗')) }
        else { copyFileSync(tmpHtml, dep.path); log.push('write works.html ✓') }
      }
      return { synced: true, method: dep.method, works: data.length, log }
    } catch (e) { return { synced: false, error: String(e.message || e), log } }
  }
}