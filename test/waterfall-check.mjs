/** 反问与审批两条 waterfall 端到端：接不接、发卡、点卡、答案交回宿主、这一轮停了怎么收尾。 */

import { bodyText, createCheck, libUrl, patchedCards, resetCalls, sentCards, startPlugin, tick } from './harness.mjs';

const {
  APPROVAL_ALLOWED_TITLE, APPROVAL_CLOSED_TITLE, APPROVAL_REJECTED_TITLE,
  QUESTION_CANCELLED_TITLE, QUESTION_CLOSED_TITLE, QUESTION_DONE_TITLE,
  QUESTION_MULTI_SELECT_LABEL, QUESTION_SINGLE_SELECT_LABEL, QUESTION_UNSUPPORTED_TEXT,
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
/** 卡片上某一选项行（按它的 `value` 认）的回传值。 */
const rowOf = (card, label) => buttonValues(card).find((value) => value.btn === 'pick' && value.value === label);
/**
 * 卡片上某一选项行现在勾没勾。
 *
 * @param card 卡片对象
 * @param label 这一行的 `value`
 * @returns `checked` 的值；卡上没这一行时 undefined
 */
const checkedOf = (card, label) => {
  let found;
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (node.tag === 'checker' && node.behaviors?.[0]?.value?.value === label) found = node.checked;
    Object.values(node).forEach(walk);
  };
  walk(card);
  return found;
};
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

// 4. 没有选项的题（全靠打字）还是答不了：回一句，再让给网页端。
resetCalls();
const noOptions = [{ id: 'q1', question: '说说你的想法' }];
check.eq('没选项的题答不了：让给网页端', await app.ask(USER_QUESTIONS_EVENT, { questions: noOptions, agent: { id: 'sess-1' } }, next), 'next');
check.ok('答不了时先回一句指路', bodyText(sentCards().at(-1)).includes(QUESTION_UNSUPPORTED_TEXT));

// 5. 反问：发卡 → 点一行 → 交卷。
resetCalls();
const answered = askAndSettle(USER_QUESTIONS_EVENT, { questions, agent: { id: 'sess-1' }, signal: controller.signal });
await tick(30);
const questionCard = sentCards().at(-1);
check.ok('反问卡发出来了', JSON.stringify(questionCard).includes(`"${QUESTION_CARD_KEY}"`));
check.ok('卡上写着题的抬头与题面', bodyText(questionCard).includes('要不要继续') && bodyText(questionCard).includes('接着跑还是停？'));

const pick = buttonOf('pick');
// 重画那张卡是这次回调的返回值，不走 `sendCard`，所以得从返回值里取。
const repainted = await app.cardAction({ ...pick, value: '继续' });
await tick(20);
check.eq('点一行只选中：重画的卡上勾了这一行', checkedOf(repainted.card.data, '继续'), true);
check.eq('单选：别的行没勾', checkedOf(repainted.card.data, '停'), false);

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

// 11. 多选题：勾选项不重画卡片，勾几个交几个。
resetCalls();
const multiQuestions = [{
  id: 'q1',
  header: '挑几个',
  question: '要哪几个？',
  options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
  multiSelect: true,
}];
const multiAnswered = askAndSettle(USER_QUESTIONS_EVENT, { questions: multiQuestions, agent: { id: 'sess-1' } });
await tick(30);
const multiCard = sentCards().at(-1);
check.ok('多选题发得出来', JSON.stringify(multiCard).includes(`"${QUESTION_CARD_KEY}"`));
check.ok('卡上标了【多选】', bodyText(multiCard).includes(QUESTION_MULTI_SELECT_LABEL));

check.eq('勾一项：不重画卡片', await app.cardAction({ ...rowOf(multiCard, 'A'), checked: true }), undefined);
check.eq('再勾一项：还是不重画', await app.cardAction({ ...rowOf(multiCard, 'B'), checked: true }), undefined);
await tick(20);
check.eq('勾了两项，卡片没被换过', sentCards().at(-1), multiCard);

const multiConfirm = buttonValues(multiCard).find((value) => value.btn === 'confirm');
const multiDone = await app.cardAction({ tag: QUESTION_CARD_KEY, btn: multiConfirm.btn, requestId: multiConfirm.requestId });
check.eq('多选交卷：勾上的都交回去', (await multiAnswered).value, { answers: [{ id: 'q1', selected: ['A', 'B'] }] });
check.ok('交完卷卡片上两个标签都写着', bodyText(multiDone.card.data).includes('A') && bodyText(multiDone.card.data).includes('B'));

// 12. 多选题：取消勾选要把那一项从答案里摘掉。
resetCalls();
const uncheckAnswered = askAndSettle(USER_QUESTIONS_EVENT, { questions: multiQuestions, agent: { id: 'sess-1' } });
await tick(30);
const uncheckCard = sentCards().at(-1);
await app.cardAction({ ...rowOf(uncheckCard, 'A'), checked: true });
await app.cardAction({ ...rowOf(uncheckCard, 'B'), checked: true });
await app.cardAction({ ...rowOf(uncheckCard, 'A'), checked: false });
await tick(20);
const uncheckConfirm = buttonValues(uncheckCard).find((value) => value.btn === 'confirm');
await app.cardAction({ tag: QUESTION_CARD_KEY, btn: uncheckConfirm.btn, requestId: uncheckConfirm.requestId });
check.eq('取消勾选的那项不再交回去', (await uncheckAnswered).value, { answers: [{ id: 'q1', selected: ['B'] }] });

// 13. 多选全取消：按跳过交回空选择。
resetCalls();
const emptiedAnswered = askAndSettle(USER_QUESTIONS_EVENT, { questions: multiQuestions, agent: { id: 'sess-1' } });
await tick(30);
const emptiedCard = sentCards().at(-1);
await app.cardAction({ ...rowOf(emptiedCard, 'A'), checked: true });
await app.cardAction({ ...rowOf(emptiedCard, 'A'), checked: false });
await tick(20);
const emptiedConfirm = buttonValues(emptiedCard).find((value) => value.btn === 'confirm');
const emptiedDone = await app.cardAction({ tag: QUESTION_CARD_KEY, btn: emptiedConfirm.btn, requestId: emptiedConfirm.requestId });
check.eq('全取消之后交回空选择', (await emptiedAnswered).value, { answers: [{ id: 'q1', selected: [] }] });
check.ok('全取消之后卡片上写「已跳过」', bodyText(emptiedDone.card.data).includes('已跳过'));

// 14. 单选那道题不受影响：连点两行只剩后点的那个。
resetCalls();
const singleAnswered = askAndSettle(USER_QUESTIONS_EVENT, { questions, agent: { id: 'sess-1' } });
await tick(30);
const singleCard = sentCards().at(-1);
check.ok('单选题标的是【单选】', bodyText(singleCard).includes(QUESTION_SINGLE_SELECT_LABEL));
await app.cardAction({ ...rowOf(singleCard, '继续'), checked: true });
await tick(20);
const singleRepainted = await app.cardAction({ ...rowOf(sentCards().at(-1), '停'), checked: true });
await tick(20);
check.eq('单选：重画后只剩后点的那个勾着', checkedOf(singleRepainted.card.data, '停'), true);
check.eq('单选：先点的那个被顶掉了', checkedOf(singleRepainted.card.data, '继续'), false);
const singleConfirm = buttonValues(sentCards().at(-1)).find((value) => value.btn === 'confirm');
await app.cardAction({ tag: QUESTION_CARD_KEY, btn: singleConfirm.btn, requestId: singleConfirm.requestId });
check.eq('单选：交卷只剩后点的那一个', (await singleAnswered).value, { answers: [{ id: 'q1', selected: ['停'] }] });

// 15. 混合批次：多选勾了之后，单选那次重画要把多选的勾按账画回来。
resetCalls();
const mixedQuestions = [
  { id: 'q1', header: '单选那道', question: '接着跑还是停？', options: [{ label: '继续' }, { label: '停' }] },
  { id: 'q2', header: '多选那道', question: '要哪几个？', options: [{ label: 'X' }, { label: 'Y' }], multiSelect: true },
];
const mixedAnswered = askAndSettle(USER_QUESTIONS_EVENT, { questions: mixedQuestions, agent: { id: 'sess-1' } });
await tick(30);
const mixedCard = sentCards().at(-1);
await app.cardAction({ ...rowOf(mixedCard, 'X'), checked: true });
await tick(20);
const mixedRepainted = await app.cardAction({ ...rowOf(sentCards().at(-1), '继续'), checked: true });
await tick(20);
check.eq('单选那次重画把多选勾的 X 画回来了', checkedOf(mixedRepainted.card.data, 'X'), true);
check.eq('单选勾的是后点的那个', checkedOf(mixedRepainted.card.data, '继续'), true);
check.eq('单选另一个没勾', checkedOf(mixedRepainted.card.data, '停'), false);
const mixedConfirm = buttonValues(sentCards().at(-1)).find((value) => value.btn === 'confirm');
await app.cardAction({ tag: QUESTION_CARD_KEY, btn: mixedConfirm.btn, requestId: mixedConfirm.requestId });
check.eq('混合批次：两道题各交各的', (await mixedAnswered).value, {
  answers: [{ id: 'q1', selected: ['继续'] }, { id: 'q2', selected: ['X'] }],
});

check.finish();
