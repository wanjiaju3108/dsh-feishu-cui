/** 账户余额：查 DeepSeek 开放平台的 `GET /user/balance`，并把查到的钱格式化成一行文本。 */

/** 官方余额接口。 */
const BALANCE_URL = 'https://api.deepseek.com/user/balance';

/** 默认的凭据 ref，指向 DeepSeek 的 API key。 */
const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY';

/** 一次请求的超时（毫秒）。 */
const REQUEST_TIMEOUT_MS = 10000;

/**
 * 把查到的钱格式化成一行文本。
 *
 * @param money `{ currency, balance }`
 * @returns 形如 `¥64.18` 的文本
 */
export function formatBalance(money) {
  const symbol = String(money?.currency ?? '').toUpperCase() === 'CNY' ? '¥' : `${money?.currency ?? ''} `;
  return `${symbol}${Number(money?.balance ?? 0).toFixed(2)}`;
}

/**
 * 建一个余额读取器。
 *
 * @param deps.logger 日志
 * @param deps.credentials 宿主凭据服务（`ctx.get('credentials')`）
 * @param deps.apiKeyRef 凭据 ref，默认 `DEEPSEEK_API_KEY`
 * @returns `{ readBalance }`
 */
export function createBalanceReader({ logger, credentials, apiKeyRef = DEFAULT_API_KEY_ENV }) {
  /**
   * 查一次余额。
   *
   * @returns `{ currency, balance }`；读不到时 undefined
   */
  async function readBalance() {
    let key = '';
    try {
      key = (await credentials?.resolve(apiKeyRef))?.value ?? '';
    } catch (error) {
      logger.warn(`读凭据 ${apiKeyRef} 失败：${error?.message ?? error}`);
    }
    if (!key) {
      logger.warn(`凭据里没有 ${apiKeyRef}，余额读不出来`);
      return undefined;
    }

    try {
      const response = await fetch(BALANCE_URL, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        logger.warn(`余额请求失败：HTTP ${response.status}`);
        return undefined;
      }
      const payload = await response.json();
      const info = payload?.balance_infos?.[0];
      const total = Number(info?.total_balance);
      if (!Number.isFinite(total)) {
        logger.warn('余额响应里没有认得出的 total_balance');
        return undefined;
      }
      return { currency: String(info?.currency ?? 'CNY'), balance: total };
    } catch (error) {
      logger.warn(`余额请求失败：${error?.message ?? error}`);
      return undefined;
    }
  }

  return { readBalance };
}
