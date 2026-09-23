/** 反问与审批两条 waterfall 端到端：接不接、发卡、点卡、答案交回宿主、这一轮停了怎么收尾。 */

import { bodyText, createCheck, libUrl, patchedCards, resetCalls, sentCards, startPlugin, tick } from './harness.mjs';

const {
  APPROVAL_ALLOWED_TITLE, APPROVAL_CLOSED_TITLE, APPROVAL_REJECTED_TITLE,
  QUESTION_CANCELLED_TITLE, QUESTION_CLOSED_TITLE, QUESTION_DONE_TITLE, QUESTION_UNSUPPORTED_TEXT,
} = await import(libUrl('common/copy.js'));
const { APPROVAL_CARD_BTN_ALLOW, APPROVAL_CARD_BTN_REJECT, APPROVAL_CARD_KEY } = await import(libUrl('ui/approval-card.js'));
const { APPROVAL_REQUEST_EVENT } = await import(libUrl('handler/host/approval.js'));
const { QUESTION_CARD_KEY, USER_QUESTION_ERROR_NAME, USER_QUESTIONS_EVENT } = await import(libUrl('handler/host/question.js'));

const check = createCheck();
const app = await startPlugin({ sessionId: 'sess-1', userId: 'ou_boss' });
await tick(30);

/** 从卡片 JSON 里把所有按钮回传值抠出来。 */
const buttonValues = (node, out = []) => {
  if (Array.isArray(node)) {
    node.forEach((item) => buttonValues(item, out));
    return out;
  }
  if (node && typeof node === 'object') {
    if (Array.isArray(node.behaviors)) {
      for (const behavior of node.behaviors) if (behavior?.value?.btn) out.push(behavior.value);
    }
    Object.values(node).forEach((value) => buttonValues(value, out));
  }
  return out;
};
/** 最近一张卡片上某个按钮的回传值。 */
const buttonOf = (btn) => buttonValues(sentCards().at(-1)).find((value) => value.btn === btn);
/** 这一轮的取消信号。 */
const controller = new AbortController();
/** 一道有选项、不多选的题。 */
const questions = [{
  id: 'q1',
  header: '要不要继续',
  question: '接着跑还是停？',
  options: [{ label: '继续' }, { label: '停' }],
}];

let nextCalled = 0;
const next = async () => {
  nextCalled += 1;
  return 'next';
};
/**
 * 走一次宿主请求，并立刻把结果/失败收成 `{ value }` / `{ error }`。
 *
 * 宿主那边是 await 的，我们这边得当场挂上处理，不然作废时的 reject 会变成没人管的异常。
 *
 * @param event 事件名
 * @param request 宿主给的请求
 * @returns `{ value }` 或 `{ error }`
 */
const askAndSettle = (event, request) => app.ask(event, request, next).then((value) => ({ value }), (error) => ({ error }));

// 1. 还没有飞书发起的轮次：让给网页端。
resetCalls();
check.eq('没有飞书发起的轮次：让给网页端', await app.ask(USER_QUESTIONS_EVENT, { questions, agent: { id: 'sess-1' } }, next), 'next');
check.eq('让路时不发卡片', sentCards().length, 0);

// 2. 造一轮飞书发起的轮次。
resetCalls();
await app.incoming({ messageId: 'om_1', text: '跑一下' });
await app.agentEvent('inbox/claimed', {
  agent: { session: { id: 'sess-1' } },
  message: { id: 'host-1', source: { kind: 'user', rpcId: 'om_1' } },
  turn: 1,
});
await tick(30);

// 3. 不是当前会话发起的：让给网页端。
check.eq('不是当前会话发起的：让给网页端', await app.ask(USER_QUESTIONS_EVENT, { questions, agent: { id: '别的会话' } }, next), 'next');
check.eq('不是当前会话时不发卡片', sentCards().filter((card) => JSON.stringify(card).includes(`"${QUESTION_CARD_KEY}"`)).length, 0);

// 4. 这批题飞书答不了（多选）：回一句，再让给网页端。
resetCalls();
const multiSelect = [{ id: 'q1', question: '选几个', options: [{ label: 'A' }], multiSelect: true }];
check.eq('多选题答不了：让给网页端', await app.ask(USER_QUESTIONS_EVENT, { questions: multiSelect, agent: { id: 'sess-1' } }, next), 'next');
check.ok('答不了时先回一句指路', bodyText(sentCards().at(-1)).includes(QUESTION_UNSUPPORTED_TEXT));

// 5. 反问：发卡 → 点一行 → 交卷。
resetCalls();
const answered = askAndSettle(USER_QUESTIONS_EVENT, { questions, agent: { id: 'sess-1' }, signal: controller.signal });
await tick(30);
const questionCard = sentCards().at(-1);
check.ok('反问卡发出来了', JSON.stringify(questionCard).includes(`"${QUESTION_CARD_KEY}"`));
check.ok('卡上写着题的抬头与题面', bodyText(questionCard).includes('要不要继续') && bodyText(questionCard).includes('接着跑还是停？'));

const pick = buttonOf('pick');
await app.cardAction({ ...pick, value: '继续' });
await tick(20);
check.ok('点一行只选中：重画的卡上勾了这一行', JSON.stringify(sentCards().at(-1)).includes('继续'));

const confirm = buttonOf('confirm');
const done = await app.cardAction({ tag: QUESTION_CARD_KEY, btn: confirm.btn, requestId: confirm.requestId, value: '继续' });
check.eq('交卷：答案按宿主要的形状交回去', (await answered).value, { answers: [{ id: 'q1', selected: ['继续'] }] });
check.eq('交完卷卡片换成「已答」', done.card.data.header.title.content, QUESTION_DONE_TITLE);
check.ok('答过的题写在卡片上', bodyText(done.card.data).includes('继续'));
check.eq('这一路都没让给网页端', nextCalled, 3);

// 6. 反问：人点取消 → 以 ASK_CANCELLED 作废。
resetCalls();
const cancelled = askAndSettle(USER_QUESTIONS_EVENT, { questions, agent: { id: 'sess-1' } });
await tick(30);
const cancel = buttonOf('cancel');
const cancelResponse = await app.cardAction({ tag: QUESTION_CARD_KEY, btn: cancel.btn, requestId: cancel.requestId });
check.eq('点取消：卡片换成「已取消」', cancelResponse.card.data.header.title.content, QUESTION_CANCELLED_TITLE);
const cancelError = (await cancelled).error;
check.eq('点取消：宿主那边收到 ASK_CANCELLED', [cancelError?.code, cancelError?.name], ['ASK_CANCELLED', USER_QUESTION_ERROR_NAME]);

// 7. 反问：这一轮被停掉 → 以 ASK_ABORTED 作废，卡片补一刀。
resetCalls();
const abortController = new AbortController();
const aborted = askAndSettle(USER_QUESTIONS_EVENT, { questions, agent: { id: 'sess-1' }, signal: abortController.signal });
await tick(30);
abortController.abort();
await tick(30);
check.eq('这一轮停了：宿主收到 ASK_ABORTED', (await aborted).error?.code, 'ASK_ABORTED');
check.eq('停了之后卡片也改成「已结束」', patchedCards().at(-1).header.title.content, QUESTION_CLOSED_TITLE);

// 8. 审批：允许。
resetCalls();
const approval = askAndSettle(APPROVAL_REQUEST_EVENT, { toolName: 'bash', reason: '要跑一条命令', agent: { id: 'sess-1' } });
await tick(30);
const approvalCard = sentCards().at(-1);
check.ok('审批卡发出来了', JSON.stringify(approvalCard).includes(`"${APPROVAL_CARD_KEY}"`));
check.ok('卡上写了工具与原因', bodyText(approvalCard).includes('bash') && bodyText(approvalCard).includes('要跑一条命令'));
check.ok('卡上写着「只对这一次生效」', JSON.stringify(approvalCard).includes('这一次'));

const allow = buttonOf(APPROVAL_CARD_BTN_ALLOW);
const allowed = await app.cardAction({ tag: APPROVAL_CARD_KEY, btn: allow.btn, requestId: allow.requestId });
check.eq('点允许：交回宿主的决议词是 allowed-once', (await approval).value, 'allowed-once');
check.eq('点允许：卡片换成「已允许」', allowed.card.data.header.title.content, APPROVAL_ALLOWED_TITLE);

// 9. 审批：拒绝。
resetCalls();
const rejectAsk = askAndSettle(APPROVAL_REQUEST_EVENT, { toolName: 'bash', reason: '再跑一条', agent: { id: 'sess-1' } });
await tick(30);
const reject = buttonOf(APPROVAL_CARD_BTN_REJECT);
const rejected = await app.cardAction({ tag: APPROVAL_CARD_KEY, btn: reject.btn, requestId: reject.requestId });
check.eq('点拒绝：交回宿主的决议词是 rejected', (await rejectAsk).value, 'rejected');
check.eq('点拒绝：卡片换成「已拒绝」', rejected.card.data.header.title.content, APPROVAL_REJECTED_TITLE);

// 10. 审批：这一轮停了。
resetCalls();
const stopController = new AbortController();
const closed = askAndSettle(APPROVAL_REQUEST_EVENT, { toolName: 'bash', reason: '还没批完就停了', agent: { id: 'sess-1' }, signal: stopController.signal });
await tick(30);
stopController.abort();
await tick(30);
check.eq('这一轮停了：审批交回 cancelled', (await closed).value, 'cancelled');
check.eq('停了之后审批卡改成「已结束」', patchedCards().at(-1).header.title.content, APPROVAL_CLOSED_TITLE);

check.finish();
