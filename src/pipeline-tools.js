// M3 · release_* Agent 工具（06§2）。集成时由 lead 并入 buildTools。
import { inputs } from './schemas.js'

const ok = data => ({ ok: true, data })
const fail = e => ({ ok: false, error: { code: e.code || 'ERROR', message: String(e.message || e) } })
const guard = (schema, args, fn) => {
  const p = schema.safeParse(args || {})
  if (!p.success) return fail({ code: 'INVALID_INPUT', message: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') })
  return Promise.resolve(fn(p.data)).then(ok, fail)
}
const need = service => { if (!service.pipeline) throw { code: 'NOT_READY', message: 'pipeline 未挂载' }; return service.pipeline }

export function buildPipelineTools(service) {
  return [
    {
      name: 'steward_release_start',
      description: '发起全自动发布 run（版本缺省自动 bump patch）。',
      parameters: { type: 'object', properties: { projectId: { type: 'string' }, version: { type: 'string' }, templateId: { type: 'string' } }, required: ['projectId'], additionalProperties: false },
      execute: async args => guard(inputs.releaseStart, args, d => need(service).startRun(d, 'agent')),
    },
    {
      name: 'steward_release_step',
      description: '执行 run 的某步骤（全自动默认放行；谨慎模式需 confirm）。',
      parameters: { type: 'object', properties: { runId: { type: 'string' }, stepName: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['runId', 'stepName'], additionalProperties: false },
      execute: async args => guard(inputs.releaseStep, args, d => need(service).executeStep(d.runId, d.stepName, { confirm: d.confirm }, 'agent')),
    },
    {
      name: 'steward_release_manual',
      description: '回填 manual 步骤结果（passed/failed + note）。',
      parameters: { type: 'object', properties: { runId: { type: 'string' }, stepName: { type: 'string' }, result: { type: 'string', enum: ['passed', 'failed'] }, note: { type: 'string' } }, required: ['runId', 'stepName', 'result', 'note'], additionalProperties: false },
      execute: async args => guard(inputs.releaseManual, args, d => need(service).completeManualStep(d.runId, d.stepName, d.result, d.note, 'agent')),
    },
    {
      name: 'steward_release_waive',
      description: '豁免某失败步骤（G4，必填 reason）。',
      parameters: { type: 'object', properties: { runId: { type: 'string' }, stepName: { type: 'string' }, reason: { type: 'string' } }, required: ['runId', 'stepName', 'reason'], additionalProperties: false },
      execute: async args => guard(inputs.releaseWaive, args, d => need(service).waiveStep(d.runId, d.stepName, d.reason, 'agent')),
    },
    {
      name: 'steward_release_cancel',
      description: '取消 run（必填 reason，项目阶段回退 developing）。',
      parameters: { type: 'object', properties: { runId: { type: 'string' }, reason: { type: 'string' } }, required: ['runId', 'reason'], additionalProperties: false },
      execute: async args => guard(inputs.releaseCancel, args, d => need(service).cancelRun(d.runId, d.reason, 'agent')),
    },
  ]
}