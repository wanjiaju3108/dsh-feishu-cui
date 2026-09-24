/**
 * 测试脚手架：import lib 的路径、断言、记账日志、假出站、假设置，以及「真起一个插件实例」要用的
 * 假 ctx、假宿主服务、假飞书 SDK。
 *
 * 各用例只关心自己的场景，公共部分都在这里；不引任何测试框架，`node test/all.mjs` 直接跑。
 */

import { realpathSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * test/ 里某个文件的绝对 URL。
 *
 * @param relative 相对 `test/` 的路径
 * @returns 可以 import 的 URL
 */
function testUrl(relative) {
  return pathToFileURL(realpathSync(fileURLToPath(new URL(relative, import.meta.url)))).href;
}

/**
 * lib 里某个文件的绝对 URL。
 *
 * @param relative 相对 `lib/` 的路径，例如 `driving/feishu/admission.js`
 * @returns 可以 import 的 URL
 */
export function libUrl(relative) {
  return pathToFileURL(realpathSync(fileURLToPath(new URL(`../lib/${relative}`, import.meta.url)))).href;
}

/** 断言收集器：跑完调用 `finish()`，有失败就以非 0 退出。 */
export function createCheck() {
  let bad = 0;
  return {
    /**
     * 断言两个值（按 JSON 比）。
     *
     * @param name 这条断言叫什么
     * @param actual 实际值
     * @param expected 期望值
     */
    eq(name, actual, expected) {
      if (JSON.stringify(actual) === JSON.stringify(expected)) {
        console.log(`ok   ${name}`);
        return;
      }
      bad += 1;
      console.log(`FAIL ${name}\n  want ${JSON.stringify(expected)}\n  got  ${JSON.stringify(actual)}`);
    },

    /**
     * 断言一个条件成立。
     *
     * @param name 这条断言叫什么
     * @param condition 条件
     */
    ok(name, condition) {
      if (condition) {
        console.log(`ok   ${name}`);
        return;
      }
      bad += 1;
      console.log(`FAIL ${name}`);
    },

    /** 收尾：全过就 0，有失败就 1。 */
    finish() {
      console.log(bad === 0 ? '\nALL PASS' : `\n${bad} FAILED`);
      process.exit(bad ? 1 : 0);
    },
  };
}

/** 记账日志：用例可以断言"有没有留下某一类日志"。 */
export function createLogger() {
  const lines = { info: [], warn: [], error: [] };
  const push = (kind) => (line) => lines[kind].push(String(line));
  return { lines, logger: { info: push('info'), warn: push('warn'), error: push('error') } };
}

/** 假出站句柄：`sendCard` 收进 `sent`，`patchCard` 收进 `patched`，消息 ID 可预期。 */
export function createPush() {
  const sent = [];
  const patched = [];
  return {
    sent,
    patched,
    push: {
      async sendCard(target, card) {
        sent.push({ target, card });
        return `m${sent.length}`;
      },
      async patchCard(messageId, card) {
        patched.push({ messageId, card });
      },
    },
  };
}

/**
 * 造一份条目 config：三个字段都是带 `get()` 的引用，跟 Loader 给 volatile 字段的那种引用一样。
 *
 * `lib/infra/plugin/config.js` 的 `readConfigField` 认这种形状，所以插件写回设置之后再读 config
 * 拿到的是新值；换成一个死的普通对象，写回就读不到了。
 *
 * @param readStored 读当前存下来的那份设置：`() => ({ sessionId, userId, workspaceId })`
 * @returns config 对象
 */
function liveConfig(readStored) {
  return {
    sessionId: { get: () => readStored().sessionId },
    userId: { get: () => readStored().userId },
    workspaceId: { get: () => readStored().workspaceId },
  };
}

/**
 * 装一份只在内存里的设置，返回读它、改它的入口。
 *
 * 直接把 `cache/settings-handle.js` 的句柄塞上，等价于插件启动时 `registerSettings` 做完的那件事。
 *
 * @param initial 初始值（`sessionId` / `userId` / `workspaceId`，缺的补空串）
 * @returns `{ read, set }`
 */
export async function installSettings(initial = {}) {
  const { setSettingsHandle } = await import(libUrl('cache/settings-handle.js'));
  let stored = { sessionId: '', userId: '', workspaceId: '', ...initial };
  setSettingsHandle({
    settings: {
      update: async (namespace, next) => {
        stored = { ...next };
      },
    },
    config: liveConfig(() => stored),
  });
  return {
    read: () => stored,
    set: (next) => {
      stored = { ...stored, ...next };
    },
  };
}

/**
 * 把一张卡片对象里的所有 `content` 文本抠出来，用来断言"回的是哪句话"。
 *
 * @param card 卡片对象
 * @returns 文本按出现顺序拼成的串
 */
export function cardText(card) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (typeof node.content === 'string') out.push(node.content);
    Object.values(node).forEach(walk);
  };
  walk(card);
  return out.join('\n');
}

/**
 * 取一张卡片的正文（只看 markdown 元素，不要标题栏与按钮上的字）。
 *
 * @param card 卡片对象
 * @returns 正文
 */
export function bodyText(card) {
  const elements = card?.body?.elements ?? [];
  return elements.filter((element) => element.tag === 'markdown').map((element) => element.content).join('\n');
}

/**
 * 取卡片回调响应里那张新卡片。
 *
 * @param response `cardResponse(...)` 的返回值
 * @returns 卡片对象；没有时 undefined
 */
export function responseCard(response) {
  return response?.card?.data;
}

/** 等一拍，让 `setTimeout(..., 0)` 那类后台提交跑完。 */
export function tick(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------- 起一个插件实例

register(testUrl('./lark-hooks.mjs'));
const { registry } = await import(testUrl('./fake-lark.mjs'));

export { registry };

/** 清掉记账，只留长连接的句柄（插件启动时那条「已连接」通告要单独处理时就靠它）。 */
export function resetCalls() {
  registry.calls.length = 0;
}

/** 飞书那边收到的消息（回复 / 主动私聊），按发生顺序。 */
export function sentMessages() {
  return registry.calls.filter((call) => call.kind === 'message.reply' || call.kind === 'message.create');
}

/** 飞书那边收到的卡片，按发生顺序。 */
export function sentCards() {
  return sentMessages().map((call) => JSON.parse(call.content));
}

/** 飞书那边被换掉的卡片（`message.patch`），按发生顺序。 */
export function patchedCards() {
  return registry.calls.filter((call) => call.kind === 'message.patch').map((call) => JSON.parse(call.content));
}

/**
 * 造一条会话记录，形状跟 `sessionQuery.listSessions()` 给的一样。
 *
 * @param deps.id 会话 ID
 * @param deps.title 标题
 * @param deps.cwd 工作目录
 * @param deps.turns 跑过几轮；0 表示没跑过
 * @param deps.lastPromptAt 最近一次提问的时刻，用来排序
 * @returns 记录
 */
export function sessionRecord({ id, title = `会话 ${id}`, cwd = '/tmp/ws', turns = 1, lastPromptAt = 1 }) {
  return {
    header: {
      id,
      cwd,
      createdAt: 1,
      isSeeded: false,
      projection: { values: { title, sessionStats: { turns }, sessionListMetadata: { lastPromptAt } } },
    },
  };
}

/**
 * 直接调一条设置页路由：造假的请求与响应，喂完请求体。
 *
 * @param route 注册上来的那条路由
 * @param deps.body 请求体对象（会序列化成 JSON）
 * @param deps.raw 原始请求体；给了就不看 `body`（用来送非法 JSON）
 * @param deps.method 方法，默认 POST
 * @param deps.remoteAddress 来源地址，默认本机
 * @returns `{ status, headers, json }`
 */
export async function callRoute(route, { body = {}, raw, method = 'POST', remoteAddress = '127.0.0.1' } = {}) {
  const listeners = new Map();
  const req = {
    method,
    socket: { remoteAddress },
    on: (event, handler) => {
      listeners.set(event, handler);
      return req;
    },
    destroy: () => {},
  };
  const headers = {};
  let payload = '';
  const res = {
    statusCode: 0,
    setHeader: (name, value) => { headers[name] = value; },
    end: (text) => { payload = text; },
  };

  const handled = route.handler(req, res);
  listeners.get('data')?.(Buffer.from(raw ?? JSON.stringify(body), 'utf8'));
  listeners.get('end')?.();
  await handled;
  await tick(20);
  return { status: res.statusCode, headers, json: payload ? JSON.parse(payload) : undefined };
}

/**
 * 起一个插件实例：真的调 `lib/index.js` 的 `apply()`，只有 ctx、宿主服务和飞书 SDK 是假的。
 *
 * @param options.sessionId 初始的当前会话
 * @param options.userId 初始绑定的 user
 * @param options.workspaceId 初始的当前工作区
 * @param options.credentials 初始凭据（`null` 表示当作没配）
 * @param options.sessionRecords `sessionQuery.listSessions()` 给什么
 * @param options.workspaces `workspaceRegistry.list()` 给什么
 * @param options.controller 覆盖假会话控制器上的某个方法
 * @returns 句柄：事件入口、记账、假服务上的调用记录、设置与凭据的当前值
 */
export async function startPlugin({
  sessionId = 'sess-1',
  userId = 'ou_boss',
  workspaceId = 'ws-1',
  credentials = { appId: 'cli_stub', appSecret: 'secret_stub' },
  sessionRecords = [sessionRecord({ id: sessionId })],
  workspaces = [{ id: 'ws-1', title: '默认工作区', path: '/tmp/ws', sessionIds: [sessionId] }],
  controller: overrides = {},
} = {}) {
  /** 内存里的设置。 */
  let stored = { sessionId, userId, workspaceId };

  /** 内存里的凭据。 */
  const credentialStore = new Map();
  if (credentials?.appId) credentialStore.set('FEISHU_CUI_APP_ID', credentials.appId);
  if (credentials?.appSecret) credentialStore.set('FEISHU_CUI_APP_SECRET', credentials.appSecret);
  const credentialsService = {
    resolve: async (ref) => (credentialStore.has(ref) ? { value: credentialStore.get(ref) } : undefined),
    describe: async (ref) => ({ configured: credentialStore.has(ref), writable: true }),
    set: async (ref, value) => { credentialStore.set(ref, value); },
  };

  /** 假会话控制器上的调用记录。 */
  const calls = {
    resolveAgent: [], create: [], prompt: [], cancel: [], updateQueue: [], rename: [], modelCatalog: [], selectModel: [],
  };
  const controller = {
    resolveAgent: async (id) => {
      calls.resolveAgent.push(id);
      return { agent: { session: { id } } };
    },
    create: async (request) => {
      calls.create.push(request);
      return { sessionId: 'sess-new' };
    },
    prompt: async (request) => {
      calls.prompt.push(request);
      return {};
    },
    cancel: async (request) => {
      calls.cancel.push(request);
      return { accepted: true };
    },
    updateQueue: async (request) => {
      calls.updateQueue.push(request);
      return { accepted: true };
    },
    rename: async (request) => {
      calls.rename.push(request);
      return { title: request.title, seq: 1 };
    },
    modelCatalog: async () => {
      calls.modelCatalog.push({});
      return { groups: [], failures: [] };
    },
    selectModel: async (request) => {
      calls.selectModel.push(request);
      return { selected: request };
    },
    ...overrides,
  };

  const services = {
    sessionController: controller,
    sessionQuery: { listSessions: async () => sessionRecords },
    sessionProjectionCache: {
      cachedSnapshot: (header) => header.projection,
      cachedPredecessorTitle: () => undefined,
    },
    sessionProjections: { stateOf: () => undefined },
    sessions: { get: () => undefined },
    permissionPresets: { list: () => [], nameOf: (name) => name, set: () => {} },
    workspaceRegistry: {
      list: () => workspaces,
      archivedSessionIds: () => [],
    },
    settings: {
      configure: () => {},
      update: async (namespace, next) => { stored = { ...next }; },
    },
    credentials: credentialsService,
    webServer: { register: (route) => { routes.push(route); return () => {}; } },
  };

  /** 注册上去的三条设置页路由。 */
  const routes = [];

  /** 订阅到的事件：事件名 → 处理函数列表。 */
  const subscribers = new Map();

  const { logger, lines } = createLogger();
  const namespaceLogger = () => logger;
  namespaceLogger.exporter = () => {};

  const ctx = {
    logger: namespaceLogger,
    get: (name) => services[name],
    on: (event, handler) => {
      const list = subscribers.get(event) ?? [];
      list.push(handler);
      subscribers.set(event, list);
      return () => {
        const live = subscribers.get(event) ?? [];
        subscribers.set(event, live.filter((item) => item !== handler));
      };
    },
    effect: (fn) => fn(),
  };

  const plugin = await import(libUrl('index.js'));
  await plugin.apply(ctx, liveConfig(() => stored));

  /**
   * 收一条私聊消息。
   *
   * @param deps.messageId 飞书消息 ID
   * @param deps.text 正文（文本消息用）
   * @param deps.messageType 消息类型，默认 text；给别的值就是非文本消息
   * @param deps.content 消息体原文；给了就不看 `text`
   * @param deps.openId 发消息的人
   */
  const incoming = ({
    messageId, text = '', messageType = 'text', content, openId = stored.userId,
  }) => registry.dispatcher.dispatch('im.message.receive_v1', {
    message: {
      chat_type: 'p2p',
      message_id: messageId,
      message_type: messageType,
      content: content ?? JSON.stringify({ text }),
      create_time: String(Date.now()),
    },
    sender: { sender_id: { open_id: openId } },
  });

  /**
   * 点一次机器人菜单。
   *
   * @param eventKey 菜单项的 `event_key`
   * @param deps.openId 点菜单的人
   */
  const menu = (eventKey, { openId = stored.userId } = {}) => registry.dispatcher.dispatch('application.bot.menu_v6', {
    event_key: eventKey,
    operator: { operator_id: { open_id: openId } },
    create_time: Date.now(),
  });

  /**
   * 点一次卡片按钮。
   *
   * @param value 按钮回传的 `action.value`
   * @param deps.openId 点的人
   * @param deps.messageId 卡片所在消息 ID
   * @param deps.formValue 表单值（输入框卡片用）
   */
  const cardAction = (value, { openId = stored.userId, messageId = 'om_sent_1', formValue } = {}) => (
    registry.dispatcher.dispatch('card.action.trigger', {
      context: { open_message_id: messageId },
      operator: { open_id: openId },
      action: { value, ...(formValue === undefined ? {} : { form_value: formValue }) },
      create_time: Date.now(),
    })
  );

  /**
   * 派发一条宿主会话事件。
   *
   * @param event `{ type, data }`
   * @param session 事件所属会话
   */
  const sessionEvent = (event, session = { id: stored.sessionId }) => {
    const handlers = subscribers.get('session/event') ?? [];
    for (const handler of handlers) handler(session, event);
  };

  /**
   * 派发一条宿主 agent 事件。
   *
   * @param tag `agent/` 后面那段
   * @param payload 宿主载荷
   */
  const agentEvent = (tag, payload) => {
    const handlers = subscribers.get(`agent/${tag}`) ?? [];
    for (const handler of handlers) handler(payload);
  };

  /**
   * 走一次宿主那条「要人答」的请求。
   *
   * @param event 事件名（`user-questions/request` / `approval/request`）
   * @param request 宿主给的请求
   * @param next 让给下一个回答者时的返回值
   * @returns 插件给出的答案
   */
  const ask = (event, request, next = async () => 'next') => {
    const handler = (subscribers.get(event) ?? [])[0];
    if (!handler) throw new Error(`插件没有订阅 ${event}`);
    return handler(request, next);
  };

  return {
    ctx,
    plugin,
    logger,
    lines,
    routes,
    calls,
    services,
    /** 直接读/改内存里的设置。 */
    settings: { read: () => stored, set: (next) => { stored = { ...stored, ...next }; } },
    /** 直接读内存里的凭据。 */
    credentials: () => Object.fromEntries(credentialStore),
    incoming,
    menu,
    cardAction,
    sessionEvent,
    agentEvent,
    ask,
    subscribers,
  };
}

