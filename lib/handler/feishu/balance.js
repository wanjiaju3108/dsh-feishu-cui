/** 余额卡片：菜单里点「余额」时，发一张「账户余额」卡片给点菜单的那个人。 */

import {
  BALANCE_CARD_TITLE,
  BALANCE_TOTAL_LINE,
  BALANCE_TOP_UP_LINE,
  BALANCE_UNAVAILABLE_TEXT,
} from '../../copy.js';
import { formatBalance } from '../../infra/host/balance.js';
import { buildHeaderTextCard } from '../../ui/text-card.js';

/** 这个菜单项的 `event_key`。 */
export const BALANCE_KEY = 'balance';

/** 充值页地址。 */
const TOP_UP_URL = 'https://platform.deepseek.com/top_up';

/**
 * 建余额处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.balance 余额读取器（`infra/host/balance.js` 的 `createBalanceReader`）
 * @returns pushBalance
 */
export function createBalanceHandler({ logger, push, balance }) {
  /**
   * 发一张「账户余额」卡片给点菜单的人。
   *
   * @param cuiEvent CUI 事件（点菜单的人从 `cuiEvent.operatorId` 取）
   */
  async function pushBalance(cuiEvent) {
    const openId = cuiEvent?.operatorId ?? '';
    const money = await balance.readBalance();
    const content = money
      ? [BALANCE_TOTAL_LINE(formatBalance(money)), '', BALANCE_TOP_UP_LINE(TOP_UP_URL)].join('\n')
      : BALANCE_UNAVAILABLE_TEXT;
    await push.sendCard({ openId }, buildHeaderTextCard({ title: BALANCE_CARD_TITLE, color: 'blue', content }));
    logger.info('已发出账户余额卡片');
  }

  return { pushBalance };
}
