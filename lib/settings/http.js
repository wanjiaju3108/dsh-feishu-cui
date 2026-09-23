/** 设置页路由的 HTTP 约定：只服务本机回环，入参出参都走 JSON；出错回的是机器标记（`loopback-only` / `method-only` / `body-too-large` / `body-not-json`），给人看的话由设置页那半边翻。 */

/** 请求体大小上限（32KB）。 */
export const MAX_BODY_BYTES = 32 * 1024;

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
