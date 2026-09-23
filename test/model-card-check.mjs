/** 模型卡片：发卡、没会话、目录空、确定（先回已请求、再提交给宿主）、提交失败、选了目录里没有的。 */

import { cardText, createCheck, createLogger, createPush, installSettings, libUrl, responseCard, tick } from './harness.mjs';

const { createModelHandler } = await import(libUrl('handler/feishu/model.js'));
const { readMenuCard } = await import(libUrl('cache/pending-cards.js'));
const {
  MODEL_CARD_EMPTY_TEXT,
  MODEL_GONE_ERROR,
  MODEL_SELECT_UNSUPPORTED_TEXT,
  NO_CURRENT_SESSION_TEXT,
} = await import(libUrl('common/copy.js'));

const check = createCheck();
const { logger, lines } = createLogger();
const { push, sent, patched } = createPush();
const settings = await installSettings({ sessionId: 's1', userId: 'u1' });

const groups = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'chat', name: 'chat' },
      { id: 'chat2', name: 'chat2', reasoning: { efforts: [{ id: 'high', name: '高' }] } },
    ],
  },
];
const selected = [];
let selectResult = { ok: true };
let current = { provider: 'deepseek', model: 'chat' };
const models = {
  catalog: async () => ({ groups, failures: [] }),
  current: async () => current,
  select: async (request) => {
    selected.push(request);
    return selectResult;
  },
};

const handler = createModelHandler({ logger, push, models });

/** 造一次卡片回调。 */
const cardEvent = (over = {}) => ({
  messageId: readMenuCard().messageId,
  operatorId: 'u1',
  content: { value: { tag: 'model', btn: 'confirm', value: 'deepseek/chat2' } },
  ...over,
});

await handler.pushModelCard({ operatorId: 'u1' });
check.eq('点菜单发一张模型卡', sent.length, 1);
check.ok('卡片类型是 model', JSON.stringify(sent[0].card).includes('"model"'));
check.ok('卡片里列了目录里的模型', JSON.stringify(sent[0].card).includes('chat2'));
check.ok('卡片上写着当前是哪个', cardText(sent[0].card).includes('chat'));

const requested = await handler.handleModelCard(cardEvent());
check.ok('确定：先把「已请求」那句换上去', cardText(responseCard(requested)).includes('已请求'));
check.eq('确定：这张卡就不在册了', readMenuCard().messageId, '');
await tick();
check.eq('确定：后台把选择交给宿主（当前选择没带档位就不带）', selected, [{ sessionId: 's1', provider: 'deepseek', model: 'chat2' }]);
check.eq('提交成功就不再动那张卡', patched.length, 0);
check.ok('提交成功留下 info 日志', lines.info.some((line) => line.includes('已请求把当前会话的模型改成 chat2')));

current = { provider: 'deepseek', model: 'chat2', reasoningEffort: 'high' };
await handler.pushModelCard({ operatorId: 'u1' });
selected.length = 0;
patched.length = 0;
await handler.handleModelCard(cardEvent());
await tick();
check.eq('确定：当前选择带着推理档位，就一起交给宿主', selected, [{ sessionId: 's1', provider: 'deepseek', model: 'chat2', reasoningEffort: 'high' }]);
current = { provider: 'deepseek', model: 'chat' };

await handler.pushModelCard({ operatorId: 'u1' });
selectResult = { ok: false, unsupported: true };
selected.length = 0;
patched.length = 0;
await handler.handleModelCard(cardEvent({ content: { value: { tag: 'model', btn: 'confirm', value: 'deepseek/chat' } } }));
await tick();
check.eq('宿主不支持这个组合：把失败原因补到卡上', cardText(patched[patched.length - 1].card), MODEL_SELECT_UNSUPPORTED_TEXT);
selectResult = { ok: true };

await handler.pushModelCard({ operatorId: 'u1' });
const gone = await handler.handleModelCard(cardEvent({ content: { value: { tag: 'model', btn: 'confirm', value: 'deepseek/nope' } } }));
check.ok('选了目录里没有的：卡上写一句重选', cardText(responseCard(gone)).includes(MODEL_GONE_ERROR));

settings.set({ sessionId: '' });
sent.length = 0;
await handler.pushModelCard({ operatorId: 'u1' });
check.eq('没有当前会话：只回一句话', cardText(sent[0].card), NO_CURRENT_SESSION_TEXT);
check.ok('没有当前会话时不发选项卡', !JSON.stringify(sent[0].card).includes('"model"'));
settings.set({ sessionId: 's1' });

current = undefined;
const empty = createModelHandler({
  logger,
  push,
  models: { catalog: async () => ({ groups: [] }), current: async () => undefined, select: async () => ({ ok: true }) },
});
sent.length = 0;
await empty.pushModelCard({ operatorId: 'u1' });
check.eq('宿主一个模型都没给：只回一句话', cardText(sent[0].card), MODEL_CARD_EMPTY_TEXT);

check.finish();
