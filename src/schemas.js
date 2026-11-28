// 项目管家 · 实体 zod schema 全集（05_数据字典 的唯一代码映射）
// tools / remote / inspect 三面共用本模块，防止契约漂移（UT-12）。
import { z } from 'zod'

// ---- 枚举 ----
export const ProjectType = z.enum(['business-system', 'game', 'dsh-plugin', 'web-app', 'engine', 'research', 'host'])
export const Stage = z.enum(['planning', 'developing', 'releasing', 'listed', 'operating', 'archived'])
export const ChannelStatus = z.enum(['candidate', 'active', 'paused', 'removed', 'pending', 'planned'])
export const ChannelCategory = z.enum([
  'wechat-mp', 'game-store', 'npm-registry', 'mirror', 'web-deploy', 'customer-delivery',
  'source-repo', 'plugin-market', 'local-install', 'short-video', 'publishing', 'artifact-dist',
  'model-community', 'package-registry', 'container-registry', 'content-platform', 'video-platform',
  'launch-pad', 'app-store', 'browser-store', 'editor-market', 'download-directory', 'paid-column',
  'package-manager', 'special-readonly', 'other',
])
export const StepKind = z.enum(['auto-check', 'cli', 'auto-publish', 'manual'])
export const RunStatus = z.enum(['running', 'blocked', 'done', 'cancelled'])
export const StepStatus = z.enum(['pending', 'running', 'passed', 'failed', 'skipped', 'waived'])
export const ListingStatus = z.enum(['draft', 'submitted', 'reviewing', 'listed', 'rejected', 'delisted'])
export const MetricSource = z.enum(['manual', 'collector'])
export const EventKind = z.enum(['incident', 'notice', 'complaint', 'milestone', 'comment', 'payment'])
export const Severity = z.enum(['info', 'warn', 'critical'])
export const ReminderKind = z.enum(['renewal', 'deadline', 'todo'])
export const ReminderStatus = z.enum(['active', 'fired', 'dismissed'])
export const Actor = z.enum(['user', 'agent', 'checker', 'system', 'collector'])
export const CollectStatus = z.enum(['running', 'ok', 'partial', 'failed'])
export const Verdict = z.enum(['worth-continuing', 'needs-differentiation', 'red-ocean-caution'])

const iso = z.string().min(1)
const id = (prefix) => z.string().regex(new RegExp(`^${prefix}-[a-z0-9]+(?:-[a-z0-9]+)*$`), `id 须为 ${prefix}-<段>[-<段>...]（小写字母数字连字符）`)

// ---- 内嵌结构 ----
export const MaterialItem = z.object({
  key: z.string(), label: z.string(),
  kind: z.enum(['file', 'text', 'url', 'bool']), required: z.boolean(),
})
export const MaterialState = z.object({
  key: z.string(), ok: z.boolean(), ref: z.string().optional(), checkedAt: iso.optional(),
})
export const CredentialRef = z.object({
  kind: z.enum(['file-key', 'gh-cli', 'skill-config', 'server-env']),
  location: z.string(), key: z.string(),
}).nullable()
export const Evidence = z.object({
  kind: z.enum(['check', 'command', 'manual']), summary: z.string(),
  exitCode: z.number().int().optional(), outputTail: z.string().max(4096).optional(),
  files: z.array(z.string()).optional(), command: z.string().optional(), at: iso,
})
export const StepDef = z.object({
  name: z.string(), kind: StepKind, checker: z.string().optional(), command: z.string().optional(),
  publishAction: z.string().optional(), cwd: z.enum(['project-root', 'steward']).optional(),
  guide: z.string().optional(), blocking: z.boolean().default(true), waivable: z.boolean().default(true),
})
export const RunStep = z.object({
  name: z.string(), kind: StepKind, status: StepStatus,
  evidence: Evidence.optional(), waiveReason: z.string().optional(),
  startedAt: iso.optional(), finishedAt: iso.optional(),
})
export const Artifact = z.object({ path: z.string(), size: z.number().optional(), sha256: z.string().optional() })
export const Transition = z.object({ from: ListingStatus, to: ListingStatus, at: iso, actor: Actor, note: z.string().optional() })

// ---- 实体 ----
export const Project = z.object({
  id: id('p'), name: z.string().min(1).max(80), rootPath: z.string().min(1),
  type: ProjectType, stage: Stage, owner: z.string().optional(), remote: z.string().optional(),
  tags: z.array(z.string()).default([]), notes: z.string().optional(), templateId: z.string().optional(),
  distribution: z.enum(['public', 'custom-private']).default('public'),
  createdAt: iso, updatedAt: iso, lastReleaseAt: iso.optional(),
})
export const Channel = z.object({
  id: id('ch'), name: z.string().min(1), category: ChannelCategory,
  status: ChannelStatus.default('candidate'), source: z.enum(['seed', 'user', 'catalog']).default('user'),
  grade: z.enum(['A', 'B', 'C', 'X']).optional(), activationCondition: z.string().optional(),
  materialTemplate: z.array(MaterialItem).default([]), credentialRef: CredentialRef.optional(),
  url: z.string().optional(), notes: z.string().optional(),
  readOnly: z.boolean().default(false), operationsPolicy: z.object({
    allowed: z.array(z.string()).default([]), forbidden: z.array(z.string()).default([]),
  }).optional(),
  appliesToTypes: z.array(ProjectType).default([]),
  activatedAt: iso.optional(), removedAt: iso.optional(), removeReason: z.string().optional(),
})
export const PipelineTemplate = z.object({
  id: id('tpl'), appliesTo: ProjectType, steps: z.array(StepDef).min(1),
})
export const ReleaseRun = z.object({
  id: id('run'), projectId: z.string(), version: z.string(), templateId: z.string(),
  status: RunStatus, steps: z.array(RunStep), startedAt: iso,
  finishedAt: iso.optional(), cancelReason: z.string().optional(),
})
export const Release = z.object({
  id: id('rel'), projectId: z.string(), runId: z.string(), version: z.string(),
  changelog: z.string().min(1), artifacts: z.array(Artifact).default([]), releasedAt: iso,
})
export const Listing = z.object({
  id: id('lst'), projectId: z.string(), channelId: z.string(), releaseId: z.string(),
  status: ListingStatus, materials: z.array(MaterialState).default([]),
  platformUrl: z.string().optional(), history: z.array(Transition).default([]),
  createdAt: iso, updatedAt: iso,
})
export const MetricSnapshot = z.object({
  id: id('m'), projectId: z.string(), channelId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), metrics: z.record(z.string(), z.number()),
  source: MetricSource, collectRunId: z.string().optional(), createdAt: iso,
})
export const OpsEvent = z.object({
  id: id('ev'), projectId: z.string(), listingId: z.string().optional(),
  kind: EventKind, severity: Severity, text: z.string(), at: iso,
})
export const Reminder = z.object({
  id: id('rm'), projectId: z.string(), kind: ReminderKind, dueAt: iso,
  leadDays: z.number().int().min(0).max(30).default(3), note: z.string(),
  scheduleId: z.string().optional(), status: ReminderStatus,
})
export const CollectRun = z.object({
  id: id('cr'), channelId: z.string(), listingIds: z.array(z.string()).default([]),
  startedAt: iso, finishedAt: iso.optional(), status: CollectStatus,
  metricsWritten: z.number().int().default(0), newComments: z.number().int().default(0),
  newPayments: z.number().int().default(0), error: z.string().optional(), staleMarked: z.boolean().default(false),
})
export const MarketCompetitor = z.object({
  id: id('mc'), projectId: z.string(), name: z.string(), url: z.string(),
  channelId: z.string().optional(), stars: z.number().optional(), downloads: z.number().optional(),
  price: z.string().optional(), lastUpdate: iso.optional(), features: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]), rating: z.number().min(0).max(5).optional(), fetchedAt: iso,
})
export const MarketReport = z.object({
  projectId: z.string(), competitors: z.array(MarketCompetitor).default([]),
  dimensions: z.record(z.string(), z.number()).default({}), verdict: Verdict,
  strengths: z.array(z.string()).default([]), weaknesses: z.array(z.string()).default([]),
  summary: z.string(), generatedAt: iso, source: z.enum(['auto', 'manual']).default('auto'),
  featureComparison: z.object({
    myFeatures: z.array(z.string()).default([]),
    rows: z.array(z.string()).default([]),
    matrix: z.array(z.object({ name: z.string(), isMine: z.boolean().default(false), caps: z.record(z.string(), z.boolean()).default({}), stars: z.number().nullable().optional(), downloads: z.number().nullable().optional(), url: z.string().optional() })).default([]),
    radar: z.object({ dimensions: z.array(z.string()).default([]), series: z.array(z.object({ name: z.string(), isMine: z.boolean().default(false), values: z.array(z.number()).default([]) })).default([]) }).optional(),
  }).optional(),
})
export const MarketGap = z.object({
  id: id('mg'), category: z.string(), channelIds: z.array(z.string()).default([]),
  supplyCount: z.number().int(), demandSignal: z.number(), gapScore: z.number(),
  opportunity: z.string(), examples: z.array(z.string()).default([]), fetchedAt: iso,
  niche: z.string().optional(), competition: z.number().optional(),
  demandBasis: z.string().optional(),
  evidence: z.array(z.object({ name: z.string(), stars: z.number().optional(), downloads: z.number().optional(), url: z.string().optional() })).default([]),
})
// FR8 个人网站维护（R40）：域名可配置，他人可替换
export const Website = z.object({
  id: id('web'), name: z.string().min(1), url: z.string().min(1), domain: z.string().min(1),
  owner: z.string().optional(), tags: z.array(z.string()).default([]),
  certWarnDays: z.number().int().default(30), status: z.enum(['active', 'removed']).default('active'),
  deploy: z.object({
    method: z.enum(['nextjs-json', 'static-html', 'manual']).default('manual'),
    sshHost: z.string().optional(), path: z.string().optional(),
    buildCmd: z.string().optional(), restartCmd: z.string().optional(),
  }).optional(),
  createdAt: iso, updatedAt: iso,
})
export const WebsiteStatus = z.object({
  id: id('ws'), websiteId: z.string(), at: iso,
  certValidTo: iso.optional(), certDaysLeft: z.number().optional(), certIssuer: z.string().optional(),
  httpStatus: z.number().optional(), responseMs: z.number().optional(),
  ok: z.boolean(), issues: z.array(z.string()).default([]),
})
export const JournalEntry = z.object({
  seq: z.number().int().min(1), at: iso, actor: Actor, entity: z.string(), entityId: z.string(),
  action: z.string(), before: z.record(z.string(), z.unknown()).optional(),
  after: z.record(z.string(), z.unknown()).optional(), reason: z.string().optional(),
})
export const Meta = z.object({
  schemaVersion: z.number().int().default(1), createdAt: iso, lastJournalSeq: z.number().int().default(0),
})

// ---- 集合文件 schema ----
export const collections = {
  projects: z.array(Project),
  channels: z.array(Channel),
  templates: z.array(PipelineTemplate),
  releases: z.array(Release),
  listings: z.array(Listing),
  metrics: z.array(MetricSnapshot),
  events: z.array(OpsEvent),
  reminders: z.array(Reminder),
  'collect-runs': z.array(CollectRun),
  'market-gaps': z.array(MarketGap),
  websites: z.array(Website),
  'website-status': z.array(WebsiteStatus),
}

// ---- 工具入参 schema（三面共用）----
export const inputs = {
  registerProject: z.object({
    name: z.string().min(1).max(80), rootPath: z.string().min(1), type: ProjectType,
    tags: z.array(z.string()).optional(), notes: z.string().optional(), remote: z.string().optional(),
  }),
  releaseStart: z.object({ projectId: z.string(), version: z.string().optional(), templateId: z.string().optional() }),
  releaseStep: z.object({ runId: z.string(), stepName: z.string(), confirm: z.boolean().optional() }),
  releaseManual: z.object({ runId: z.string(), stepName: z.string(), result: z.enum(['passed', 'failed']), note: z.string() }),
  releaseWaive: z.object({ runId: z.string(), stepName: z.string(), reason: z.string().min(1) }),
  releaseCancel: z.object({ runId: z.string(), reason: z.string().min(1) }),
  listingCreate: z.object({ projectId: z.string(), channelId: z.string(), releaseId: z.string() }),
  listingUpdate: z.object({ listingId: z.string(), to: ListingStatus, note: z.string().optional(), platformUrl: z.string().optional() }),
  channelAdd: z.object({ name: z.string().min(1), category: ChannelCategory, materialTemplate: z.array(MaterialItem).optional(), credentialRef: CredentialRef.optional(), url: z.string().optional() }),
  channelUpdate: z.object({ channelId: z.string(), patch: z.record(z.string(), z.unknown()) }),
  channelRemove: z.object({ channelId: z.string(), reason: z.string().min(1) }),
  channelImport: z.object({ candidateIds: z.array(z.string()).min(1) }),
  metricAdd: z.object({ projectId: z.string(), channelId: z.string().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), metrics: z.record(z.string(), z.number()), overwrite: z.boolean().optional() }),
  eventAdd: z.object({ projectId: z.string(), kind: EventKind, severity: Severity, text: z.string(), listingId: z.string().optional() }),
  reminderAdd: z.object({ projectId: z.string(), kind: ReminderKind, dueAt: iso, leadDays: z.number().int().min(0).max(30).optional(), note: z.string() }),
  reminderBind: z.object({ reminderId: z.string(), scheduleId: z.string() }),
  marketScan: z.object({ projectId: z.string().optional() }),
  marketCompare: z.object({ projectId: z.string() }),
  marketGaps: z.object({ channelIds: z.array(z.string()).optional() }),
}

// ---- 状态转移表（03§7，代码与文档同源）----
export const stageTransitions = {
  planning: ['developing'],
  developing: ['releasing', 'archived'],
  releasing: ['listed', 'operating', 'developing'],
  listed: ['operating', 'archived'],
  operating: ['releasing', 'archived'],
  archived: ['developing', 'operating'],
}
export const listingTransitions = {
  draft: ['submitted'],
  submitted: ['reviewing', 'listed', 'rejected'],
  reviewing: ['listed', 'rejected'],
  rejected: ['submitted'],
  listed: ['delisted'],
  delisted: ['submitted'],
}
export const channelTransitions = {
  candidate: ['active', 'removed'],
  active: ['paused', 'removed'],
  paused: ['active', 'removed'],
  removed: ['candidate'],
  pending: ['active', 'removed'],
  planned: ['active', 'removed'],
}

export const SCHEMA_VERSION = 1