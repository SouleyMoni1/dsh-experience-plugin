/**
 * model-reasoning 设置页 —— 文案（zh / en 双语）。
 * 命名空间合并进 LocaleNamespaceMap，让 register/bind 获得类型化键。
 * 注意：LocaleNamespaceMap 的值域是字符串字面量联合（不是 interface）。
 */

/** 本设置页的文案键（字符串字面量联合）。 */
export type ModelReasoningLocaleKey =
  | 'nav' | 'title' | 'intro' | 'readOnly' | 'loadError' | 'empty'
  | 'noModels' | 'provider' | 'api' | 'model' | 'efforts' | 'wire'
  | 'offHint' | 'save' | 'saving' | 'saved' | 'saveError' | 'cancel'
  | 'levelOff' | 'levelMinimal' | 'levelLow' | 'levelMedium' | 'levelHigh'
  | 'levelXhigh' | 'levelMax'
  | 'familiesTitle' | 'familiesIntro' | 'defaultEfforts' | 'defaultEffortsHint'
  | 'family' | 'familyName' | 'familyPattern' | 'familyPatternPlaceholder'
  | 'addFamily' | 'deleteFamily' | 'expand' | 'collapse' | 'refreshFamily' | 'refreshProvider' | 'modelsTitle'
  | 'modelsIntro' | 'matchedFamily' | 'unmatched'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** model-reasoning 设置页文案。 */
    'model-reasoning': ModelReasoningLocaleKey
  }
}

/** 中文文案。 */
export const zh: Record<ModelReasoningLocaleKey, string> = {
  nav: '模型思考等级',
  title: '模型思考等级',
  intro: '为每个模型配置可选的思考等级（写入 settings.yaml 的 reasoningEfforts）。勾选即开放该等级，发送值是该等级发给网关的 wire 参数；未勾选的等级不会出现在模型选择器里。',
  readOnly: '当前设置只读，无法保存。',
  loadError: '加载失败：{message}',
  empty: 'llm-pi-ai 下还没有可配置的模型。',
  noModels: '该 Provider 没有模型。',
  provider: 'Provider',
  api: '协议',
  model: '模型',
  efforts: '思考等级',
  wire: '发送值',
  offHint: 'off = 支持但不发送思考参数',
  save: '保存全部',
  saving: '保存中…',
  saved: '已保存',
  saveError: '保存失败：{message}',
  cancel: '取消',
  levelOff: 'Off',
  levelMinimal: 'Minimal',
  levelLow: 'Low',
  levelMedium: 'Medium',
  levelHigh: 'High',
  levelXhigh: 'XHigh',
  levelMax: 'Max',
  familiesTitle: '系列配置',
  familiesIntro: '按模型 id 关键词匹配系列：新建模型时未声明思考等级的模型会自动按命中的系列配置等级；未命中任何系列时使用默认配置。保存后立即生效。',
  defaultEfforts: '默认配置（兜底）',
  defaultEffortsHint: '关键词未命中任何系列时使用的等级',
  family: '系列',
  familyName: '名称',
  familyPattern: '关键词（正则）',
  familyPatternPlaceholder: '如 ^gpt-5\.6',
  addFamily: '添加系列',
  deleteFamily: '删除系列',
  refreshFamily: '按系列刷新',
  refreshProvider: '一键刷新',
  expand: '展开',
  collapse: '收起',
  modelsTitle: '模型等级',
  modelsIntro: '每个模型可单独覆盖系列配置；已勾选的等级会写入该模型。',
  matchedFamily: '系列',
  unmatched: '未匹配系列（用默认配置）',
}

/** 英文文案。 */
export const en: Record<ModelReasoningLocaleKey, string> = {
  nav: 'Model Reasoning',
  title: 'Model Reasoning Levels',
  intro: 'Choose which reasoning levels each model offers (writes reasoningEfforts into settings.yaml). Check a level to enable it; the wire value is the parameter sent to the gateway. Unchecked levels stay hidden in the model picker.',
  readOnly: 'Settings are read-only; saving is disabled.',
  loadError: 'Load failed: {message}',
  empty: 'No configurable models under llm-pi-ai yet.',
  noModels: 'This provider has no models.',
  provider: 'Provider',
  api: 'Protocol',
  model: 'Model',
  efforts: 'Reasoning levels',
  wire: 'Wire value',
  offHint: 'off = supported without sending any thinking parameter',
  save: 'Save all',
  saving: 'Saving…',
  saved: 'Saved',
  saveError: 'Save failed: {message}',
  cancel: 'Cancel',
  levelOff: 'Off',
  levelMinimal: 'Minimal',
  levelLow: 'Low',
  levelMedium: 'Medium',
  levelHigh: 'High',
  levelXhigh: 'XHigh',
  levelMax: 'Max',
  familiesTitle: 'Family presets',
  familiesIntro: 'Families match model ids by keyword: when a new model appears without reasoning levels declared, it inherits its matched family; unmatched models use the default config. Saved settings apply immediately.',
  defaultEfforts: 'Default config (fallback)',
  defaultEffortsHint: 'Levels used when no family matches',
  family: 'Family',
  familyName: 'Name',
  familyPattern: 'Keyword (regex)',
  familyPatternPlaceholder: 'e.g. ^gpt-5\.6',
  addFamily: 'Add family',
  deleteFamily: 'Delete family',
  refreshFamily: 'Refresh from family',
  refreshProvider: 'Refresh all',
  expand: 'Expand',
  collapse: 'Collapse',
  modelsTitle: 'Model levels',
  modelsIntro: 'Each model can override its family; checked levels are written to the model.',
  matchedFamily: 'Family',
  unmatched: 'No family matched (uses default)',
}