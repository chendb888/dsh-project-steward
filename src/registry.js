// 项目管家 · M2 Registry：项目注册表 + 生命周期阶段机 + 用户自选目录扫描（07 M2）
import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Project, stageTransitions } from './schemas.js'
import { genId, storeError } from './store.js'

const DEFAULT_EXCLUDE = new Set([
  'Games', 'SteamLibrary', 'WeGameApps', 'Program Files', 'Program Files (x86)', 'ProgramData',
  'Users', 'WeChat', 'douyin', 'hihun', 'Netease', 'DockerData', '.pnpm-store', 'qycache',
  'images', 'Bin', 'AndrowsData', 'Comfy-Desktop', 'DK4PK.Green.Edition', '309376410',
  '迅雷下载', '达讯文件', '保单识别', 'node_modules', '.git', 'dist', 'build', '.cache',
])
const isExcluded = (name, extra = []) => {
  if (DEFAULT_EXCLUDE.has(name)) return true
  if (name.startsWith('node-') || name.startsWith('Resource.') || name.startsWith('6.19')) return true
  return extra.includes(name)
}

function detectType(dir) {
  const has = f => existsSync(join(dir, f))
  const evidence = []
  if (has('cordis.patch.yml') && has('package.json')) { evidence.push('cordis.patch.yml', 'package.json'); return { type: 'dsh-plugin', evidence } }
  if (has('project.godot')) { evidence.push('project.godot'); return { type: 'game', evidence } }
  if (has('package.json')) {
    evidence.push('package.json')
    try {
      const pkg = JSON.parse(readFileSafe(join(dir, 'package.json')))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps && (deps.react || deps.vue || deps.next || deps.vite || deps.express || deps.fastify)) return { type: 'web-app', evidence }
    } catch {}
    return { type: 'web-app', evidence }
  }
  if (has('.git') || has('README.md')) { if (has('.git')) evidence.push('.git'); if (has('README.md')) evidence.push('README.md'); return { type: 'research', evidence } }
  return null
}
function readFileSafe(p) { try { return readFileSync(p, 'utf8') } catch { return '' } }

export class Registry {
  constructor(store) { this.store = store }

  _normalizeRoot(rootPath) {
    // 远程-only 项目（从渠道导入，无本地源）：rootPath 为 URL，跳过本地存在校验
    if (/^https?:\/\//i.test(rootPath)) return rootPath
    const r = resolve(rootPath)
    if (!existsSync(r)) throw storeError('PATH_NOT_FOUND', `路径不存在：${r}`)
    return r
  }
  _dupCheck(rootPath, exceptId) {
    const lower = rootPath.toLowerCase().replace(/[\\/]+$/, '')
    for (const p of this.store.list('projects')) {
      if (p.id === exceptId) continue
      if (p.rootPath.toLowerCase().replace(/[\\/]+$/, '') === lower) throw storeError('DUPLICATE', `根路径已登记：${p.name} (${p.id})`)
    }
  }

  async register(input, actor = 'user') {
    const rootPath = this._normalizeRoot(input.rootPath)
    this._dupCheck(rootPath)
    const now = new Date().toISOString()
    const project = {
      id: genId('p'), name: input.name, rootPath, type: input.type,
      stage: 'developing', owner: input.owner || 'me', remote: input.remote,
      tags: input.tags || [], notes: input.notes, templateId: input.templateId,
      createdAt: now, updatedAt: now,
    }
    return this.store.create('projects', Project.parse(project), actor, 'register')
  }

  get(id) { return this.store.get('projects', id) }
  list(filter) { return this.store.list('projects', filter) }

  async update(id, patch, actor = 'user') {
    return this.store.update('projects', id, d => {
      Object.assign(d, patch, { updatedAt: new Date().toISOString() })
      if (patch.rootPath) { d.rootPath = this._normalizeRoot(patch.rootPath); this._dupCheck(d.rootPath, id) }
    }, actor, 'update')
  }

  async transitionStage(id, to, actor = 'user', reason) {
    const p = this.get(id)
    if (!p) throw storeError('NOT_FOUND', `项目 ${id} 不存在`)
    const allowed = stageTransitions[p.stage] || []
    if (!allowed.includes(to)) throw storeError('ILLEGAL_TRANSITION', `项目阶段不允许 ${p.stage} → ${to}`)
    return this.store.update('projects', id, d => { d.stage = to; d.updatedAt = new Date().toISOString() }, actor, 'transition', reason)
  }

  // 用户自选目录扫描（R11/R15）：BFS 深度≤2，特征识别，排除表，候选不落盘
  scanCandidates(roots, opts = {}) {
    const extraExclude = opts.exclude || []
    const maxDepth = opts.maxDepth ?? 2
    const candidates = []
    const seen = new Set()
    const existingRoots = new Set(this.store.list('projects').map(p => p.rootPath.toLowerCase().replace(/[\\/]+$/, '')))

    const walk = (dir, depth) => {
      let entries
      try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const ent of entries) {
        if (!ent.isDirectory()) continue
        if (isExcluded(ent.name, extraExclude)) continue
        const full = join(dir, ent.name)
        const key = full.toLowerCase().replace(/[\\/]+$/, '')
        if (seen.has(key)) continue
        seen.add(key)
        const det = detectType(full)
        if (det) {
          candidates.push({
            rootPath: full, name: ent.name, suggestedType: det.type, evidence: det.evidence,
            alreadyRegistered: existingRoots.has(key),
          })
          // 命中特征即停（不再深入该项目内部）
          continue
        }
        if (depth < maxDepth) walk(full, depth + 1)
      }
    }
    for (const root of roots) {
      const r = resolve(root)
      if (existsSync(r) && statSync(r).isDirectory()) walk(r, 1)
    }
    return candidates
  }
}