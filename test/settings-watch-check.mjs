/** 设置变更通知：模型 / 推理深度 / 权限 / 会话名四条怎么翻译；发不出、认不出、自动标题这些都不发。 */

import { cardText, createCheck, createLogger, createPush, installSettings, libUrl, tick } from './harness.mjs';

const {
  MODEL_SELECTION_EVENT,
  PERMISSION_PRESET_EVENT,
  SESSION_TITLE_EVENT,
  createSettingsWatch,
} = await import(libUrl('handler/host/settings-watch.js'));
const {
  SETTINGS_CHANGED_EFFORT,
  SETTINGS_CHANGED_MODEL,
  SETTINGS_CHANGED_MODEL_TITLE,
  SETTINGS_CHANGED_PERMISSION,
  SETTINGS_CHANGED_PERMISSION_TITLE,
  SETTINGS_CHANGED_SESSION_NAME,
  SETTINGS_CHANGED_SESSION_NAME_TITLE,
  UNKNOWN_LABEL_TEXT,
} = await import(libUrl('common/copy.js'));

const check = createCheck();
const { logger, lines } = createLogger();
const { push, sent } = createPush();
const settings = await installSettings({ sessionId: 's1', userId: 'u1' });

/** 一个服务商、一个模型；这个模型带一档推理深度。 */
const groups = [{
  id: 'deepseek',
  models: [{ id: 'chat', name: 'chat', reasoning: { efforts: [{ id: 'high', name: '高' }] } }],
}];
let catalogFails = false;
const watch = createSettingsWatch({
  logger,
  push,
  models: {
    catalog: async () => {
      if (catalogFails) throw new Error('目录读不到');
      return { groups };
    },
  },
  permissions: { displayNameOf: (name) => `预设:${name}` },
});

/**
 * 发一条事件，等后台那张卡发出来。
 *
 * @param tag 事件 tag
 * @param eventSettings 事件带来的值
 * @returns 最后发出去的那张卡；一条都没发时 undefined
 */
const send = async (tag, eventSettings) => {
  sent.length = 0;
  watch.onSession({ tag, settings: eventSettings });
  await tick();
  return sent[sent.length - 1];
};

// ---------------------------------------------------------------- 四条通知

const model = await send(MODEL_SELECTION_EVENT, { provider: 'deepseek', model: 'chat', reasoningEffort: 'high' });
check.eq('模型改了：发给绑定的人', model.target, { openId: 'u1' });
check.ok('模型改了：是带标题栏的卡', model.card.header?.template === 'blue');
check.ok('模型改了：标题是「模型已修改」', cardText(model.card).includes(SETTINGS_CHANGED_MODEL_TITLE));
check.ok('模型改了：正文写模型名', cardText(model.card).includes(SETTINGS_CHANGED_MODEL('chat')));
check.ok('模型改了：带档位就多写一行', cardText(model.card).includes(SETTINGS_CHANGED_EFFORT('高')));

const noEffort = await send(MODEL_SELECTION_EVENT, { provider: 'deepseek', model: 'chat' });
check.ok('没带档位：不写档位那一行', !cardText(noEffort.card).includes('推理深度改成'));

const ghostModel = await send(MODEL_SELECTION_EVENT, { provider: 'deepseek', model: 'ghost' });
check.ok('目录里没有这个模型：用事件里带的 id', cardText(ghostModel.card).includes(SETTINGS_CHANGED_MODEL('ghost')));

const ghostEffort = await send(MODEL_SELECTION_EVENT, { provider: 'deepseek', model: 'chat', reasoningEffort: 'ghost' });
check.ok('这个模型没有这一档：用事件里带的档位 id', cardText(ghostEffort.card).includes(SETTINGS_CHANGED_EFFORT('ghost')));

const bare = await send(MODEL_SELECTION_EVENT, {});
check.ok('事件里连模型都没带：写「(未知)」', cardText(bare.card).includes(SETTINGS_CHANGED_MODEL(UNKNOWN_LABEL_TEXT)));

const mapped = await send(PERMISSION_PRESET_EVENT, { preset: 'workspace-write' });
check.ok('权限改了：标题是「权限已修改」', cardText(mapped.card).includes(SETTINGS_CHANGED_PERMISSION_TITLE));
check.ok('权限改了：用映射里的中文名', cardText(mapped.card).includes(SETTINGS_CHANGED_PERMISSION('工作区内修改')));

const unmapped = await send(PERMISSION_PRESET_EVENT, { preset: 'mystery' });
check.ok('映射里没有这个预设：用宿主给的名字', cardText(unmapped.card).includes(SETTINGS_CHANGED_PERMISSION('预设:mystery')));

const noPreset = await send(PERMISSION_PRESET_EVENT, {});
check.ok('事件里没带预设：写「(未知)」', cardText(noPreset.card).includes(SETTINGS_CHANGED_PERMISSION(UNKNOWN_LABEL_TEXT)));

const renamed = await send(SESSION_TITLE_EVENT, { title: '新名字', messageSeqs: [], source: { kind: 'user' } });
check.ok('人手动改名：标题是「会话名已修改」', cardText(renamed.card).includes(SETTINGS_CHANGED_SESSION_NAME_TITLE));
check.ok('人手动改名：正文写新名字', cardText(renamed.card).includes(SETTINGS_CHANGED_SESSION_NAME('新名字')));

const renamedNoTitle = await send(SESSION_TITLE_EVENT, { source: { kind: 'user' } });
check.ok('事件里没带标题：写「(未知)」', cardText(renamedNoTitle.card).includes(SETTINGS_CHANGED_SESSION_NAME(UNKNOWN_LABEL_TEXT)));

// ---------------------------------------------------------------- 不发的情形

check.eq('模型自动起的标题：不发', await send(SESSION_TITLE_EVENT, { title: '新名字', source: { kind: 'provider' } }), undefined);
check.eq('兜底标题：也不发', await send(SESSION_TITLE_EVENT, { title: '新名字', source: { kind: 'fallback' } }), undefined);
check.eq('标题事件里没有 source：不发', await send(SESSION_TITLE_EVENT, { title: '新名字' }), undefined);
check.eq('不盯的事件：不发', await send('turn/end', { reason: { kind: 'done' } }), undefined);

settings.set({ sessionId: '' });
check.eq('没绑当前会话：不发', await send(MODEL_SELECTION_EVENT, { provider: 'deepseek', model: 'chat' }), undefined);
settings.set({ sessionId: 's1', userId: '' });
check.eq('没绑人：不发', await send(MODEL_SELECTION_EVENT, { provider: 'deepseek', model: 'chat' }), undefined);
settings.set({ userId: 'u1' });

catalogFails = true;
check.eq('目录读不到：不发', await send(MODEL_SELECTION_EVENT, { provider: 'deepseek', model: 'chat' }), undefined);
check.ok('目录读不到：留下 warn 日志', lines.warn.some((line) => line.includes('读这次设置变化失败')));
catalogFails = false;

check.finish();
