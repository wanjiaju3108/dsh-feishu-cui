/** 事件路由：按事件与 `tag` 分给谁，不认识的那些往日志里说一句。 */

import { createCheck, createLogger, libUrl } from './harness.mjs';

const { createRouter } = await import(libUrl('driving/feishu/router.js'));
const { ANSWER_CARD_KEY } = await import(libUrl('ui/answer-card.js'));
const { APPROVAL_CARD_KEY } = await import(libUrl('ui/approval-card.js'));
const { QUESTION_CARD_KEY } = await import(libUrl('handler/host/question.js'));

const check = createCheck();
const { logger, lines } = createLogger();

let hit = '';
/**
 * 造一个只记「谁被调到」的假处理函数。
 *
 * @param name 记下来的名字
 * @returns 处理函数
 */
const stub = (name) => async () => {
  hit = name;
  return name;
};

const router = createRouter({
  logger,
  pairing: { pushPairingCode: stub('pairing.pushPairingCode'), verifyPairingCode: stub('pairing.verifyPairingCode') },
  balance: { pushBalance: stub('balance.pushBalance') },
  sessions: { pushSessionList: stub('sessions.pushSessionList'), handleSessionCard: stub('sessions.handleSessionCard') },
  sessionRename: { pushSessionRename: stub('sessionRename.pushSessionRename'), handleSessionRenameCard: stub('sessionRename.handleSessionRenameCard') },
  workspaces: { pushWorkspaceList: stub('workspaces.pushWorkspaceList'), handleWorkspaceCard: stub('workspaces.handleWorkspaceCard') },
  model: { pushModelCard: stub('model.pushModelCard'), handleModelCard: stub('model.handleModelCard') },
  effort: { pushEffortCard: stub('effort.pushEffortCard'), handleEffortCard: stub('effort.handleEffortCard') },
  permission: { pushPermissionCard: stub('permission.pushPermissionCard'), handlePermissionCard: stub('permission.handlePermissionCard') },
  message: { prompt: stub('message.prompt') },
  answer: { onCardAction: stub('answer.onCardAction') },
  question: { onCardAction: stub('question.onCardAction') },
  approval: { onCardAction: stub('approval.onCardAction') },
  warn: { handle: stub('warn.handle') },
});

check.eq('判定没通过时交给 warn.handle', await router.route({ code: 2, reason: 'not-matched' }, { event: 'menu', tag: 'balance' }), 'warn.handle');

check.eq('私聊消息交给投喂', await router.route({ code: 0 }, { event: 'message', tag: 'message' }), 'message.prompt');

const menuRoutes = [
  ['pairing', 'pairing.pushPairingCode'],
  ['balance', 'balance.pushBalance'],
  ['sessions', 'sessions.pushSessionList'],
  ['session-rename', 'sessionRename.pushSessionRename'],
  ['workspaces', 'workspaces.pushWorkspaceList'],
  ['model', 'model.pushModelCard'],
  ['effort', 'effort.pushEffortCard'],
  ['permission', 'permission.pushPermissionCard'],
];
for (const [tag, expected] of menuRoutes) {
  hit = '';
  await router.route({ code: 0 }, { event: 'menu', tag });
  check.eq(`菜单 ${tag}`, hit, expected);
}

const cardRoutes = [
  ['pairing', 'pairing.verifyPairingCode'],
  ['sessions', 'sessions.handleSessionCard'],
  ['session-rename', 'sessionRename.handleSessionRenameCard'],
  ['workspaces', 'workspaces.handleWorkspaceCard'],
  ['model', 'model.handleModelCard'],
  ['effort', 'effort.handleEffortCard'],
  ['permission', 'permission.handlePermissionCard'],
  [ANSWER_CARD_KEY, 'answer.onCardAction'],
  [QUESTION_CARD_KEY, 'question.onCardAction'],
  [APPROVAL_CARD_KEY, 'approval.onCardAction'],
];
for (const [tag, expected] of cardRoutes) {
  hit = '';
  await router.route({ code: 0 }, { event: 'card', tag });
  check.eq(`卡片 ${tag}`, hit, expected);
}

hit = '';
check.eq('没配过的菜单项：什么都不做', await router.route({ code: 0 }, { event: 'menu', tag: 'nope' }), undefined);
check.eq('没配过的菜单项：没交给别人', hit, '');
check.ok('没配过的菜单项留下了 warn 日志', lines.warn.some((line) => line.includes('这个菜单项还没有去处：nope')));

check.eq('没配过的卡片：什么都不做', await router.route({ code: 0 }, { event: 'card', tag: 'nope' }), undefined);
check.ok('没配过的卡片留下了 warn 日志', lines.warn.some((line) => line.includes('这张卡片还没有去处：nope')));

check.eq('连 tag 都没有的菜单：也只是一句日志', await router.route({ code: 0 }, { event: 'menu' }), undefined);
check.ok('空 tag 的日志写成「(无 tag)」', lines.warn.some((line) => line.includes('这个菜单项还没有去处：(无 tag)')));

check.eq('没见过的顶层事件：什么都不做', await router.route({ code: 0 }, { event: 'other' }), undefined);
check.ok('没见过的顶层事件留下了 warn 日志', lines.warn.some((line) => line.includes('这类事件还没有去处：other')));

check.finish();
