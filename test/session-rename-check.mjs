/** 会话重命名：菜单发输入框卡片、提交改名、取消、失效卡、宿主拒了、没有当前会话。 */

import { cardText, createCheck, createLogger, createPush, installSettings, libUrl, responseCard } from './harness.mjs';

const { createSessionRenameHandler } = await import(libUrl('handler/feishu/session-rename.js'));
const { createSessionCatalog } = await import(libUrl('infra/host/session.js'));
const { readMenuCard } = await import(libUrl('cache/pending-cards.js'));
const { NO_CURRENT_SESSION_TEXT, SESSION_RENAMED_TEXT, SESSION_RENAME_CANCELLED_TEXT, SESSION_RENAME_FAILED_TEXT, SESSION_RENAME_STALE_TEXT } = await import(libUrl('common/copy.js'));

const check = createCheck();
const { logger, lines } = createLogger();
const { push, sent } = createPush();
const settings = await installSettings({ sessionId: 's1', userId: 'u1' });

/** 假会话控制器：记下每次改名请求，按 `mode` 决定成功还是抛错。 */
const calls = [];
let mode = 'ok';
const controller = {
  async rename(request) {
    calls.push(request);
    if (mode === 'throw') throw new Error('session/title-invalid: session title must contain visible characters');
    if (mode === 'no-service') throw new Error('renaming is unavailable: this deployment mounts no session-title service');
    return { title: String(request.title).trim(), seq: 7 };
  },
};
const catalog = createSessionCatalog({
  logger,
  access: {
    service: (name) => (name === 'sessionController' ? controller : undefined),
    method: (name, methodName) => (name === 'sessionController' && typeof controller[methodName] === 'function'
      ? controller[methodName].bind(controller)
      : undefined),
  },
  workspaces: {},
});

const handler = createSessionRenameHandler({ logger, push, catalog });

/** 造一次卡片回调。 */
const cardEvent = (over = {}) => ({
  messageId: readMenuCard().messageId,
  operatorId: 'u1',
  content: { value: { tag: 'session-rename', btn: 'confirm' }, formValue: { input: '新名字' } },
  ...over,
});

await handler.pushSessionRename({ operatorId: 'u1' });
check.eq('点菜单发出一张卡片', sent.length, 1);
check.eq('发给点菜单的人', sent[0].target, { openId: 'u1' });
check.ok('卡片是输入框卡片（带 input 组件）', JSON.stringify(sent[0].card).includes('"input"'));
check.ok('卡片类型是 session-rename', JSON.stringify(sent[0].card).includes('"session-rename"'));
check.eq('卡片记进在册', readMenuCard().messageId, 'm1');

const ok = await handler.handleSessionRenameCard(cardEvent({ content: { value: { tag: 'session-rename', btn: 'confirm' }, formValue: { input: '  新名字  ' } } }));
check.eq('提交时把表单里的原文交给宿主', calls, [{ sessionId: 's1', title: '  新名字  ' }]);
check.eq('回的是宿主收下后的名字', cardText(responseCard(ok)), SESSION_RENAMED_TEXT('新名字'));
check.ok('改成了留下 info 日志', lines.info.some((line) => line.includes('已改名为「新名字」')));
check.eq('提交完这张卡就不在册了', readMenuCard().messageId, '');

calls.length = 0;
const stale = await handler.handleSessionRenameCard(cardEvent({ messageId: 'm-old' }));
check.eq('不在册的卡片：不提交、回失效那句', [calls.length, cardText(responseCard(stale))], [0, SESSION_RENAME_STALE_TEXT]);

await handler.pushSessionRename({ operatorId: 'u1' });
const cancelled = await handler.handleSessionRenameCard(cardEvent({ content: { value: { tag: 'session-rename', btn: 'cancel' } } }));
check.eq('点取消：不提交、回取消那句', [calls.length, cardText(responseCard(cancelled))], [0, SESSION_RENAME_CANCELLED_TEXT]);
check.eq('点取消之后也不在册了', readMenuCard().messageId, '');

await handler.pushSessionRename({ operatorId: 'u1' });
mode = 'throw';
calls.length = 0;
const failed = await handler.handleSessionRenameCard(cardEvent({ content: { value: { tag: 'session-rename', btn: 'confirm' }, formValue: { input: '   ' } } }));
check.eq('宿主拒了：回失败那句', cardText(responseCard(failed)), SESSION_RENAME_FAILED_TEXT);
check.ok('宿主原话不上屏', !cardText(responseCard(failed)).includes('visible characters'));
check.ok('宿主原话进日志', lines.warn.some((line) => line.includes('visible characters')));
mode = 'ok';

await handler.pushSessionRename({ operatorId: 'u1' });
calls.length = 0;
settings.set({ sessionId: '' });
const noSession = await handler.handleSessionRenameCard(cardEvent());
check.eq('提交时当前会话没了：不提交、回还没有当前会话', [calls.length, cardText(responseCard(noSession))], [0, NO_CURRENT_SESSION_TEXT]);

sent.length = 0;
await handler.pushSessionRename({ operatorId: 'u1' });
check.eq('没有当前会话时点菜单：只发一句话', cardText(sent[sent.length - 1].card), NO_CURRENT_SESSION_TEXT);
check.ok('没有当前会话时不发输入框卡片', !JSON.stringify(sent[sent.length - 1].card).includes('"input"'));
check.eq('没发出卡片时不记在册', readMenuCard().messageId, '');

sent.length = 0;
await handler.pushSessionRename({});
check.eq('菜单事件里没有 open_id：什么都不发', sent.length, 0);

check.finish();
