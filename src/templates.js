// M3 · 6 类内置流水线模板（03§3.1）。auto-publish 默认 dry-run（安全）。
const s = (name, kind, extra = {}) => ({ name, kind, blocking: true, waivable: true, ...extra })

export const builtinTemplates = [
  {
    id: 'tpl-dsh-plugin', appliesTo: 'dsh-plugin', steps: [
      s('git-clean', 'auto-check', { checker: 'git-clean' }),
      s('version-consistency', 'auto-check', { checker: 'version-consistency' }),
      s('build', 'cli', { command: 'npm run build --if-present' }),
      s('test', 'cli', { command: 'npm test' }),
      s('changelog-nonempty', 'auto-check', { checker: 'changelog-nonempty' }),
      s('readme-exists', 'auto-check', { checker: 'readme-exists' }),
      s('secrets-check', 'auto-check', { checker: 'config-secrets-check' }),
      s('npm-publish', 'auto-publish', { publishAction: 'npm-publish' }),
      s('mirror-verify', 'auto-publish', { publishAction: 'mirror-verify' }),
      s('github-push', 'auto-publish', { publishAction: 'github-push' }),
      s('market-pr', 'auto-publish', { publishAction: 'market-pr' }),
    ],
  },
  {
    id: 'tpl-game-godot', appliesTo: 'game', steps: [
      s('git-clean', 'auto-check', { checker: 'git-clean' }),
      s('export-presets-exist', 'auto-check', { checker: 'export-presets-exist' }),
      s('headless-export', 'cli', { command: 'godot --headless --export-release "Windows Desktop"' }),
      s('artifact-exists', 'auto-check', { checker: 'artifact-exists' }),
      s('version-consistency', 'auto-check', { checker: 'version-consistency' }),
      s('itch-upload', 'auto-publish', { publishAction: 'itch-butler' }),
    ],
  },
  {
    id: 'tpl-business-system', appliesTo: 'business-system', steps: [
      s('git-clean', 'auto-check', { checker: 'git-clean' }),
      s('test', 'cli', { command: 'npm test' }),
      s('secrets-check', 'auto-check', { checker: 'config-secrets-check' }),
      s('build', 'cli', { command: 'npm run build --if-present' }),
      s('deploy-readonly-guard', 'manual', { guide: '受保护生产实例（阿里云）只读：部署须人工另行执行，管家不触碰。' }),
    ],
  },
  {
    id: 'tpl-web-app', appliesTo: 'web-app', steps: [
      s('git-clean', 'auto-check', { checker: 'git-clean' }),
      s('build', 'cli', { command: 'npm run build' }),
      s('test', 'cli', { command: 'npm test' }),
      s('deploy', 'auto-publish', { publishAction: 'web-deploy' }),
    ],
  },
  {
    id: 'tpl-engine-research', appliesTo: 'engine', steps: [
      s('git-clean', 'auto-check', { checker: 'git-clean' }),
      s('build', 'cli', { command: 'npm run build --if-present' }),
      s('test', 'cli', { command: 'npm test --if-present' }),
      s('artifact-exists', 'auto-check', { checker: 'artifact-exists' }),
      s('github-release', 'auto-publish', { publishAction: 'github-release' }),
    ],
  },
  {
    id: 'tpl-host', appliesTo: 'host', steps: [
      s('version-report', 'auto-check', { checker: 'version-consistency' }),
      s('upgrade-audit-ref', 'manual', { guide: '宿主自身只读：升级走 dsh-upgrade-audit / plugin-fleet-sweep skill，管家不执行。', blocking: false }),
    ],
  },
]
// research 复用 engine 模板
builtinTemplates.push({ ...builtinTemplates.find(t => t.id === 'tpl-engine-research'), id: 'tpl-research', appliesTo: 'research' })

export function templateFor(type, overrides = []) {
  return overrides.find(t => t.appliesTo === type) || builtinTemplates.find(t => t.appliesTo === type)
}