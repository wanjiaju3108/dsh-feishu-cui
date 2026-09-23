/** 没配凭据时：不建连、说明原因，配好之后能立刻接上。 */

import { callRoute, cardText, createCheck, libUrl, patchedCards, registry, sentCards, startPlugin, tick } from './harness.mjs';

const { CREDENTIALS_ROUTE, STATE_ROUTE } = await import(libUrl('settings/routes.js'));

const check = createCheck();
const app = await startPlugin({ credentials: null });
await tick(30);

check.eq('没凭据就不建长连接', registry.calls.filter((call) => call.kind === 'ws.start').length, 0);
check.ok('日志里说明了原因', app.lines.warn.some((line) => line.includes('未配置飞书凭据')));
check.eq('状态快照说没连上、凭据也没配', [
  (await callRoute(app.routes.find((route) => route.path === STATE_ROUTE), { method: 'GET' })).json.connected,
  (await callRoute(app.routes.find((route) => route.path === STATE_ROUTE), { method: 'GET' })).json.appIdConfigured,
], [false, false]);
check.eq('没凭据时一张卡都发不出去', sentCards(), []);

const saved = await callRoute(app.routes.find((route) => route.path === CREDENTIALS_ROUTE), {
  body: { appId: 'cli_new', appSecret: 'secret_new' },
});
await tick(30);
check.eq('配好凭据后回的快照说配置上了', saved.json.appIdConfigured, true);
check.eq('配好凭据就建连', registry.calls.filter((call) => call.kind === 'ws.start').length, 1);
check.eq('连上之后补一张通告卡', sentCards().length, 1);
check.eq('通告卡发给了绑定的那个人', registry.calls.find((call) => call.kind === 'message.create').receiveId, 'ou_boss');
check.eq('没有换卡这回事', patchedCards(), []);
check.ok('通告里带上了当前会话', cardText(sentCards()[0]).includes('sess-1'));

check.finish();
