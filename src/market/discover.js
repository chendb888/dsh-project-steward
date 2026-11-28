// M14 · 竞品发现适配器（03§6b / 07）。可注入 fetch 测试不联网。竞品文本为不可信数据。
const defaultFetch = (...a) => globalThis.fetch(...a)
const now = () => new Date().toISOString()

export async function discoverCompetitors(project, opts = {}) {
  const f = opts.fetch || defaultFetch
  const out = []
  const keyword = opts.keyword || project.name
  if (project.type === 'dsh-plugin' || project.type === 'web-app' || project.type === 'engine') {
    // npm search
    try {
      const r = await f(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(keyword)}&size=10`)
      const j = await r.json()
      for (const o of j.objects || []) {
        const p = o.package || {}
        if (p.name === project.name) continue
        out.push({ name: p.name, url: p.links?.npm || `https://npmjs.com/package/${p.name}`, description: p.description || '', keywords: p.keywords || [], date: p.date })
      }
    } catch {}
    // GitHub topic/search
    try {
      const r = await f(`https://api.github.com/search/repositories?q=${encodeURIComponent(keyword)}&per_page=10`, { headers: opts.githubToken ? { Authorization: `Bearer ${opts.githubToken}` } : {} })
      const j = await r.json()
      for (const repo of j.items || []) {
        out.push({ name: repo.full_name, url: repo.html_url, stars: repo.stargazers_count, downloads: repo.forks_count, description: repo.description || '', tags: repo.topics || [], lastUpdate: repo.pushed_at })
      }
    } catch {}
  } else if (project.type === 'game') {
    // itch/Steam 标签浏览占位（需 API/凭据）
    try {
      const r = await f(`https://itch.io/api/1/x/games?search=${encodeURIComponent(keyword)}`)
      const j = await r.json()
      for (const g of j.games || []) out.push({ name: g.title, url: g.url, description: g.short_text || '', tags: g.tags || [] })
    } catch {}
  }
  // 标准化为 MarketCompetitor 形状（去重 by url）
  const seen = new Set()
  const competitors = []
  for (const c of out) {
    if (!c.url || seen.has(c.url)) continue
    seen.add(c.url)
    competitors.push({
      id: `mc-${Date.now().toString(36)}-${competitors.length.toString(36).padStart(4, '0')}`,
      projectId: project.id, name: c.name, url: c.url,
      stars: c.stars, downloads: c.downloads, price: c.price,
      lastUpdate: c.lastUpdate || c.date, features: c.keywords || c.tags || [],
      tags: c.tags || [], rating: c.rating, fetchedAt: now(),
      _description: c.description,
    })
  }
  return competitors
}