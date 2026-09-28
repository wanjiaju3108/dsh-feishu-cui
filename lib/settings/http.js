/** 设置页路由的 HTTP 约定：只服务本机回环，入参出参都走 JSON；出错回的是机器标记（`loopback-only` / `host-not-loopback` / `cross-origin` / `method-only` / `body-too-large` / `body-not-json`），给人看的话由设置页那半边翻。 */

/** 请求体大小上限（32KB）。 */
export const MAX_BODY_BYTES = 32 * 1024;

/** `Host` 头里允许出现的主机名。 */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * 取 `Host` 头或 `Origin` 头里的主机部分。
 *
 * @param value `Host` 头（`127.0.0.1:5140`）或 `Origin` 头（`http://127.0.0.1:5140`）
 * @param withScheme 传进来的是不是带协议的 `Origin`
 * @returns `{ host, hostname }`；解析不了时 undefined
 */
function parseHost(value, withScheme) {
  try {
    const url = new URL(withScheme ? value : `http://${value}`);
    return { host: url.host, hostname: url.hostname };
  } catch {
    return undefined;
  }
}

/**
 * 本机回环之外的两道检查：`Host` 必须是回环主机名，写请求带 `Origin` 时必须和 `Host` 同源。
 *
 * 回环地址只说明连接来自本机，本机浏览器里打开的任意网页也能往 127.0.0.1 发请求：
 * - `text/plain` 的 POST 不走预检，请求会被执行，只是对方读不到响应——靠 `Origin` 与 `Host` 比对挡住；
 * - DNS rebinding 能让对方页面变成"同源"并读到响应（例如配对码）——这时 `Host` 是对方的域名，靠回环主机名挡住。
 *
 * 没带 `Host` 的请求不是浏览器发的，放行。
 *
 * @param req 请求
 * @param method 这条路由允许的方法
 * @returns 没通过时的机器标记；通过时空串
 */
function originBlockedReason(req, method) {
  const hostHeader = req.headers?.host;
  if (!hostHeader) return '';
  const host = parseHost(hostHeader, false);
  if (!host || !LOOPBACK_HOSTNAMES.has(host.hostname)) return 'host-not-loopback';
  const originHeader = req.headers?.origin;
  if (method === 'GET' || !originHeader) return '';
  const origin = parseHost(originHeader, true);
  return origin?.host === host.host ? '' : 'cross-origin';
}

/**
 * 注册一条 JSON 路由（只判回环与方法）。
 *
 * @param deps.ctx Cordis 上下文
 * @param deps.webServer Web 服务器
 * @param deps.path 路径
 * @param deps.method 允许的方法
 * @param deps.handle 处理函数，返回要回给页面的 JSON
 */
export function registerJsonRoute({ ctx, webServer, path, method, handle }) {
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path,
    handler: async (req, res) => {
      const address = req.socket?.remoteAddress ?? '';
      const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
      const reply = (status, body) => {
        res.statusCode = status;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(JSON.stringify(body));
      };
      if (!loopback) return reply(403, { error: 'loopback-only' });
      const blocked = originBlockedReason(req, method);
      if (blocked) return reply(403, { error: blocked });
      if (req.method !== method) {
        res.setHeader('allow', method);
        return reply(405, { error: 'method-only', method });
      }

      try {
        const body = method === 'GET' ? {} : await readJsonBody(req);
        reply(200, await handle(body));
      } catch (error) {
        reply(400, { error: error?.message ?? String(error) });
      }
    },
  }), `dsh-feishu-cui: ${path} route`);
}

/**
 * 读并解析请求体 JSON。
 *
 * @param req 请求
 * @returns 解析结果
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body-too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('body-not-json'));
      }
    });
  });
}
