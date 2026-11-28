// M3 · Pipeline：run 状态机 + 执行器 + 闸门 + 阻断（03§7.2 / 07 M3）。
// 全自动 R8：G2 默认放行；G4（豁免/取消）需显式 reason；readOnly 硬拒绝。
import { RunStatus, StepStatus } from './schemas.js'
import { genId, storeError } from './store.js'
import { runChecker } from './checkers/index.js'
import { templateFor } from './templates.js'
import { executePublish } from './publish/index.js'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const now = () => new Date().toISOString()
const ALLOWED_STAGE = ['developing', 'releasing', 'operating']
const DONE_STEP = ['passed', 'skipped', 'waived']

function defaultRunCmd(command, cwd) {
  try {
    const r = spawnSync(command, { cwd, encoding: 'utf8', timeout: 600000, shell: true })
    return { code: r.status ?? 1, out: ((r.stdout || '') + (r.stderr || '')).slice(-4096) }
  } catch (e) { return { code: 1, out: String(e.message || e) } }
}

export class Pipeline {
  constructor(service, opts = {}) {
    this.service = service
    this.store = service.store
    this.dryRun = opts.dryRun ?? true
    this.confirmGates = opts.confirmGates ?? false
    this.io = opts.io
    this.runCmd = opts.runCmd || defaultRunCmd
  }

  _emit(e) { this.service._broadcast(e) }
  getRun(id) { return this.store.readRun(id) }
  listRuns(projectId) { const r = this.store.listRuns(); return projectId ? r.filter(x => x.projectId === projectId) : r }

  _latestVersion(projectId) {
    const rels = this.store.list('releases').filter(r => r.projectId === projectId)
    if (!rels.length) return null
    return rels.map(r => r.version).sort(semverCompare).pop()
  }

  async startRun({ projectId, version, templateId, allowRegression, reason }, actor = 'agent') {
    const project = this.service.getProject(projectId)
    if (!project) throw storeError('NOT_FOUND', `项目 ${projectId} 不存在`)
    if (!ALLOWED_STAGE.includes(project.stage)) throw storeError('ILLEGAL_STAGE', `项目阶段 ${project.stage} 不允许发起发布`)
    if (this.listRuns(projectId).some(r => r.status === 'running' || r.status === 'blocked')) throw storeError('RUN_IN_PROGRESS', '已有进行中的 run')
    // 版本：缺省自动 bump patch（R21）
    const latest = this._latestVersion(projectId)
    let ver = version
    if (!ver) ver = latest ? bumpPatch(latest) : '0.1.0'
    if (latest && semverCompare(ver, latest) <= 0 && !allowRegression) throw storeError('VERSION_REGRESSION', `版本 ${ver} 不高于最近 ${latest}（需 allowRegression+reason）`)
    if (latest && semverCompare(ver, latest) <= 0 && allowRegression && !reason) throw storeError('INVALID_INPUT', '版本倒退豁免需 reason')
    const tpl = (templateId && this.store.get('templates', templateId)) || templateFor(project.type, this.store.list('templates'))
    if (!tpl) throw storeError('NOT_FOUND', `无 ${project.type} 类型模板`)
    const run = {
      id: genId('run'), projectId, version: ver, templateId: tpl.id, status: 'running',
      steps: tpl.steps.map(sd => ({ name: sd.name, kind: sd.kind, status: 'pending', _def: sd })),
      startedAt: now(),
    }
    this.store.writeRun(run)
    await this.service.transitionStage(projectId, 'releasing', actor, 'startRun').catch(() => {})
    this._emit({ type: 'steward/changed', entity: 'run', entityId: run.id, action: 'start' })
    return run
  }

  async executeStep(runId, stepName, { confirm } = {}, actor = 'agent') {
    const run = this.store.readRun(runId)
    if (!run) throw storeError('NOT_FOUND', `run ${runId} 不存在`)
    if (run.status === 'done' || run.status === 'cancelled') throw storeError('ILLEGAL_TRANSITION', `run 已 ${run.status}`)
    const step = run.steps.find(s => s.name === stepName)
    if (!step) throw storeError('NOT_FOUND', `步骤 ${stepName} 不存在`)
    const def = step._def || {}
    const project = this.service.getProject(run.projectId)
    const channel = this._channelFor(def)
    step.status = 'running'; step.startedAt = now()

    let evidence
    if (step.kind === 'auto-check') {
      evidence = runChecker(def.checker, project, run, this.io)
      step.status = evidence.exitCode === 0 ? 'passed' : 'failed'
    } else if (step.kind === 'cli') {
      if (this.confirmGates && !confirm) { step.status = 'pending'; throw storeError('CONFIRM_REQUIRED', `cli 步骤需 confirm：${def.command}`) }
      const cmd = (def.command || '').replace(/\{root\}/g, project.rootPath).replace(/\{version\}/g, run.version)
      const r = this.runCmd(cmd, project.rootPath)
      evidence = { kind: 'command', summary: `cli ${r.code === 0 ? '成功' : '失败'}：${cmd}`, exitCode: r.code, outputTail: r.out, command: cmd, at: now() }
      step.status = r.code === 0 ? 'passed' : 'failed'
    } else if (step.kind === 'auto-publish') {
      if (this.confirmGates && !confirm) { step.status = 'pending'; throw storeError('CONFIRM_REQUIRED', `发布步骤需 confirm：${def.publishAction}`) }
      evidence = executePublish(def.publishAction, { project, run, channel, dryRun: this.dryRun })
      if (evidence.code === 'ILLEGAL_ON_PROTECTED') { step.status = 'failed'; step.evidence = evidence; this._block(run, step); this.store.writeRun(run); throw storeError('ILLEGAL_ON_PROTECTED', evidence.summary) }
      step.status = evidence.exitCode === 0 ? 'passed' : 'failed'
    } else if (step.kind === 'manual') {
      step.evidence = { kind: 'manual', summary: def.guide || '等待人工回填', at: now() }
      this.store.writeRun(run)
      return step // running，等 completeManualStep
    }
    step.evidence = evidence
    step.finishedAt = now()
    if (step.status === 'failed' && def.blocking !== false) this._block(run, step)
    else await this._maybeComplete(run, actor)
    this.store.writeRun(run)
    return step
  }

  async completeManualStep(runId, stepName, result, note, actor = 'user') {
    const run = this.store.readRun(runId)
    if (!run) throw storeError('NOT_FOUND', `run ${runId} 不存在`)
    const step = run.steps.find(s => s.name === stepName)
    if (!step || step.kind !== 'manual') throw storeError('INVALID_INPUT', '非 manual 步骤')
    step.status = result === 'passed' ? 'passed' : 'failed'
    step.evidence = { kind: 'manual', summary: note || (result === 'passed' ? '人工完成' : '人工失败'), at: now() }
    step.finishedAt = now()
    if (step.status === 'failed' && (step._def?.blocking !== false)) this._block(run, step)
    else await this._maybeComplete(run, actor)
    this.store.writeRun(run)
    return step
  }

  async waiveStep(runId, stepName, reason, actor = 'user') {
    if (!reason) throw storeError('INVALID_INPUT', '豁免需 reason（G4）')
    const run = this.store.readRun(runId)
    if (!run) throw storeError('NOT_FOUND', `run ${runId} 不存在`)
    const step = run.steps.find(s => s.name === stepName)
    if (!step) throw storeError('NOT_FOUND', `步骤 ${stepName} 不存在`)
    if (step._def?.waivable === false) throw storeError('ILLEGAL_TRANSITION', '该步骤不可豁免')
    step.status = 'waived'; step.waiveReason = reason; step.finishedAt = now()
    if (run.status === 'blocked' && !run.steps.some(s => s.status === 'failed')) run.status = 'running'
    await this._maybeComplete(run, actor)
    this.store.writeRun(run)
    this._emit({ type: 'steward/changed', entity: 'run', entityId: runId, action: 'waive', reason })
    return step
  }

  async cancelRun(runId, reason, actor = 'user') {
    if (!reason) throw storeError('INVALID_INPUT', '取消需 reason')
    const run = this.store.readRun(runId)
    if (!run) throw storeError('NOT_FOUND', `run ${runId} 不存在`)
    run.status = 'cancelled'; run.cancelReason = reason; run.finishedAt = now()
    this.store.writeRun(run)
    await this.service.transitionStage(run.projectId, 'developing', actor, 'run cancelled').catch(() => {})
    return run
  }

  _channelFor(def) {
    const cat = def.publishAction ? (publishCategory(def.publishAction)) : null
    if (!cat) return null
    return this.store.list('channels').find(c => c.category === cat) || null
  }

  _block(run, step) {
    run.status = 'blocked'
    this._emit({ type: 'steward/run-blocked', runId: run.id, projectId: run.projectId, stepName: step.name })
  }

  async _maybeComplete(run, actor) {
    if (run.status === 'blocked') return
    if (!run.steps.every(s => DONE_STEP.includes(s.status))) return
    run.status = 'done'; run.finishedAt = now()
    const project = this.service.getProject(run.projectId)
    const files = run.steps.flatMap(s => s.evidence?.files || [])
    const release = {
      id: genId('rel'), projectId: run.projectId, runId: run.id, version: run.version,
      changelog: extractChangelog(project, run.version), artifacts: files.map(p => ({ path: p })), releasedAt: now(),
    }
    await this.store.create('releases', release, actor, 'release')
    await this.service.transitionStage(run.projectId, 'operating', actor, 'run done').catch(() => {})
    this._emit({ type: 'steward/run-finished', runId: run.id, projectId: run.projectId, status: 'done', version: run.version })
  }
}

function publishCategory(action) {
  const map = { 'npm-publish': 'npm-registry', 'mirror-verify': 'mirror', 'github-push': 'source-repo', 'github-release': 'source-repo', 'market-pr': 'plugin-market', 'itch-butler': 'game-store', 'docker-push': 'container-registry', 'web-deploy': 'web-deploy' }
  return map[action]
}
function extractChangelog(project, version) {
  try {
    const cl = readFileSync(join(project.rootPath, 'CHANGELOG.md'), 'utf8')
    const idx = cl.indexOf(version)
    if (idx >= 0) return cl.slice(idx, idx + 500).trim()
    return cl.slice(0, 500).trim() || `release ${version}`
  } catch { return `release ${version}` }
}
export function semverCompare(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0) }
  return 0
}
export function bumpPatch(v) {
  const p = String(v).split('.').map(n => parseInt(n, 10) || 0)
  while (p.length < 3) p.push(0)
  p[2] += 1
  return p.join('.')
}