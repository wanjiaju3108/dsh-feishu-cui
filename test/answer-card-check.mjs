/** 回答卡端到端：排队 / 处理中 / 分段上屏 / 收尾 / 停止 / 撤回 / 装不下。 */

import {
  bodyText, createCheck, libUrl, patchedCards, registry, resetCalls, sentCards, startPlugin, tick,
} from './harness.mjs';

const {
  ANSWER_CANCELLED_TITLE, ANSWER_DONE_TITLE, ANSWER_EMPTY_TEXT, ANSWER_QUEUED_TITLE, ANSWER_RUNNING_TITLE,
  ANSWER_STOPPED_TITLE, ANSWER_STOPPING_TITLE, ANSWER_TOO_LONG_TEXT, ANSWER_TOO_LONG_TITLE,
} = await import(libUrl('common/copy.js'));
const { ANSWER_CARD_BTN_STOP, ANSWER_CARD_BTN_WITHDRAW, ANSWER_CARD_KEY } = await import(libUrl('ui/answer-card.js'));

const check = createCheck();
const app = await startPlugin({ sessionId: 'sess-1', userId: 'ou_boss' });
await tick(30);

/** 一张卡片的标题。 */
const titleOf = (card) => card.header?.title?.content;
/** 最近被换上去的那张卡。 */
const lastPatch = () => patchedCards().at(-1);
/** 宿主那条 agent 事件。 */
const agentPayload = (requestId, hostMessageId, turn) => ({
  agent: { session: { id: 'sess-1' } },
  message: { id: hostMessageId, source: { kind: 'user', rpcId: requestId } },
  turn,
});

/** 让这条飞书消息进账（去重表里有它，回答卡才认它是自己那一轮）。 */
const feed = (messageId) => app.incoming({ messageId, text: '跑一下' });

resetCalls();
await feed('om_1');
await app.agentEvent('inbox/claimed', agentPayload('om_1', 'host-1', 1));
await tick(30);
check.eq('被取走就开一张「处理中」卡', titleOf(sentCards().at(-1)), ANSWER_RUNNING_TITLE);
check.eq('卡回复在那条飞书消息上', registry.calls.find((call) => call.kind === 'message.reply').targetMessageId, 'om_1');
check.eq('处理中卡上挂「停止」，requestId 是那条飞书消息', sentCards().at(-1).body.elements[1].columns[0].elements[0].behaviors[0].value, {
  tag: ANSWER_CARD_KEY, btn: ANSWER_CARD_BTN_STOP, requestId: 'om_1',
});

await app.sessionEvent({ type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: '第一段' }] } } });
await tick(30);
check.eq('第一段接上卡片', bodyText(lastPatch()), '第一段');

await app.sessionEvent({ type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: '第二段' }, { type: 'tool_call', text: '不该上屏' }] } } });
await tick(30);
check.eq('正文是累加的，工具调用不上屏', bodyText(lastPatch()), '第一段第二段');

resetCalls();
await app.sessionEvent({ type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
await tick(30);
check.eq('这一轮跑完：卡片收尾成「已完成」', titleOf(lastPatch()), ANSWER_DONE_TITLE);
check.eq('收尾时正文留着', bodyText(lastPatch()), '第一段第二段');

resetCalls();
await app.sessionEvent({ type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
await tick(30);
check.eq('收尾之后这条消息不在账上了，再来事件也不动卡片', patchedCards(), []);

// 「停止」：在跑的那张卡上点停止 → 请求中止这一轮，卡片先变「正在停止」。
resetCalls();
await feed('om_2');
await app.agentEvent('inbox/claimed', agentPayload('om_2', 'host-2', 2));
await tick(30);
const stopped = await app.cardAction({ tag: ANSWER_CARD_KEY, btn: ANSWER_CARD_BTN_STOP, requestId: 'om_2' }, { messageId: 'om_2' });
await tick(30);
check.eq('点「停止」：请求宿主中止当前这一轮', app.calls.cancel, [{ sessionId: 'sess-1' }]);
check.eq('点「停止」：卡片先变成「正在停止」', titleOf(stopped.card.data), ANSWER_STOPPING_TITLE);
check.eq('卡片也被换了一次', titleOf(lastPatch()), ANSWER_STOPPING_TITLE);

// 「撤回」：排队里还没跑的那条。
resetCalls();
await feed('om_3');
await app.agentEvent('inbox/inserted', agentPayload('om_3', 'host-3', 0));
await tick(150);
check.eq('排了一小会儿还没被取走才开「排队中」卡', titleOf(sentCards().at(-1)), ANSWER_QUEUED_TITLE);
check.eq('排队中卡上挂「撤回」', sentCards().at(-1).body.elements[1].columns[0].elements[0].behaviors[0].value.btn, ANSWER_CARD_BTN_WITHDRAW);

const withdrawn = await app.cardAction({ tag: ANSWER_CARD_KEY, btn: ANSWER_CARD_BTN_WITHDRAW, requestId: 'om_3' }, { messageId: 'om_3' });
await tick(30);
check.eq('点「撤回」：把宿主队列里那条撤掉', app.calls.updateQueue, [{ sessionId: 'sess-1', itemId: 'host-3', action: { kind: 'remove' } }]);
check.eq('点「撤回」：卡片换成「对话已取消」', titleOf(withdrawn.card.data), ANSWER_CANCELLED_TITLE);
check.eq('撤回之后这条也不在账上了（卡片停在取消那句上）', titleOf(lastPatch()), ANSWER_CANCELLED_TITLE);

// 这一轮一个字都没产出。
resetCalls();
await feed('om_4');
await app.agentEvent('inbox/claimed', agentPayload('om_4', 'host-4', 4));
await tick(30);
await app.sessionEvent({ type: 'turn/end', data: { turn: 4, reason: { kind: 'completed' } } });
await tick(30);
check.eq('没有产出时补一句「没有可显示的正文」', bodyText(lastPatch()), ANSWER_EMPTY_TEXT);
check.eq('这一轮是正常完成，标题还是「已完成」', titleOf(lastPatch()), ANSWER_DONE_TITLE);

// 中止。
resetCalls();
await feed('om_5');
await app.agentEvent('inbox/claimed', agentPayload('om_5', 'host-5', 5));
await tick(30);
await app.sessionEvent({ type: 'turn/end', data: { turn: 5, reason: { kind: 'aborted' } } });
await tick(30);
check.eq('被中止的那一轮收尾成「已停止」', titleOf(lastPatch()), ANSWER_STOPPED_TITLE);

// 正文装不下。
resetCalls();
await feed('om_6');
await app.agentEvent('inbox/claimed', agentPayload('om_6', 'host-6', 6));
await tick(30);
await app.sessionEvent({ type: 'assistant/message', data: { turn: 6, message: { content: [{ type: 'text', text: '很长'.repeat(20000) }] } } });
await tick(30);
check.eq('正文超过卡片体积上限：换成「任务失败」+ 去网页端看', titleOf(lastPatch()), ANSWER_TOO_LONG_TITLE);
check.eq('提示卡正文写清楚原因', bodyText(lastPatch()), ANSWER_TOO_LONG_TEXT);

// 不是我们交出去的消息。
resetCalls();
await app.agentEvent('inbox/claimed', agentPayload('om_other', 'host-9', 9));
await tick(30);
check.eq('不是飞书交出去的那条消息：一张卡都不开', sentCards(), []);

check.finish();
