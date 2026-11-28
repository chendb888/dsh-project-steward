// M5 · webServer 路由：供 Client 货架看板读取台账（只读为主 + 受控写）。
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    const oh = new URL(origin).hostname
    const rh = (req.headers.host || '').split(':')[0]
    const loop = h => h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]'
    if (loop(oh) && loop(rh)) return true // localhost 与 127.0.0.1 同为回环，视为同源
    return new URL(origin).host === req.headers.host
  } catch { return false }
}
function query(req) { return new URL(req.url, 'http://localhost').searchParams }
async function body(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
}

export function registerRoutes(ctx, service) {
  const reg = (path, handler) => ctx.effect(() => {
    try { return ctx.webServer.register({ kind: 'exact', path, handler }) }
    catch { return () => {} }
  })
  const guard = (req, res) => { if (!sameOrigin(req)) { sendJson(res, 403, { error: 'cross-origin' }); return false } return true }

  reg('/project-steward/api/overview', (req, res) => { if (!guard(req, res)) return; sendJson(res, 200, service.overview()) })
  reg('/project-steward/api/summary', (req, res) => { if (!guard(req, res)) return; sendJson(res, 200, service.storeSummary()) })
  reg('/project-steward/api/projects', (req, res) => {
    if (!guard(req, res)) return
    const q = query(req)
    const filter = {}
    if (q.get('type')) filter.type = q.get('type')
    if (q.get('stage')) filter.stage = q.get('stage')
    const projects = service.listProjects(filter).map(p => {
      const listings = service.store.list('listings').filter(l => l.projectId === p.id)
      const metrics = service.store.list('metrics').filter(m => m.projectId === p.id)
      const latest = latestByChannel(metrics)
      const sum = { downloads: 0, views: 0, comments: 0, revenue: 0 }
      for (const m of latest) { sum.downloads += m.metrics.downloads || 0; sum.views += m.metrics.views || 0; sum.comments += m.metrics.comments || 0; sum.revenue += m.metrics.revenue || 0 }
      const lastRelease = service.store.list('releases').filter(r => r.projectId === p.id).sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))[0]
      return { ...p, listings, metrics: sum, lastRelease, channels: listings.map(l => ({ channelId: l.channelId, status: l.status, platformUrl: l.platformUrl })) }
    })
    sendJson(res, 200, { projects, channels: service.store.list('channels') })
  })
  reg('/project-steward/api/project', (req, res) => {
    if (!guard(req, res)) return
    const id = query(req).get('id')
    const p = service.getProject(id)
    if (!p) return sendJson(res, 404, { error: 'not-found' })
    sendJson(res, 200, {
      project: p,
      releases: service.store.list('releases').filter(r => r.projectId === id),
      listings: service.store.list('listings').filter(l => l.projectId === id),
      metrics: service.ops.listMetrics(id),
      events: service.store.list('events').filter(e => e.projectId === id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50),
      reminders: service.store.list('reminders').filter(r => r.projectId === id),
      runs: service.pipeline.listRuns(id),
      marketReport: service.store.readMarketReport(id) || null,
    })
  })
  reg('/project-steward/api/channels', (req, res) => { if (!guard(req, res)) return; sendJson(res, 200, { channels: service.listing.listChannels() }) })
  reg('/project-steward/api/market/gaps', async (req, res) => {
    if (!guard(req, res)) return
    if (req.method === 'POST') {
      try { const b = await body(req); const gaps = await service.market.gaps(b.channelIds, 'user'); sendJson(res, 200, { ok: true, gaps }) }
      catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
    } else {
      sendJson(res, 200, { gaps: service.store.list('market-gaps').sort((a, b) => b.gapScore - a.gapScore) })
    }
  })
  reg('/project-steward/api/market/report', (req, res) => { if (!guard(req, res)) return; sendJson(res, 200, { report: service.store.readMarketReport(query(req).get('id')) || null }) })
  reg('/project-steward/api/market/report', (req, res) => { if (!guard(req, res)) return; sendJson(res, 200, { report: service.store.readMarketReport(query(req).get('id')) || null }) })

  // 受控写
  reg('/project-steward/api/collect', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { const runs = await service.collector.collectNow(b.channelId); sendJson(res, 200, { ok: true, runs }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/market/scan', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { const reports = await service.market.scan(b.projectId); sendJson(res, 200, { ok: true, reports }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/release/start', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { const run = await service.pipeline.startRun(b, 'user'); sendJson(res, 200, { ok: true, run }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/scan', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try {
      const roots = Array.isArray(b.roots) && b.roots.length ? b.roots : ['E:\\']
      const candidates = service.scanCandidates(roots, { exclude: b.exclude })
      sendJson(res, 200, { ok: true, candidates })
    } catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/register', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { const project = await service.registerProject(b, 'user'); sendJson(res, 200, { ok: true, project }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/release/record', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try {
      const { genId } = await import('./store.js')
      const rel = { id: genId('rel'), projectId: b.projectId, runId: b.runId || 'run-manual-record', version: b.version, changelog: b.changelog || ('release ' + b.version), artifacts: b.artifacts || [], releasedAt: b.releasedAt || new Date().toISOString() }
      const release = await service.store.create('releases', rel, 'user', 'release-record')
      sendJson(res, 200, { ok: true, release })
    } catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/listing/create', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { const listing = await service.listing.createListing(b, 'user'); sendJson(res, 200, { ok: true, listing }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/listing/update', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { const listing = await service.listing.transitionListing(b.listingId, b.to, { actor: 'user', note: b.note, platformUrl: b.platformUrl, waive: b.waive }); sendJson(res, 200, { ok: true, listing }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/doc/check', (req, res) => {
    if (!guard(req, res)) return
    try { sendJson(res, 200, { ok: true, check: service.docs.docCheck(query(req).get('id')) }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/doc/channel-check', (req, res) => {
    if (!guard(req, res)) return
    const q = query(req)
    try { sendJson(res, 200, { ok: true, check: service.docs.channelCheck(q.get('id'), q.get('channel')) }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/doc/complete', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { sendJson(res, 200, { ok: true, result: service.docs.docCompleteChannel(b.projectId, b.channelId, b) }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/doc/scaffold', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { sendJson(res, 200, { ok: true, result: service.docs.docScaffold(b.projectId, b) }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/doc/update-image', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { sendJson(res, 200, { ok: true, result: service.docs.generateUpdateImage(b.projectId, b.version, b) }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/doc/cover', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { sendJson(res, 200, { ok: true, result: service.docs.generateCover(b.projectId, b) }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/website/list', (req, res) => {
    if (!guard(req, res)) return
    const sites = service.website.list()
    const status = service.store.list('website-status')
    const latest = {}
    for (const s of status) if (!latest[s.websiteId] || s.at > latest[s.websiteId].at) latest[s.websiteId] = s
    sendJson(res, 200, { ok: true, websites: sites.map(w => ({ ...w, latest: latest[w.id] || null })) })
  })
  reg('/project-steward/api/website/add', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { sendJson(res, 200, { ok: true, website: await service.website.add(b) }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/website/check', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { sendJson(res, 200, { ok: true, results: await service.website.check(b.websiteId) }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/website/remove', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { sendJson(res, 200, { ok: true, website: await service.website.remove(b.websiteId, b.reason) }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/website/showcase', (req, res) => {
    if (!guard(req, res)) return
    try { sendJson(res, 200, { ok: true, showcase: service.website.showcase(), html: service.website.showcaseHtml() }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/website/sync', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { sendJson(res, 200, { ok: true, result: await service.website.deployShowcase(b.websiteId, { build: b.build }) }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/maintenance', (req, res) => {
    if (!guard(req, res)) return
    try { sendJson(res, 200, { ok: true, report: service.docs.maintenanceReport() }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/channel/scan', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { sendJson(res, 200, { ok: true, candidates: await service.channelImport.scan(b) }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
  reg('/project-steward/api/channel/import', async (req, res) => {
    if (!guard(req, res)) return
    const b = await body(req)
    try { sendJson(res, 200, { ok: true, result: await service.channelImport.importProduct(b.candidate, 'user') }) }
    catch (e) { sendJson(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } }) }
  })
}

function latestByChannel(metrics) {
  const map = new Map()
  for (const m of metrics) {
    const key = m.channelId || '_'
    const cur = map.get(key)
    if (!cur || m.date > cur.date) map.set(key, m)
  }
  return [...map.values()]
}