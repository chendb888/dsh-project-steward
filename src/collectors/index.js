// M13 · 采集适配器（07 M13）。可注入 fetch 以便测试（不真实联网）。
// 接口：{ channelCategory, fetch(listings, credRef?, io?) => { metrics, comments[], payments[] } }
import { spawnSync } from 'node:child_process'
const defaultFetch = (...a) => globalThis.fetch(...a)
let _ghToken = null
function ghToken() {
  if (_ghToken !== null) return _ghToken
  try { const r = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 10000 }); _ghToken = r.status === 0 ? (r.stdout || '').trim() : '' } catch { _ghToken = '' }
  return _ghToken
}

export const adapters = {
  'npm-registry': {
    channelCategory: 'npm-registry',
    async fetch(listings, credRef, io = {}) {
      const f = io.fetch || defaultFetch
      const metrics = {}
      const fmt = d => d.toISOString().slice(0, 10)
      const end = new Date(); end.setUTCDate(end.getUTCDate() - 1)
      const start = new Date(end); start.setUTCDate(start.getUTCDate() - 29)
      for (const l of listings) {
        const pkg = l.pkgName || l.name
        if (!pkg) continue
        try {
          // 下载量=安装量（npm install / dsh plugin add 命令行安装都算，R46）；逐日取昨日新增
          const r = await f(`https://api.npmjs.org/downloads/range/${fmt(start)}:${fmt(end)}/${encodeURIComponent(pkg)}`)
          const j = await r.json()
          const days = j.downloads || []
          const raw = days.reduce((a, d) => a + (d.downloads || 0), 0)
          const last = days[days.length - 1] // npm 最新报告日
          const downloadsYesterday = last?.downloads || 0
          metrics[l.id] = { downloads: raw, downloadsRaw: raw, downloadsYesterday }
        } catch { metrics[l.id] = { downloads: 0, downloadsRaw: 0, downloadsYesterday: 0 } }
      }
      return { metrics, comments: [], payments: [] }
    },
  },
  'source-repo': {
    channelCategory: 'source-repo',
    async fetch(listings, credRef, io = {}) {
      const f = io.fetch || defaultFetch
      const token = credRef?.token || (io.noGh ? '' : ghToken())
      const auth = token ? { Authorization: `Bearer ${token}` } : {}
      const metrics = {}
      for (const l of listings) {
        const repo = l.repo
        if (!repo) continue
        const m = { stars: 0, forks: 0, watchers: 0, issues: 0, views: 0, viewUniques: 0, clones: 0, cloneUniques: 0 }
        try {
          const r = await f(`https://api.github.com/repos/${repo}`, { headers: auth })
          const j = await r.json()
          m.stars = j.stargazers_count || 0; m.forks = j.forks_count || 0; m.watchers = j.subscribers_count || 0; m.issues = j.open_issues_count || 0
        } catch {}
        // 浏览量（页面访问，与下载分开）+ 克隆量，需鉴权 traffic API；含昨日增量
        if (token) {
          const yday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
          try { const v = await (await f(`https://api.github.com/repos/${repo}/traffic/views`, { headers: auth })).json(); m.views = v.count || 0; m.viewUniques = v.uniques || 0; m.viewsYesterday = (v.views || []).find(d => (d.timestamp || '').slice(0, 10) === yday)?.count || 0 } catch {}
          try { const c = await (await f(`https://api.github.com/repos/${repo}/traffic/clones`, { headers: auth })).json(); m.clones = c.count || 0; m.cloneUniques = c.uniques || 0; m.clonesYesterday = (c.clones || []).find(d => (d.timestamp || '').slice(0, 10) === yday)?.count || 0 } catch {}
        }
        metrics[l.id] = m
      }
      return { metrics, comments: [], payments: [] }
    },
  },
  'game-store': {
    channelCategory: 'game-store',
    async fetch(listings, credRef, io = {}) {
      // itch/Steam 占位：v1 返回空指标（需 butler/Steamworks 凭据接入）
      const metrics = {}
      for (const l of listings) metrics[l.id] = {}
      return { metrics, comments: [], payments: [] }
    },
  },
  'mirror': {
    channelCategory: 'mirror',
    async fetch(listings, credRef, io = {}) {
      const f = io.fetch || defaultFetch
      const metrics = {}
      for (const l of listings) {
        const pkg = l.pkgName || l.name
        if (!pkg) continue
        try {
          const r = await f(`https://registry.npmmirror.com/${encodeURIComponent(pkg)}`)
          const j = await r.json()
          metrics[l.id] = { downloads: j.downloads || 0 }
        } catch { metrics[l.id] = {} }
      }
      return { metrics, comments: [], payments: [] }
    },
  },
  'web-deploy': {
    channelCategory: 'web-deploy',
    async fetch(listings, credRef, io = {}) {
      const f = io.fetch || defaultFetch
      const metrics = {}
      for (const l of listings) {
        const url = l.healthUrl
        if (!url) continue
        try {
          const r = await f(url)
          const j = await r.json()
          metrics[l.id] = { healthy: j.ok || j.ready ? 1 : 0 }
        } catch { metrics[l.id] = { healthy: 0 } }
      }
      return { metrics, comments: [], payments: [] }
    },
  },
}

export function adapterFor(category) { return adapters[category] || null }