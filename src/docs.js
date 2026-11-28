// M15 · 项目说明与更新维护（FR7 / R29）。按各商店规则生成/核对项目说明，维护巡检。
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { storeError } from './store.js'

const now = () => new Date().toISOString()

// 各商店的项目说明规则（FR7.3 按渠道材料模板）
export const CHANNEL_RULES = {
  'npm-registry': { label: 'npm', materials: ['readme', 'description', 'keywords'], note: 'README 自动展示于 npmjs.com；package.json description+keywords' },
  'mirror': { label: '镜像', materials: ['readme', 'description'], note: '同步 npm 包内容（README/description）' },
  'source-repo': { label: 'GitHub', materials: ['readme', 'repo-description', 'topics'], note: 'README + 仓库 description + topics' },
  'plugin-market': { label: 'DSH 市场', materials: ['locale-meta', 'detail-doc', 'icon'], note: 'locale meta.title/description + DETAIL.md + icon.svg' },
  'game-store': { label: '游戏商店', materials: ['description', 'tags', 'cover', 'screenshots'], note: '游戏介绍+标签+封面+截图' },
  'web-deploy': { label: 'Web 部署', materials: ['description'], note: '应用说明' },
}

export class Docs {
  constructor(service) { this.service = service; this.store = service.store }

  _read(root, f) { try { return readFileSync(join(root, f), 'utf8') } catch { return '' } }
  _exists(root, f) { return existsSync(join(root, f)) }

  // FR7.3 上架完整性核对：README/CHANGELOG/description/版本说明
  docCheck(projectId) {
    const p = this.service.getProject(projectId)
    if (!p) throw storeError('NOT_FOUND', `项目 ${projectId} 不存在`)
    const root = p.rootPath
    const latest = this.store.list('releases').filter(r => r.projectId === projectId).sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))[0]
    const ver = latest?.version
    const readme = ['README.md', 'readme.md', 'README'].find(f => this._exists(root, f))
    const readmeContent = readme ? this._read(root, readme) : ''
    const changelog = ['CHANGELOG.md', 'CHANGES.md', 'HISTORY.md'].find(f => this._exists(root, f))
    const pkg = this._read(root, 'package.json')
    let pkgDesc = ''
    try { pkgDesc = JSON.parse(pkg).description || '' } catch {}
    const items = [
      { key: 'readme', label: 'README 项目说明', ok: !!readme && readmeContent.trim().length >= 50, detail: readme ? `${readme}（${readmeContent.trim().length} 字符）` : '缺失' },
      { key: 'readme-version', label: 'README 含最新版本说明', ok: !!ver && readmeContent.includes(ver), detail: ver ? (readmeContent.includes(ver) ? `含 ${ver}` : `未含 ${ver}`) : '无 release' },
      { key: 'changelog', label: 'CHANGELOG 逐版本变更', ok: !!changelog && this._read(root, changelog).trim().length > 0, detail: changelog || '缺失' },
      { key: 'description', label: 'package.json description', ok: pkgDesc.length > 0, detail: pkgDesc || '缺失' },
    ]
    const missing = items.filter(i => !i.ok)
    return { projectId, name: p.name, latestVersion: ver || null, items, complete: missing.length === 0, missing: missing.map(i => i.key) }
  }

  // FR7.1 生成 README+CHANGELOG 模板（仅补缺失，不覆盖已有）
  docScaffold(projectId, opts = {}) {
    const p = this.service.getProject(projectId)
    if (!p) throw storeError('NOT_FOUND', `项目 ${projectId} 不存在`)
    const root = p.rootPath
    const releases = this.store.list('releases').filter(r => r.projectId === projectId).sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))
    const latest = releases[0]
    const created = []
    const typeLabel = { 'dsh-plugin': 'DSH 插件', game: '游戏', 'web-app': 'Web 应用', 'business-system': '业务系统', engine: '引擎', research: '研究项目', host: '宿主' }[p.type] || p.type

    if (!['README.md', 'readme.md', 'README'].some(f => this._exists(root, f)) || opts.force) {
      const features = (p.tags || []).map(t => `- ${t}`).join('\n') || '- （待补充功能特性）'
      const install = p.type === 'dsh-plugin' ? `\`\`\`bash\ndsh plugin --profile web add ${opts.packageName || p.name}\n\`\`\`` : '（待补充安装方式）'
      const verSection = latest ? `### ${latest.version}\n${latest.changelog || '- （待补充更新内容）'}` : '### （尚无发布版本）'
      const readme = `# ${p.name}\n\n> ${p.notes || typeLabel + '项目说明（待补充）'}\n\n## 功能特性\n\n${features}\n\n## 安装\n\n${install}\n\n## 使用\n\n（待补充使用说明）\n\n## 版本更新说明\n\n${verSection}\n\n## 许可\n\n${opts.license || 'MIT'}\n`
      writeFileSync(join(root, 'README.md'), readme, 'utf8')
      created.push('README.md')
    }
    if (!['CHANGELOG.md', 'CHANGES.md', 'HISTORY.md'].some(f => this._exists(root, f)) || opts.force) {
      const entries = releases.length ? releases.map(r => `## [${r.version}] - ${r.releasedAt.slice(0, 10)}\n\n${r.changelog || '- （待补充）'}`).join('\n\n') : '## [未发布]\n\n- 初始版本（待补充）'
      const changelog = `# Changelog\n\n本文件记录 ${p.name} 逐版本变更。\n\n${entries}\n`
      writeFileSync(join(root, 'CHANGELOG.md'), changelog, 'utf8')
      created.push('CHANGELOG.md')
    }
    return { projectId, name: p.name, created, check: this.docCheck(projectId) }
  }

  // FR7.4 维护巡检：所有项目说明齐备性 + 版本一致性
  maintenanceReport() {
    const projects = this.service.listProjects()
    const reports = projects.map(p => {
      const c = this.docCheck(p.id)
      const issues = [...c.missing]
      // 版本一致性：package.json version vs 最新 release
      const pkg = this._read(p.rootPath, 'package.json')
      try {
        const pv = JSON.parse(pkg).version
        if (c.latestVersion && pv && pv !== c.latestVersion) issues.push('version-mismatch')
      } catch {}
      return { projectId: p.id, name: p.name, type: p.type, complete: c.complete && !issues.includes('version-mismatch'), latestVersion: c.latestVersion, issues }
    })
    return { generatedAt: now(), total: reports.length, incomplete: reports.filter(r => !r.complete).length, reports }
  }

  // FR7.3 按商店规则核对项目说明
  channelCheck(projectId, channelId) {
    const p = this.service.getProject(projectId)
    if (!p) throw storeError('NOT_FOUND', `项目 ${projectId} 不存在`)
    const ch = this.store.get('channels', channelId)
    if (!ch) throw storeError('NOT_FOUND', `渠道 ${channelId} 不存在`)
    const rule = CHANNEL_RULES[ch.category] || { label: ch.category, materials: ['readme', 'description'], note: '' }
    const root = p.rootPath
    const has = f => this._exists(root, f)
    const readme = ['README.md', 'readme.md', 'README'].find(f => has(f))
    const pkg = this._read(root, 'package.json')
    let pkgJson = {}; try { pkgJson = JSON.parse(pkg) } catch {}
    const repo = (p.remote || '').match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1]
    const checks = {
      readme: !!readme && this._read(root, readme).trim().length >= 50,
      description: (pkgJson.description || '').length > 0,
      keywords: Array.isArray(pkgJson.keywords) && pkgJson.keywords.length > 0,
      'repo-description': false, // 需 GitHub API 核实，下方 complete 时设置
      topics: false,
      'locale-meta': ['locale/en.json', 'locale/zh.json'].every(f => { try { const m = JSON.parse(this._read(root, f)).meta; return m && m.title && m.description } catch { return false } }),
      'detail-doc': has('docs/DETAIL.md'),
      icon: has('icon.svg'),
      tags: (p.tags || []).length > 0,
      cover: false, screenshots: false,
    }
    const items = rule.materials.map(m => ({ key: m, ok: !!checks[m], label: m }))
    return { projectId, channelId, channel: ch.name, category: ch.category, rule: rule.note, items, missing: items.filter(i => !i.ok).map(i => i.key) }
  }

  // FR7.1 按商店规则完成项目说明
  docCompleteChannel(projectId, channelId, opts = {}) {
    const p = this.service.getProject(projectId)
    if (!p) throw storeError('NOT_FOUND', `项目 ${projectId} 不存在`)
    const ch = this.store.get('channels', channelId)
    if (!ch) throw storeError('NOT_FOUND', `渠道 ${channelId} 不存在`)
    const root = p.rootPath
    const done = []
    const desc = (p.notes || p.name).slice(0, 350)
    const repo = (p.remote || '').match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1]

    // 通用：README 缺失则生成
    if (!['README.md', 'readme.md', 'README'].some(f => this._exists(root, f))) { this.docScaffold(projectId); done.push('README.md(scaffold)') }

    if (ch.category === 'npm-registry' || ch.category === 'mirror') {
      // 确保 package.json description + keywords
      const pkgPath = join(root, 'package.json')
      try {
        const pj = JSON.parse(readFileSync(pkgPath, 'utf8'))
        let changed = false
        if (!pj.description) { pj.description = desc; changed = true }
        if (!pj.keywords || !pj.keywords.length) { pj.keywords = p.tags || []; changed = true }
        if (changed) { writeFileSync(pkgPath, JSON.stringify(pj, null, 2)); done.push('package.json description+keywords') }
      } catch {}
    } else if (ch.category === 'source-repo' && repo) {
      // GitHub：设置仓库 description + topics（gh CLI；topics 须小写字母数字连字符）
      const topicMap = { '看板': 'kanban-board', '可视化': 'visualization', '白盒': 'whitebox', '任务': 'task-management', '进度': 'progress', '导游': 'guide' }
      const topics = []
      for (const t of (p.tags || [])) {
        const mapped = topicMap[t] || t
        const clean = String(mapped).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-')
        if (/^[a-z][a-z0-9-]*$/.test(clean) && clean.length <= 50 && !topics.includes(clean)) topics.push(clean)
      }
      if (!topics.includes('dsh-plugin')) topics.push('dsh-plugin')
      const args = ['repo', 'edit', repo, '--description', desc]
      for (const t of topics.slice(0, 15)) { args.push('--add-topic', t) }
      const r = spawnSync('gh', args, { encoding: 'utf8', timeout: 30000 })
      if (r.status === 0) done.push(`GitHub description+topics (${repo}: ${topics.join(',')})`)
      else done.push(`GitHub 设置失败：${(r.stderr || r.stdout || '').slice(0, 120)}`)
    } else if (ch.category === 'plugin-market') {
      // DSH 市场：locale meta + DETAIL.md + icon
      mkdirSync(join(root, 'locale'), { recursive: true })
      for (const [f, title] of [['locale/en.json', p.name], ['locale/zh.json', p.name]]) {
        const fp = join(root, f)
        let obj = {}; try { obj = JSON.parse(readFileSync(fp, 'utf8')) } catch {}
        obj.meta = obj.meta || {}
        if (!obj.meta.title) obj.meta.title = title
        if (!obj.meta.description) obj.meta.description = desc
        if (f.endsWith('en.json') && !obj.meta.detail) obj.meta.detail = 'docs/DETAIL.md'
        writeFileSync(fp, JSON.stringify(obj, null, 2)); done.push(f + ' meta')
      }
      if (!this._exists(root, 'docs/DETAIL.md')) {
        mkdirSync(join(root, 'docs'), { recursive: true })
        const readme = this._read(root, 'README.md') || desc
        writeFileSync(join(root, 'docs/DETAIL.md'), readme, 'utf8'); done.push('docs/DETAIL.md')
      }
      if (!this._exists(root, 'icon.svg')) done.push('⚠️ 缺 icon.svg（需人工提供）')
    } else if (ch.category === 'game-store') {
      done.push('⚠️ 游戏商店需封面/截图素材（人工提供）；介绍文案可由 README 提取')
    }
    return { projectId, channelId, channel: ch.name, done, check: this.channelCheck(projectId, channelId) }
  }

  // FR7.7 生成某版本更新位置标注图（SVG→PNG），落 docs/images/update-<version>.png
  generateUpdateImage(projectId, version, opts = {}) {
    const p = this.service.getProject(projectId)
    if (!p) throw storeError('NOT_FOUND', `项目 ${projectId} 不存在`)
    const root = p.rootPath
    const changelog = this._read(root, 'CHANGELOG.md')
    const bullets = this._versionBullets(changelog, version)
    const svg = this._buildUpdateSvg(p.name, version, bullets)
    const imgDir = join(root, 'docs', 'images')
    mkdirSync(imgDir, { recursive: true })
    const svgPath = join(imgDir, `update-${version}.svg`)
    const pngPath = join(imgDir, `update-${version}.png`)
    writeFileSync(svgPath, svg, 'utf8')
    const chrome = opts.chrome || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    const r = spawnSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', `--screenshot=${pngPath}`, '--window-size=900,560', `file:///${svgPath.replace(/\\/g, '/')}`], { encoding: 'utf8', timeout: 30000 })
    const ok = existsSync(pngPath)
    // 推 GitHub（若 remote 是 GitHub）以便 npm 渲染绝对 URL
    let url = null
    const repo = (p.remote || '').match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1]
    if (ok && repo && !opts.noPush) {
      try {
        const b64 = readFileSync(pngPath).toString('base64')
        const body = JSON.stringify({ message: `docs: ${version} 更新位置标注图`, content: b64 })
        const tmp = join(imgDir, `_body.json`); writeFileSync(tmp, body)
        const gr = spawnSync('gh', ['api', `repos/${repo}/contents/docs/images/update-${version}.png`, '--method', 'PUT', '--input', tmp], { encoding: 'utf8', timeout: 30000 })
        if (gr.status === 0) url = `https://raw.githubusercontent.com/${repo}/main/docs/images/update-${version}.png`
      } catch {}
    }
    return { projectId, version, svgPath, pngPath, ok, url, bullets }
  }

  _versionBullets(changelog, version) {
    const sec = changelog.split(new RegExp(`##\\s*\\[?${version.replace(/\./g, '\\.')}\\]?`))[1]
    if (!sec) return ['（该版本无 changelog 条目）']
    const body = sec.split(/\n##\s/)[0]
    const bullets = []
    for (const line of body.split('\n')) {
      const m = line.match(/^[-*]\s+(.+)/)
      if (m && !/^\!\[/.test(m[1])) bullets.push(m[1].replace(/\*\*/g, '').trim())
    }
    return bullets.slice(0, 6)
  }

  _buildUpdateSvg(name, version, bullets) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const bl = bullets.slice(0, 4)
    const bulletSvg = bl.map((b, i) => `<text x="40" y="${150 + i * 26}" fill="#ddd" font-size="13">• ${esc(b.slice(0, 60))}</text>`).join('')
    const legend = bl.slice(0, 2).map((b, i) => `<text x="40" y="${470 + i * 24}" fill="#ddd" font-size="12">${i === 0 ? '①' : '②'} ${esc(b.slice(0, 70))}</text>`).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560" font-family="Segoe UI, Microsoft YaHei, sans-serif">
<rect width="900" height="560" fill="#1e1e1e"/>
<rect x="0" y="0" width="900" height="50" fill="#2a2a2a"/>
<text x="20" y="32" fill="#fff" font-size="17" font-weight="bold">${esc(name)} · v${esc(version)} 更新位置</text>
<text x="40" y="100" fill="#ff5000" font-size="15" font-weight="bold">本次更新内容</text>
${bulletSvg}
<rect x="40" y="270" width="380" height="150" rx="8" fill="#2a2a2a" stroke="#3a3a3a"/>
<text x="55" y="300" fill="#fff" font-size="13" font-weight="bold">界面区域 A</text>
<rect x="55" y="315" width="350" height="8" rx="4" fill="#22a06b"/>
<text x="55" y="350" fill="#888" font-size="11">更新区域①（红框标注）</text>
<rect x="35" y="265" width="390" height="160" rx="10" fill="none" stroke="#ff3b30" stroke-width="2.5" stroke-dasharray="6 3"/>
<rect x="450" y="270" width="410" height="150" rx="8" fill="#2a2a2a" stroke="#3a3a3a"/>
<text x="465" y="300" fill="#fff" font-size="13" font-weight="bold">界面区域 B</text>
<rect x="465" y="315" width="280" height="8" rx="4" fill="#5b6cff"/>
<text x="465" y="350" fill="#888" font-size="11">更新区域②（红框标注）</text>
<rect x="445" y="265" width="420" height="160" rx="10" fill="none" stroke="#ff3b30" stroke-width="2.5" stroke-dasharray="6 3"/>
<rect x="20" y="440" width="860" height="100" rx="8" fill="#252525"/>
<text x="40" y="465" fill="#ff5000" font-size="14" font-weight="bold">v${esc(version)} 更新位置图例</text>
${legend}
<text x="40" y="528" fill="#888" font-size="11">红虚线框 = 本次更新位置 · 示意图（实际界面以运行时为准）</text>
</svg>`
  }

  // FR7.8 应用封面/图标设计生成（icon 256 + cover 1200x630，SVG→PNG）
  generateCover(projectId, opts = {}) {
    const p = this.service.getProject(projectId)
    if (!p) throw storeError('NOT_FOUND', `项目 ${projectId} 不存在`)
    const root = p.rootPath
    const theme = this._coverTheme(p)
    const iconSvg = this._iconSvg(theme)
    const coverSvg = this._coverSvg(p, theme)
    const imgDir = /^https?:/i.test(root) ? join(this.store.dataDir || 'data', 'covers', p.id) : join(root, 'docs', 'images')
    mkdirSync(imgDir, { recursive: true })
    const out = {}
    const chrome = opts.chrome || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    for (const [kind, svg, w, h] of [['icon', iconSvg, 256, 256], ['cover', coverSvg, 1200, 630]]) {
      const svgPath = join(imgDir, `${kind}.svg`)
      const pngPath = join(imgDir, `${kind}.png`)
      const sized = svg.replace('<svg ', `<svg width="${w}" height="${h}" `)
      writeFileSync(svgPath, sized, 'utf8')
      const htmlPath = join(imgDir, `_${kind}.html`)
      writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>${sized}</body></html>`, 'utf8')
      spawnSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1', '--default-background-color=00000000', `--screenshot=${pngPath}`, `--window-size=${w},${h}`, `file:///${htmlPath.replace(/\\/g, '/')}`], { encoding: 'utf8', timeout: 30000 })
      out[kind] = { svg: svgPath, png: pngPath, ok: existsSync(pngPath) }
    }
    // 本地项目：更新 icon.svg 为新生成图标
    if (!/^https?:/i.test(root) && out.icon.ok) { try { writeFileSync(join(root, 'icon.svg'), iconSvg, 'utf8') } catch {} }
    return { projectId, name: p.name, theme: theme.key, ...out }
  }

  _coverTheme(p) {
    const n = (p.name || '').toLowerCase()
    if (/看板|board|可视化|whitebox/.test(n)) return { key: 'board', c1: '#6366f1', c2: '#8b5cf6', accent: '#22c55e', glyph: 'board' }
    if (/管家|steward|store|shop/.test(n)) return { key: 'steward', c1: '#ff6a00', c2: '#ffa028', accent: '#ffd166', glyph: 'store' }
    if (p.type === 'game') return { key: 'game', c1: '#16a34a', c2: '#4ade80', accent: '#facc15', glyph: 'game' }
    if (p.type === 'web-app') return { key: 'web', c1: '#0ea5e9', c2: '#38bdf8', accent: '#a5f3fc', glyph: 'web' }
    return { key: 'default', c1: '#6366f1', c2: '#8b5cf6', accent: '#22c55e', glyph: 'board' }
  }

  _motif(glyph, x, y, s, accent) {
    // s = 尺寸基准；返回以 (x,y) 为左上、边长 s 的白色图案
    if (glyph === 'board') {
      const cw = s * 0.26, gap = s * 0.05, card = (cx, cy, h, fill) => `<rect x="${cx}" y="${cy}" width="${cw}" height="${h}" rx="${s * 0.03}" fill="${fill}"/>`
      return `<g>
        <rect x="${x}" y="${y}" width="${s}" height="${s * 0.82}" rx="${s * 0.06}" fill="#ffffff" opacity="0.16"/>
        ${card(x + gap, y + gap, s * 0.3, '#ffffff')}
        ${card(x + gap, y + gap + s * 0.34, s * 0.2, '#ffffff')}
        ${card(x + gap * 2 + cw, y + gap, s * 0.42, '#ffffff')}
        ${card(x + gap * 2 + cw, y + gap + s * 0.46, s * 0.16, accent)}
        ${card(x + gap * 3 + cw * 2, y + gap, s * 0.24, '#ffffff')}
        ${card(x + gap * 3 + cw * 2, y + gap + s * 0.28, s * 0.3, '#ffffff')}
        <circle cx="${x + s * 0.86}" cy="${y + s * 0.14}" r="${s * 0.13}" fill="none" stroke="${accent}" stroke-width="${s * 0.05}"/>
      </g>`
    }
    if (glyph === 'store') {
      return `<g>
        <rect x="${x + s * 0.08}" y="${y + s * 0.3}" width="${s * 0.84}" height="${s * 0.52}" rx="${s * 0.05}" fill="#ffffff" opacity="0.92"/>
        <path d="M ${x + s * 0.04} ${y + s * 0.3} L ${x + s * 0.12} ${y + s * 0.1} L ${x + s * 0.88} ${y + s * 0.1} L ${x + s * 0.96} ${y + s * 0.3} Z" fill="#ffffff"/>
        <path d="M ${x + s * 0.04} ${y + s * 0.3} q ${s * 0.077} ${s * 0.12} ${s * 0.154} 0 q ${s * 0.077} ${s * 0.12} ${s * 0.154} 0 q ${s * 0.077} ${s * 0.12} ${s * 0.154} 0 q ${s * 0.077} ${s * 0.12} ${s * 0.154} 0 q ${s * 0.077} ${s * 0.12} ${s * 0.154} 0 q ${s * 0.077} ${s * 0.12} ${s * 0.154} 0" fill="${accent}"/>
        <rect x="${x + s * 0.16}" y="${y + s * 0.44}" width="${s * 0.2}" height="${s * 0.16}" rx="${s * 0.02}" fill="${accent}"/>
        <rect x="${x + s * 0.4}" y="${y + s * 0.44}" width="${s * 0.2}" height="${s * 0.16}" rx="${s * 0.02}" fill="#cbd5e1"/>
        <rect x="${x + s * 0.64}" y="${y + s * 0.44}" width="${s * 0.2}" height="${s * 0.3}" rx="${s * 0.02}" fill="#94a3b8"/>
        <rect x="${x + s * 0.16}" y="${y + s * 0.64}" width="${s * 0.44}" height="${s * 0.1}" rx="${s * 0.02}" fill="#e2e8f0"/>
      </g>`
    }
    if (glyph === 'game') return `<g><rect x="${x + s * 0.1}" y="${y + s * 0.3}" width="${s * 0.8}" height="${s * 0.4}" rx="${s * 0.2}" fill="#fff"/><circle cx="${x + s * 0.3}" cy="${y + s * 0.5}" r="${s * 0.09}" fill="${accent}"/><circle cx="${x + s * 0.68}" cy="${y + s * 0.44}" r="${s * 0.06}" fill="${accent}"/><circle cx="${x + s * 0.78}" cy="${y + s * 0.56}" r="${s * 0.06}" fill="${accent}"/></g>`
    return `<g><circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s * 0.35}" fill="#fff" opacity="0.9"/><circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s * 0.18}" fill="${accent}"/></g>`
  }

  _iconSvg(t) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" font-family="Segoe UI, sans-serif">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient></defs>
<rect width="256" height="256" rx="56" fill="url(#g)"/>
<circle cx="200" cy="56" r="60" fill="#ffffff" opacity="0.08"/>
${this._motif(t.glyph, 48, 52, 160, t.accent)}
</svg>`
  }

  _coverSvg(p, t) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const n = (p.name || '').toLowerCase()
    const title = /steward|管家/.test(n) ? '项目管家' : /board|看板/.test(n) ? '项目白盒看板' : (p.name.startsWith('@') ? p.name.split('/').pop() : p.name)
    const tagline = t.key === 'board' ? '蓝图驱动 · 实时白盒看板 · 依赖DAG · 导游解说' : t.key === 'steward' ? '像经营百货商店一样管理你的软件项目' : (p.notes || '').slice(0, 40)
    const chips = t.key === 'board' ? ['蓝图驱动', '实时进度', '依赖DAG', '代码下钻'] : t.key === 'steward' ? ['分区货架', '全自动发布', '运营采集', '市场情报'] : (p.tags || []).slice(0, 4)
    const chipSvg = chips.map((c, i) => `<g><rect x="${70 + i * 150}" y="470" width="136" height="44" rx="22" fill="#ffffff" opacity="0.16"/><text x="${70 + i * 150 + 68}" y="498" fill="#fff" font-size="20" text-anchor="middle">${esc(c)}</text></g>`).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" font-family="Segoe UI, Microsoft YaHei, sans-serif">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
<circle cx="1050" cy="120" r="220" fill="#ffffff" opacity="0.07"/>
<circle cx="120" cy="560" r="160" fill="#ffffff" opacity="0.06"/>
<text x="70" y="200" fill="#ffffff" font-size="64" font-weight="bold">${esc(title)}</text>
<text x="70" y="260" fill="#ffffff" opacity="0.85" font-size="28">${esc(tagline)}</text>
<rect x="70" y="300" width="120" height="6" rx="3" fill="${t.accent}"/>
${chipSvg}
${this._motif(t.glyph, 780, 140, 330, t.accent)}
<text x="70" y="580" fill="#ffffff" opacity="0.6" font-size="20">@chendb888 · DSH 插件</text>
</svg>`
  }
}