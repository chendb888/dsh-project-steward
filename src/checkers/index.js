// M4 · 7 个自动检查器（07 M4）。每个 (project, run, io?) => Evidence。
// io 可注入以便测试：{ exists, readFile, git, glob, scan }。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const now = () => new Date().toISOString()
const ev = (summary, extra = {}) => ({ kind: 'check', summary, at: now(), ...extra })

const defaultIo = {
  exists: p => existsSync(p),
  readFile: p => { try { return readFileSync(p, 'utf8') } catch { return '' } },
  git: (root, args) => {
    try { const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 15000 }); return { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '') } }
    catch (e) { return { code: 1, out: String(e.message || e) } }
  },
  glob: (root, pattern) => {
    // 简易 glob：仅支持 dir/*.ext 形式
    const m = pattern.match(/^([^*]+)\*\.(\w+)$/)
    if (!m) return []
    const dir = join(root, m[1].replace(/[\\/]$/, ''))
    if (!existsSync(dir)) return []
    try { return readdirSync(dir).filter(f => f.endsWith('.' + m[2])).map(f => join(dir, f)) } catch { return [] }
  },
}

export const checkers = {
  'git-clean': (project, run, io = defaultIo) => {
    const r = io.git(project.rootPath, ['status', '--porcelain'])
    if (r.code !== 0) return ev(`git 检查失败：${r.out.slice(0, 200)}`, { exitCode: r.code })
    const lines = r.out.trim().split('\n').filter(Boolean)
    if (lines.length === 0) return ev('git 工作区干净', { exitCode: 0 })
    return ev(`git 工作区有 ${lines.length} 处未提交改动`, { exitCode: 1, outputTail: lines.slice(0, 20).join('\n') })
  },

  'version-consistency': (project, run, io = defaultIo) => {
    const root = project.rootPath
    const versions = []
    const pkg = io.readFile(join(root, 'package.json'))
    if (pkg) { try { versions.push(['package.json', JSON.parse(pkg).version]) } catch {} }
    const godot = io.readFile(join(root, 'project.godot'))
    if (godot) { const m = godot.match(/config\/version\s*=\s*"([^"]+)"/); if (m) versions.push(['project.godot', m[1]]) }
    const target = run?.version
    if (target) versions.push(['run.version', target])
    const vals = versions.map(v => v[1]).filter(Boolean)
    if (vals.length === 0) return ev('未找到版本声明', { exitCode: 1 })
    const consistent = vals.every(v => v === vals[0])
    const detail = versions.map(([f, v]) => `${f}=${v}`).join(', ')
    return consistent ? ev(`版本一致：${detail}`, { exitCode: 0 }) : ev(`版本不一致：${detail}`, { exitCode: 1 })
  },

  'changelog-nonempty': (project, run, io = defaultIo) => {
    const cl = io.readFile(join(project.rootPath, 'CHANGELOG.md'))
    if (!cl.trim()) return ev('CHANGELOG.md 缺失或为空', { exitCode: 1 })
    if (run?.version && !cl.includes(run.version)) return ev(`CHANGELOG 未含版本 ${run.version}`, { exitCode: 1 })
    return ev('CHANGELOG 非空且含当前版本', { exitCode: 0 })
  },

  'artifact-exists': (project, run, io = defaultIo) => {
    const pattern = run?.artifactGlob || 'build/*.exe'
    const files = io.glob(project.rootPath, pattern)
    if (files.length === 0) return ev(`未找到产物 ${pattern}`, { exitCode: 1 })
    return ev(`找到 ${files.length} 个产物`, { exitCode: 0, files })
  },

  'export-presets-exist': (project, run, io = defaultIo) => {
    const p = join(project.rootPath, 'export_presets.cfg')
    if (!io.exists(p)) return ev('export_presets.cfg 不存在', { exitCode: 1 })
    const content = io.readFile(p)
    const count = (content.match(/\[preset\.\d+\]/g) || []).length
    return count > 0 ? ev(`含 ${count} 个导出预设`, { exitCode: 0 }) : ev('export_presets.cfg 无预设', { exitCode: 1 })
  },

  'test-exit': (project, run, io = defaultIo) => {
    // cli 别名：实际由 pipeline 以子进程跑测试命令；此处给静态判定占位
    return ev('test-exit 由 cli 步骤执行（见 pipeline）', { exitCode: 0 })
  },

  'config-secrets-check': (project, run, io = defaultIo) => {
    const root = project.rootPath
    const targets = ['.env', 'config.json', 'config.js', 'settings.json', 'cordis.patch.yml']
    const hits = []
    const patterns = [/sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /password\s*[:=]\s*['"][^'"]{6,}['"]/i]
    const scanFile = (rel) => {
      const content = io.readFile(join(root, rel))
      if (!content) return
      content.split('\n').forEach((line, i) => {
        if (patterns.some(p => p.test(line))) hits.push(`${rel}:${i + 1}`)
      })
    }
    for (const t of targets) if (io.exists(join(root, t))) scanFile(t)
    if (hits.length) return ev(`发现疑似明文密钥 ${hits.length} 处（只报位置）`, { exitCode: 1, outputTail: hits.join('\n') })
    return ev('未发现明文密钥', { exitCode: 0 })
  },

  // FR2.9/R29 发布说明硬门禁：README 必备（功能+安装+版本更新说明）
  'readme-exists': (project, run, io = defaultIo) => {
    const root = project.rootPath
    const candidates = ['README.md', 'readme.md', 'README.MD', 'README']
    const found = candidates.find(f => io.exists(join(root, f)))
    if (!found) return ev('缺少 README（发布说明硬门禁 FR2.9）', { exitCode: 1 })
    const content = io.readFile(join(root, found))
    if (content.trim().length < 50) return ev(`README 过简（${content.trim().length} 字符），需含功能/安装/版本说明`, { exitCode: 1 })
    if (run?.version && !content.includes(run.version)) return ev(`README 未含当前版本 ${run.version} 的更新说明`, { exitCode: 1 })
    return ev(`README 齐备（${found}，${content.length} 字符）`, { exitCode: 0, files: [join(root, found)] })
  },
}

export function runChecker(name, project, run, io) {
  const fn = checkers[name]
  if (!fn) return ev(`未知检查器 ${name}`, { exitCode: 1 })
  return fn(project, run, io)
}