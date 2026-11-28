// M14 · 功能逐项对比 + 多维雷达图数据（R32）。按本项目功能逐项对比竞品。
const defaultFetch = (...a) => globalThis.fetch(...a)

// 能力关键词字典（中英），用于从 README/描述识别功能
export const CAPS = {
  '看板/任务管理': ['看板', '任务', 'task', 'board', 'kanban', 'todo'],
  '进度/ETA': ['进度', 'eta', 'progress', '燃尽', 'burndown', '百分比'],
  '依赖图/DAG': ['依赖', 'dag', '关键路径', 'critical path', 'dependency'],
  '代码下钻/diff': ['代码', 'code', 'diff', '编辑卡', '下钻'],
  '导游/解说': ['导游', 'guide', '解说', '因果'],
  '语音交互': ['语音', 'voice', 'speech', '播报', 'tts'],
  '实时刷新': ['实时', 'real-time', 'realtime', '即时', 'live'],
  '蓝图/结构化': ['蓝图', 'blueprint', '结构化', '分解'],
  '甘特图': ['甘特', 'gantt'],
  '数据可视化': ['可视化', 'chart', '图表', 'svg', '可视化'],
  '人工确认闸门': ['确认', '闸门', '审批', 'confirm', '证据'],
  '重启恢复': ['重启', '恢复', 'fork', '重放', 'replay'],
}

export function detectCaps(text) {
  const t = (text || '').toLowerCase()
  const present = {}
  for (const [cap, kws] of Object.entries(CAPS)) {
    present[cap] = kws.some(k => t.includes(k.toLowerCase()))
  }
  return present
}

// 提取本项目 README 的功能特性 bullet 标题（按我的功能逐项对比）
export function extractMyFeatures(readme) {
  const feats = []
  const sec = (readme || '').split(/##\s*功能特性|##\s*Features/i)[1]
  if (sec) {
    const body = sec.split(/\n##\s/)[0]
    for (const line of body.split('\n')) {
      const m = line.match(/^[-*]\s*\*\*(.+?)\*\*/) || line.match(/^[-*]\s*(.+?)[:：]/)
      if (m) feats.push(m[1].trim())
    }
  }
  return feats
}

async function fetchCompetitorText(c, f) {
  try {
    // npm 包（name 不含 / 或含 scope）→ registry readme
    if (!c.url?.includes('github.com') && c.name) {
      const r = await f(`https://registry.npmjs.org/${encodeURIComponent(c.name)}`)
      const j = await r.json()
      if (j.readme) return j.readme
    }
    // GitHub repo → raw README
    const gh = c.url?.match(/github\.com\/([^/]+\/[^/]+)/)
    if (gh) {
      for (const br of ['main', 'master']) {
        const r = await f(`https://raw.githubusercontent.com/${gh[1]}/${br}/README.md`)
        if (r.ok) return await r.text()
      }
    }
  } catch {}
  return c._description || ''
}

const recencyScore = iso => { if (!iso) return 0.3; const days = (Date.now() - Date.parse(iso)) / 86400000; return Math.max(0.1, Math.min(1, 1 - days / 180)) }

// 构建功能逐项对比矩阵 + 雷达图数据
export async function buildComparison(project, myReadme, competitors, opts = {}) {
  const f = opts.fetch || defaultFetch
  const top = competitors.slice(0, opts.limit || 5)
  const myCaps = detectCaps(myReadme + ' ' + (project.notes || '') + ' ' + (project.tags || []).join(' '))
  const myFeatures = extractMyFeatures(myReadme)
  // 对比维度：本项目拥有的能力 + 竞品额外能力（取并集，但优先我的功能）
  const myCapNames = Object.keys(myCaps).filter(k => myCaps[k])
  const compTexts = []
  for (const c of top) compTexts.push({ c, text: await fetchCompetitorText(c, f) })
  const compCaps = compTexts.map(({ c, text }) => ({ c, caps: detectCaps(text + ' ' + (c.tags || []).join(' ')), textLen: (text || '').length }))
  // 矩阵行：我的功能能力（逐项）+ 竞品独有高频能力
  const allCapNames = Object.keys(CAPS)
  const rows = myCapNames.length ? myCapNames : allCapNames.filter(k => myCaps[k])
  const matrix = [
    { name: project.name + '（我的）', isMine: true, caps: myCaps, stars: null, downloads: null },
    ...compCaps.map(({ c, caps }) => ({ name: c.name, isMine: false, caps, stars: c.stars, downloads: c.downloads, url: c.url })),
  ]
  // 雷达维度（0–1）：功能广度/热度/活跃度/文档质量/差异化
  const maxStars = Math.max(1, ...compCaps.map(x => x.c.stars || 0))
  const maxDl = Math.max(1, ...compCaps.map(x => x.c.downloads || 0))
  const myCapCount = myCapNames.length
  const radarDimensions = ['功能广度', '热度', '活跃度', '文档质量', '差异化']
  const series = []
  // 我的系列
  const myUnique = myCapNames.filter(k => !compCaps.some(x => x.caps[k])).length
  series.push({
    name: project.name, isMine: true,
    values: [
      round(myCapCount / allCapNames.length),
      0.5, // 我的热度需 metrics，下方 analyze 注入
      recencyScore(project.lastReleaseAt),
      round(Math.min(1, (myReadme || '').length / 2000)),
      round(myCapCount ? myUnique / myCapCount : 0.5),
    ],
  })
  for (const { c, caps, textLen } of compCaps) {
    const capCount = Object.keys(caps).filter(k => caps[k]).length
    const unique = Object.keys(caps).filter(k => caps[k] && !myCaps[k]).length
    series.push({
      name: c.name, isMine: false,
      values: [
        round(capCount / allCapNames.length),
        round(Math.min(1, (c.stars || 0) / maxStars)),
        recencyScore(c.lastUpdate),
        round(Math.min(1, textLen / 2000)),
        round(capCount ? unique / capCount : 0),
      ],
    })
  }
  return { myFeatures, rows, matrix, radar: { dimensions: radarDimensions, series } }
}

const round = n => Math.round(n * 100) / 100