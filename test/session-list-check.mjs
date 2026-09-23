/** 会话列表卡片：发卡、点行重画、确定切过去、新建、取消、失效卡、没有工作区。 */

import { cardText, createCheck, createLogger, createPush, installSettings, libUrl, responseCard } from './harness.mjs';

const { createSessionsHandler } = await import(libUrl('handler/feishu/sessions.js'));
const { readMenuCard } = await import(libUrl('cache/pending-cards.js'));
const {
  SESSION_GONE_ERROR,
  SESSION_LIST_CANCELLED_TEXT,
  SESSION_LIST_STALE_TEXT,
  SESSION_NO_WORKSPACE_TEXT,
  SESSION_SWITCHED_TEXT,
} = await import(libUrl('common/copy.js'));

const check = createCheck();
const { logger } = createLogger();
const { push, sent } = createPush();
const settings = await installSettings({ sessionId: 's1', userId: 'u1', workspaceId: 'w1' });

const listed = [
  { id: 's1', title: '甲', cwd: '/a', updatedAt: 2, turns: 3 },
  { id: 's2', title: '乙', cwd: '/b', updatedAt: 1, turns: 2 },
];
const opened = [];
const created = [];
let visible = listed;
const catalog = {
  listRecent: async () => (visible === null ? undefined : visible),
  create: async (request) => {
    created.push(request);
    return 's9';
  },
  cwdOf: async (sessionId) => (sessionId === 's2' ? '/b' : '/a'),
  titleOf: async () => '新会话',
  open: async (sessionId) => {
    opened.push(sessionId);
    return true;
  },
};

const handler = createSessionsHandler({ logger, push, catalog });

/** 造一次卡片回调。 */
const cardEvent = (over = {}) => ({
  messageId: readMenuCard().messageId,
  operatorId: 'u1',
  content: { value: { tag: 'sessions', btn: 'confirm', value: 's2' } },
  ...over,
});

await handler.pushSessionList({ operatorId: 'u1' });
check.eq('点菜单发一张会话列表卡', [sent.length, sent[0].target.openId], [1, 'u1']);
check.ok('卡片类型是 sessions', JSON.stringify(sent[0].card).includes('"sessions"'));
check.ok('卡片里两个会话都在', JSON.stringify(sent[0].card).includes('s1') && JSON.stringify(sent[0].card).includes('s2'));
check.eq('卡片记进在册', readMenuCard().tag, 'sessions');

const repainted = await handler.handleSessionCard(cardEvent({ content: { value: { tag: 'sessions', btn: 'pick', value: 's2' } } }));
check.ok('点一行就重画一张卡', responseCard(repainted) !== undefined);
check.eq('点行不改当前会话', settings.read().sessionId, 's1');

const switched = await handler.handleSessionCard(cardEvent());
check.eq('确定：当前会话切过去', [settings.read().sessionId, opened], ['s2', ['s2']]);
check.eq('确定：回的卡片写切到哪个', cardText(responseCard(switched)), SESSION_SWITCHED_TEXT('乙'));
check.eq('确定之后卡片不在册了', readMenuCard().messageId, '');

await handler.pushSessionList({ operatorId: 'u1' });
const stale = await handler.handleSessionCard(cardEvent({ messageId: 'm-old' }));
check.eq('不在册的卡片：回失效那句', cardText(responseCard(stale)), SESSION_LIST_STALE_TEXT);

const cancelled = await handler.handleSessionCard(cardEvent({ content: { value: { tag: 'sessions', btn: 'cancel' } } }));
check.eq('取消：回取消那句、不改当前会话', [cardText(responseCard(cancelled)), settings.read().sessionId], [SESSION_LIST_CANCELLED_TEXT, 's2']);

await handler.pushSessionList({ operatorId: 'u1' });
const gone = await handler.handleSessionCard(cardEvent({ content: { value: { tag: 'sessions', btn: 'confirm', value: 's7' } } }));
check.ok('确定时目标已经不在了：卡片上写一句重选', cardText(responseCard(gone)).includes(SESSION_GONE_ERROR));
check.eq('目标不在时不切、也不打开', [settings.read().sessionId, opened], ['s2', ['s2']]);

await handler.pushSessionList({ operatorId: 'u1' });
const added = await handler.handleSessionCard(cardEvent({ content: { value: { tag: 'sessions', btn: 'add' } } }));
check.eq('「新建」：在当前工作区里建一个', created, [{ cwd: '/b', workspaceId: 'w1' }]);
check.eq('「新建」：建完切过去并打开', [settings.read().sessionId, opened], ['s9', ['s2', 's9']]);
check.eq('「新建」：回的卡片写切到哪个', cardText(responseCard(added)), SESSION_SWITCHED_TEXT('新会话'));

visible = null;
sent.length = 0;
await handler.pushSessionList({ operatorId: 'u1' });
check.eq('认不出当前工作区：只回一句话', cardText(sent[0].card), SESSION_NO_WORKSPACE_TEXT);
check.ok('认不出工作区时不发选项卡', !JSON.stringify(sent[0].card).includes('"sessions"'));
check.eq('认不出工作区时不记在册', readMenuCard().messageId, '');

check.finish();
