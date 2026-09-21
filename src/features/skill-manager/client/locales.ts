/**
 * skill-manager 设置卡片 —— 文案（zh / en 双语）。
 * 命名空间合并进 LocaleNamespaceMap，让 register/bind 获得类型化键。
 */

/** 本卡片文案键（字符串字面量联合）。 */
export type SkillManagerLocaleKey =
  | 'nav' | 'cardDescription'
  | 'loading' | 'loadFailed' | 'none'
  | 'enabledHeader' | 'disabledHeader'
  | 'bundle' | 'flat' | 'enabled' | 'disabled' | 'live'
  | 'addTab' | 'addName' | 'addDesc' | 'addDescPlaceholder' | 'addBtn' | 'adding'
  | 'importTab' | 'importSourceLocal' | 'importSourceSkillhub' | 'importPathPlaceholder' | 'importSlugPlaceholder' | 'importBtn' | 'importing'
  | 'addOk' | 'importOk' | 'toggleOk'
  | 'opFailed' | 'toggleFailed' | 'addFailed' | 'importFailed' | 'emptyName' | 'emptyPath'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** skill-manager 技能管理卡片文案。 */
    'skill-manager': SkillManagerLocaleKey
  }
}

/** 中文文案。 */
export const zh: Record<SkillManagerLocaleKey, string> = {
  nav: '技能管理',
  cardDescription: '管理 ~/.dsh/skills 下的技能：新增、导入、开启/关闭',
  loading: '加载中…',
  loadFailed: '加载失败: ',
  none: '（无）',
  enabledHeader: '已启用',
  disabledHeader: '已关闭',
  bundle: '目录',
  flat: '平铺',
  enabled: '启用',
  disabled: '关闭',
  live: '生效中',
  addTab: '新增技能',
  addName: '技能名',
  addDesc: '描述',
  addDescPlaceholder: '一句话说明这个技能什么时候使用',
  addBtn: '创建',
  adding: '创建中…',
  importTab: '导入技能',
  importSourceLocal: '本地目录',
  importSourceSkillhub: 'SkillHub',
  importPathPlaceholder: '本地技能目录的绝对路径',
  importSlugPlaceholder: 'SkillHub slug（如 dsh-plugin-scaffold）',
  importBtn: '导入',
  importing: '导入中…',
  addOk: '已创建技能 {name}',
  importOk: '已导入技能 {name}',
  toggleOk: '已{action}技能 {name}',
  opFailed: '操作失败: ',
  toggleFailed: '切换失败: ',
  addFailed: '创建失败: ',
  importFailed: '导入失败: ',
  emptyName: '技能名不能为空',
  emptyPath: '路径或 slug 不能为空',
}

/** 英文文案。 */
export const en: Record<SkillManagerLocaleKey, string> = {
  nav: 'Skills',
  cardDescription: 'Manage skills under ~/.dsh/skills: add, import, enable/disable',
  loading: 'Loading…',
  loadFailed: 'Load failed: ',
  none: '(none)',
  enabledHeader: 'Enabled',
  disabledHeader: 'Disabled',
  bundle: 'bundle',
  flat: 'flat',
  enabled: 'on',
  disabled: 'off',
  live: 'live',
  addTab: 'New skill',
  addName: 'Name',
  addDesc: 'Description',
  addDescPlaceholder: 'One line on when to use this skill',
  addBtn: 'Create',
  adding: 'Creating…',
  importTab: 'Import skill',
  importSourceLocal: 'Local folder',
  importSourceSkillhub: 'SkillHub',
  importPathPlaceholder: 'Absolute path to a skill folder',
  importSlugPlaceholder: 'SkillHub slug (e.g. dsh-plugin-scaffold)',
  importBtn: 'Import',
  importing: 'Importing…',
  addOk: 'Skill {name} created',
  importOk: 'Skill {name} imported',
  toggleOk: 'Skill {name} turned {action}',
  opFailed: 'Operation failed: ',
  toggleFailed: 'Toggle failed: ',
  addFailed: 'Create failed: ',
  importFailed: 'Import failed: ',
  emptyName: 'Skill name is required',
  emptyPath: 'Path or slug is required',
}
