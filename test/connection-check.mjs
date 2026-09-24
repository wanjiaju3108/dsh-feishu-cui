/** 长连接与出站：起连、按凭据重建、状态变化、状态快照。 */

import { callRoute, cardText, createCheck, libUrl, registry, resetCalls, sentCards, startPlugin, tick } from './harness.mjs';

const { SUBSCRIBED_EVENT_TYPES } = await import(libUrl('common/feishu-event.js'));
const { ANNOUNCE_SESSION_TEXT } = await import(libUrl('common/copy.js'));
const { CREDENTIALS_ROUTE, SLEEP_GUARD_ROUTE, STATE_ROUTE, UNBIND_USER_ROUTE } = await import(libUrl('settings/routes.js'));

const check = createCheck();
const app = await startPlugin({ sessionId: 'sess-1', userId: 'ou_boss' });
// 通告是 `void announceConnected()` 发出去的，给它一拍。
await tick(30);

check.eq('有凭据就建长连接', registry.calls.filter((call) => call.kind === 'ws.start').length, 1);
check.eq('喂给 SDK 的凭据与域名', [
  registry.wsOptions.appId,
  registry.wsOptions.appSecret,
  registry.wsOptions.domain,
  registry.wsOptions.loggerLevel,
], ['cli_stub', 'secret_stub', 'https://open.feishu.cn', 2]);
check.eq('自动重连开着', registry.wsOptions.autoReconnect, true);
check.eq('看门狗交给 SDK：ping 超时 15 秒', registry.wsOptions.wsConfig, { pingTimeout: 15 });
check.eq('只订阅那三个事件', [...registry.dispatcher.handlers.keys()].sort(), [...SUBSCRIBED_EVENT_TYPES].sort());
check.eq('四条设置页路由都挂上了', app.routes.map((route) => route.path).sort(), [CREDENTIALS_ROUTE, SLEEP_GUARD_ROUTE, STATE_ROUTE, UNBIND_USER_ROUTE].sort());

const announced = registry.calls.filter((call) => call.kind === 'message.create');
check.eq('连上之后给绑定的人发一张通告卡', [announced.length, announced[0].receiveId, announced[0].receiveIdType], [1, 'ou_boss', 'open_id']);
check.ok('通告里写了当前会话是哪个', cardText(JSON.parse(announced[0].content)).includes(ANNOUNCE_SESSION_TEXT('会话 sess-1')));

resetCalls();
registry.wsOptions.onReconnecting();
await tick();
check.ok('断开只记一行日志，不打扰用户', app.lines.warn.some((line) => line.includes('飞书长连接断开')));
check.eq('断开时一张卡都不发', registry.calls.length, 0);

registry.wsOptions.onReady();
await tick(30);
check.eq('重连回来再发一张通告', registry.calls.filter((call) => call.kind === 'message.create').length, 1);

const stateRoute = app.routes.find((route) => route.path === STATE_ROUTE);
const snapshot = await callRoute(stateRoute, { method: 'GET' });
check.eq('状态快照：200 + JSON', snapshot.status, 200);
check.eq('状态快照说连上了、绑的是谁', [snapshot.json.connected, snapshot.json.userId, snapshot.json.appIdConfigured], [true, 'ou_boss', true]);

resetCalls();
const saved = await callRoute(app.routes.find((route) => route.path === CREDENTIALS_ROUTE), {
  body: { appId: 'cli_new', appSecret: 'secret_new' },
});
check.eq('换凭据：回的还是快照', saved.status, 200);
check.eq('换凭据：旧连接关掉、新连接建起来', [
  registry.calls.filter((call) => call.kind === 'ws.close').length,
  registry.calls.filter((call) => call.kind === 'ws.start').length,
], [1, 1]);
check.eq('新凭据进了存储器', app.credentials(), { FEISHU_CUI_APP_ID: 'cli_new', FEISHU_CUI_APP_SECRET: 'secret_new' });
check.eq('新连接用的是新凭据', [registry.wsOptions.appId, registry.wsOptions.appSecret], ['cli_new', 'secret_new']);

// 出站的重试：抛错重试、业务被拒不重试、三次都失败就放弃。
resetCalls();
registry.throwTimes = 1;
await app.incoming({ messageId: 'om_r1', text: '你好', openId: 'ou_stranger' });
check.eq('第一次抛错：重试一次之后发成功', sentCards().length, 1);
check.ok('重试留下了日志', app.lines.warn.some((line) => line.includes('准备第 2 次尝试')));

resetCalls();
registry.code = 1;
await app.incoming({ messageId: 'om_r2', text: '你好', openId: 'ou_stranger' });
check.eq('业务被拒：只发一次，不重试', registry.calls.length, 1);
check.ok('被拒时把飞书的说法记进日志', app.lines.warn.some((line) => line.includes('被拒：code=1')));
registry.code = 0;

resetCalls();
registry.throwTimes = 3;
await app.incoming({ messageId: 'om_r3', text: '你好', openId: 'ou_stranger' });
check.eq('三次都抛错：试满三次就放弃', registry.calls.length, 0);
check.ok('放弃时记了日志、没有把异常抛出去', app.lines.warn.some((line) => line.includes('已放弃（尝试 3 次）')));

check.finish();
