/**
 * mcp-manager 设置卡片 —— 文案（zh / en 双语）。
 * 命名空间合并进 LocaleNamespaceMap，让 register/bind 获得类型化键。
 */

/** 本卡片文案键（字符串字面量联合）。 */
export type McpManagerLocaleKey =
  | 'nav' | 'cardDescription'
  | 'loading' | 'loadFailed' | 'none' | 'live' | 'off'
  | 'addTab' | 'addName' | 'addTransport' | 'addCommand' | 'addArgs' | 'addEnv' | 'addUrl' | 'addHeaders' | 'addCwd'
  | 'addBtn' | 'adding' | 'transportStdio' | 'transportHttp'
  | 'importTab' | 'importJsonPlaceholder' | 'importBtn' | 'importing' | 'importHint'
  | 'addOk' | 'importOk' | 'toggleOk'
  | 'opFailed' | 'toggleFailed' | 'addFailed' | 'importFailed' | 'emptyName' | 'emptyJson'
  | 'installedHeader' | 'installedHint' | 'managedHeader' | 'managedHint'
  | 'external' | 'toolCount' | 'notConnected'
  | 'patchToggleOn' | 'patchToggleOff' | 'uninstall' | 'uninstallConfirm' | 'cancel'
  | 'patchToggleOk' | 'patchRemoveOk' | 'patchFailed' | 'uninstallHint' | 'composed'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** mcp-manager MCP 管理卡片文案。 */
    'mcp-manager': McpManagerLocaleKey
  }
}

/** 中文文案。 */
export const zh: Record<McpManagerLocaleKey, string> = {
  nav: 'MCP 管理',
  cardDescription: '管理 MCP 服务器：新增、导入、开启/关闭（启用后动态装载 mcp__工具）',
  loading: '加载中…',
  loadFailed: '加载失败: ',
  none: '（无）',
  live: '生效中',
  off: '已关闭',
  addTab: '新增服务器',
  addName: '名称',
  addTransport: '传输',
  addCommand: '命令',
  addArgs: '参数(JSON)',
  addEnv: '环境变量(JSON)',
  addUrl: 'URL',
  addHeaders: '请求头(JSON)',
  addCwd: '工作目录',
  addBtn: '添加',
  adding: '添加中…',
  transportStdio: 'stdio',
  transportHttp: 'streamable-http',
  importTab: '导入服务器',
  importJsonPlaceholder: '粘贴 .mcp.json 的 servers 或单个服务器 JSON',
  importBtn: '导入',
  importing: '导入中…',
  importHint: '支持 .mcp.json 的 servers 表、单个服务器配置或 JSON 数组；已存在的名称跳过。',
  addOk: '已添加服务器 {name}',
  importOk: '导入完成：新增 {added} 个，跳过 {skipped} 个',
  toggleOk: '服务器 {name} 已{action}',
  opFailed: '操作失败: ',
  toggleFailed: '切换失败: ',
  addFailed: '添加失败: ',
  importFailed: '导入失败: ',
  emptyName: '服务器名称不能为空',
  emptyJson: '请粘贴 JSON',
  installedHeader: '已安装（DSH 组合）',
  installedHint: '来自 cordis.patch.yml 的 mcp-client 条目。开关会写回该文件并即时热重组，无需重启。',
  managedHeader: '插件托管（本页可开关）',
  managedHint: '由本插件注册表装配，开关即时热装载。',
  external: '外部',
  toolCount: '{count} 个工具',
  notConnected: '未连接',
  patchToggleOn: '启用',
  patchToggleOff: '关闭',
  uninstall: '卸载',
  uninstallConfirm: '确认卸载',
  cancel: '取消',
  patchToggleOk: '服务器 {name} 已{action}，正在热重组…',
  patchRemoveOk: '已从 profile 组合中卸载 {name}',
  patchFailed: '操作失败: ',
  uninstallHint: '卸载会从 cordis.patch.yml 删除该条目定义（自动备份原文件）。',
  composed: '组合层',
}

/** 英文文案。 */
export const en: Record<McpManagerLocaleKey, string> = {
  nav: 'MCP',
  cardDescription: 'Manage MCP servers: add, import, enable/disable (enabled ones are loaded live as mcp__ tools)',
  loading: 'Loading…',
  loadFailed: 'Load failed: ',
  none: '(none)',
  live: 'live',
  off: 'off',
  addTab: 'New server',
  addName: 'Name',
  addTransport: 'Transport',
  addCommand: 'Command',
  addArgs: 'Args (JSON)',
  addEnv: 'Env (JSON)',
  addUrl: 'URL',
  addHeaders: 'Headers (JSON)',
  addCwd: 'CWD',
  addBtn: 'Add',
  adding: 'Adding…',
  transportStdio: 'stdio',
  transportHttp: 'streamable-http',
  importTab: 'Import servers',
  importJsonPlaceholder: 'Paste .mcp.json servers or a single server JSON',
  importBtn: 'Import',
  importing: 'Importing…',
  importHint: 'Accepts .mcp.json servers map, a single server config, or a JSON array; existing names are skipped.',
  addOk: 'Server {name} added',
  importOk: 'Imported {added} added, {skipped} skipped',
  toggleOk: 'Server {name} turned {action}',
  opFailed: 'Operation failed: ',
  toggleFailed: 'Toggle failed: ',
  addFailed: 'Add failed: ',
  importFailed: 'Import failed: ',
  emptyName: 'Server name is required',
  emptyJson: 'Paste JSON to import',
  installedHeader: 'Installed (DSH composition)',
  installedHint: 'mcp-client entries from cordis.patch.yml. Toggles write back to that file and hot-recompose — no restart.',
  managedHeader: 'Plugin-managed (toggleable here)',
  managedHint: 'Assembled from this plugin registry; toggling hot-loads immediately.',
  external: 'external',
  toolCount: '{count} tools',
  notConnected: 'not connected',
  patchToggleOn: 'Enable',
  patchToggleOff: 'Disable',
  uninstall: 'Uninstall',
  uninstallConfirm: 'Confirm uninstall',
  cancel: 'Cancel',
  patchToggleOk: 'Server {name} turned {action}, recomposing…',
  patchRemoveOk: 'Uninstalled {name} from the profile composition',
  patchFailed: 'Operation failed: ',
  uninstallHint: 'Uninstall deletes the entry from cordis.patch.yml (the original file is backed up automatically).',
  composed: 'composition',
}
