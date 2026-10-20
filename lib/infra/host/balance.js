/** 账户余额：从宿主的账户服务读钱包余额，并格式化成一行文本。 */

/** 查余额时上报给账户服务的客户端信息。 */
const BALANCE_CLIENT = { version: '0.4.2', locale: 'zh-CN', timezoneOffsetSeconds: 8 * 3600 };

/**
 * 把读到的钱格式化成一行文本。
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
 * 走宿主的账户服务（OAuth 登录那套），不再依赖 `DEEPSEEK_API_KEY`：
 * `getBalance()` 返回钱包数组，取 CNY，没有就用第一个。
 *
 * @param deps.logger 日志
 * @param deps.account 宿主账户服务（`ctx.get('deepseekAccount')`）
 * @returns `{ readBalance }`
 */
export function createBalanceReader({ logger, account }) {
  /**
   * 查一次余额。
   *
   * @returns `{ currency, balance }`；读不到时 undefined
   */
  async function readBalance() {
    if (account === undefined) {
      logger.warn('宿主没有 deepseekAccount，余额读不出来');
      return undefined;
    }

    let outcome;
    try {
      outcome = await account.getBalance(BALANCE_CLIENT);
    } catch (error) {
      logger.warn(`余额请求失败：${error?.message ?? error}`);
      return undefined;
    }

    if (outcome === null || outcome?.status !== 'ready') {
      logger.warn('账户服务没给出可用的余额（未登录或查询失败）');
      return undefined;
    }

    const wallets = Array.isArray(outcome.value) ? outcome.value : [];
    const wallet = wallets.find((item) => item.currency === 'CNY') ?? wallets[0];
    if (wallet === undefined) {
      logger.warn('余额里没有钱包');
      return undefined;
    }

    const total = Number(wallet.balance);
    if (!Number.isFinite(total)) {
      logger.warn('余额不是可解析的数字');
      return undefined;
    }

    return { currency: String(wallet.currency ?? 'CNY'), balance: total };
  }

  return { readBalance };
}
