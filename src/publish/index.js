// M3 · auto-publish 对外发布执行链（07）。默认 dry-run（安全）；真实执行需显式 enable + 凭据。
// 每动作返回 Evidence；结果可驱动 listing 迁移（hook）。
import { spawnSync } from 'node:child_process'

const now = () => new Date().toISOString()
const ev = (summary, extra = {}) => ({ kind: 'command', summary, at: now(), ...extra })

function runCmd(cmd, args, cwd) {
  try {
    const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 120000, shell: false })
    const out = ((r.stdout || '') + (r.stderr || '')).slice(-4096)
    return { code: r.status ?? 1, out }
  } catch (e) { return { code: 1, out: String(e.message || e) } }
}

export const publishActions = {
  'npm-publish': { channelCategory: 'npm-registry', label: 'npm 发布' },
  'mirror-verify': { channelCategory: 'mirror', label: '镜像同步核验' },
  'github-push': { channelCategory: 'source-repo', label: 'GitHub 推送' },
  'github-release': { channelCategory: 'source-repo', label: 'GitHub Release' },
  'market-pr': { channelCategory: 'plugin-market', label: '市场 PR 提交/更新' },
  'itch-butler': { channelCategory: 'game-store', label: 'itch butler 上传' },
  'docker-push': { channelCategory: 'container-registry', label: 'Docker 推送' },
  'web-deploy': { channelCategory: 'web-deploy', label: 'Web 部署' },
}

// opts: { dryRun=true, credentials?, io? }
export function executePublish(action, { project, run, channel, dryRun = true, credentials } = {}) {
  const meta = publishActions[action]
  if (!meta) return ev(`未知发布动作 ${action}`, { exitCode: 1 })
  // 受保护实例守卫
  if (channel?.readOnly) {
    const e = ev(`受保护实例只读，拒绝发布动作 ${action}`, { exitCode: 1 })
    e.code = 'ILLEGAL_ON_PROTECTED'
    return e
  }
  if (dryRun) {
    return ev(`[dry-run] ${meta.label}：${project.name}@${run.version}（未真实执行）`, { exitCode: 0, command: `${action} ${project.name}@${run.version}`, dryRun: true })
  }
  // 真实执行（v1 仅 npm-publish / github-push 落地，其余需后续凭据接入）
  const root = project.rootPath
  if (action === 'npm-publish') {
    const r = runCmd('npm', ['publish', '--registry=https://registry.npmjs.org', '--access=public'], root)
    return ev(`npm publish ${r.code === 0 ? '成功' : '失败'}`, { exitCode: r.code, outputTail: r.out, command: 'npm publish --registry=https://registry.npmjs.org' })
  }
  if (action === 'github-push') {
    const r = runCmd('git', ['push'], root)
    return ev(`git push ${r.code === 0 ? '成功' : '失败'}`, { exitCode: r.code, outputTail: r.out, command: 'git push' })
  }
  return ev(`${meta.label}：真实执行待凭据接入（当前 dry-run 替代）`, { exitCode: 0, dryRun: true })
}