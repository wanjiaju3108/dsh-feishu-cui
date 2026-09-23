/**
 * 假的 @larksuiteoapi/node-sdk。
 *
 * 长连接事件可以手动派发、REST 调用全部记账，这样测试不打真飞书也能跑通
 * 「收到消息 → 交给会话 → 回写飞书」整条链路。配合 `lark-hooks.mjs` 把插件里的
 * `@larksuiteoapi/node-sdk` 换成本文件。
 */

export const Domain = { Feishu: 'https://open.feishu.cn', Lark: 'https://open.larksuite.com' };

export const LoggerLevel = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 };

/** 记账与句柄：测试从这里读调用序列、派发事件、注入失败。 */
export const registry = {
  /** 每次 REST 调用与每次启停长连接都记一条。 */
  calls: [],
  /** 长连接的事件派发器：测试用它 `dispatch` 一条飞书事件。 */
  dispatcher: undefined,
  /** 最近建的那条长连接的选项：测试核对喂给 SDK 的配置。 */
  wsOptions: undefined,
  /** 消息 ID 的自增号。 */
  seq: 0,
  /** 接下来这么多次发送直接抛错，用来测重试。 */
  throwTimes: 0,
  /** 接口返回的业务码；非 0 表示被拒。 */
  code: 0,
  /** `getConnectionStatus()` 报的状态；测试可以直接改。 */
  state: 'connected',
};

/** 把账清干净。 */
export function resetRegistry() {
  registry.calls.length = 0;
  registry.seq = 0;
  registry.throwTimes = 0;
  registry.code = 0;
  registry.state = 'connected';
}

/**
 * 记一次发送，并给出飞书那样的响应体。
 *
 * @param record 要记下来的那条
 * @returns 飞书接口的响应体
 */
function send(record) {
  if (registry.throwTimes > 0) {
    registry.throwTimes -= 1;
    throw new Error('飞书接口暂时不可用');
  }
  registry.seq += 1;
  const messageId = record.messageId ?? `om_sent_${registry.seq}`;
  registry.calls.push({ ...record, messageId });
  return { code: registry.code, msg: registry.code === 0 ? 'ok' : '被拒了', data: { message_id: messageId } };
}

/** 飞书事件派发器。 */
export class EventDispatcher {
  constructor() {
    /** 事件名 → 插件注册的处理函数。 */
    this.handlers = new Map();
    registry.dispatcher = this;
  }

  /**
   * 记号簿。
   *
   * @param map 事件名到处理函数的映射
   */
  register(map) {
    for (const [type, handler] of Object.entries(map)) this.handlers.set(type, handler);
  }

  /**
   * 派发一条飞书事件给插件。
   *
   * @param type 事件名
   * @param data 事件载荷
   * @returns 插件的处理结果
   */
  async dispatch(type, data) {
    const handler = this.handlers.get(type);
    if (!handler) throw new Error(`插件没有注册 ${type}`);
    return handler(data);
  }
}

/** 长连接客户端。 */
export class WSClient {
  constructor(options) {
    this.options = options;
    registry.wsOptions = options;
  }

  /**
   * 启起来：假 SDK 立刻报"连上了"，跟真 SDK 的 `onReady` 一样。
   *
   * @param deps.eventDispatcher 事件派发器
   */
  start({ eventDispatcher }) {
    this.dispatcher = eventDispatcher;
    registry.calls.push({ kind: 'ws.start' });
    this.options?.onReady?.();
  }

  /** 关掉。 */
  close() {
    registry.calls.push({ kind: 'ws.close' });
  }

  /**
   * 连接状态。
   *
   * @returns SDK 那样的状态对象
   */
  getConnectionStatus() {
    return { state: registry.state };
  }
}

/** REST 客户端：只做插件真正会调的那三个接口。 */
export class Client {
  constructor(options) {
    this.options = options;
    this.im = {
      message: {
        reply: async ({ path, data }) => send({
          kind: 'message.reply',
          targetMessageId: path.message_id,
          msgType: data.msg_type,
          content: data.content,
        }),
        create: async ({ params, data }) => send({
          kind: 'message.create',
          receiveId: data.receive_id,
          receiveIdType: params?.receive_id_type,
          msgType: data.msg_type,
          content: data.content,
        }),
        patch: async ({ path, data }) => send({
          kind: 'message.patch',
          targetMessageId: path.message_id,
          content: data.content,
        }),
      },
    };
  }
}
