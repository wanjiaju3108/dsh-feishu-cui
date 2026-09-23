/** 配对：推送配对码、验证配对码。 */

import { clearMenuCard } from '../../cache/pending-cards.js';
import { clearPairingCode, readPairingCode, setPairingCode } from '../../cache/pairing.js';
import { readSettings, writeSettings } from '../../infra/plugin/config.js';
import { createPairingCode, normalizePairingText } from '../../infra/plugin/pairing-code.js';
import { cardResponse } from '../../ui/card.js';
import { INPUT_CARD_CANCEL, INPUT_CARD_FIELD_NAME, buildInputCard } from '../../ui/input-card.js';
import { buildTextCard } from '../../ui/text-card.js';
import { createPendingCard } from './pending-card.js';
import {
  PAIRING_ALREADY_BOUND_TEXT,
  PAIRING_CANCEL_TEXT,
  PAIRING_CANCELLED_TEXT,
  PAIRING_CARD_DESCRIPTION,
  PAIRING_CARD_PLACEHOLDER,
  PAIRING_CARD_TITLE,
  PAIRING_CODE_EXPIRED_TEXT,
  PAIRING_CODE_WRONG_TEXT,
  PAIRING_CONFIRM_TEXT,
  PAIRING_SUCCESS_TEXT,
} from '../../copy.js';

/** 这个菜单项的 `event_key`，也是输入框卡片的卡片类型。 */
export const PAIRING_KEY = 'pairing';

/**
 * 建配对处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @returns pushPairingCode / verifyPairingCode
 */
export function createPairingHandler({ logger, push }) {
  const liveCard = createPendingCard({ logger, push });

  /**
   * 推送配对码：用户点菜单「申请配对」时走这里。
   *
   * @param cuiEvent CUI 事件（点菜单的人从 `cuiEvent.operatorId` 取）
   */
  async function pushPairingCode(cuiEvent) {
    const openId = cuiEvent?.operatorId ?? '';
    if (!openId) {
      logger.warn('菜单事件里取不到 open_id，配对码没有地方发');
      return;
    }
    if (readSettings().userId) {
      await push.sendCard({ openId }, buildTextCard(PAIRING_ALREADY_BOUND_TEXT));
      return;
    }
    await liveCard.cancel('又发了一张卡');
    setPairingCode(createPairingCode());
    const messageId = await push.sendCard({
      openId,
    }, buildInputCard({
      tag: PAIRING_KEY,
      title: PAIRING_CARD_TITLE,
      description: PAIRING_CARD_DESCRIPTION,
      placeholder: PAIRING_CARD_PLACEHOLDER,
      confirmText: PAIRING_CONFIRM_TEXT,
      cancelText: PAIRING_CANCEL_TEXT,
    }));
    liveCard.remember(PAIRING_KEY, messageId, PAIRING_CANCELLED_TEXT);
    logger.info('已生成配对码，输入框卡片已发到私聊');
  }

  /**
   * 验证配对码：用户在输入框卡片里点「确定」或「取消」时走这里。
   *
   * @param cuiEvent CUI 事件（按钮在 `content.value.btn`，用户输的在 `content.formValue` 里）
   * @returns 换卡响应
   */
  async function verifyPairingCode(cuiEvent) {
    const openId = cuiEvent?.operatorId ?? '';
    const btn = cuiEvent?.content?.value?.btn ?? '';

    if (btn === INPUT_CARD_CANCEL) {
      clearPairingCode();
      clearMenuCard();
      logger.info('申请配对已取消，在册的配对码一并作废');
      return cardResponse(buildTextCard(PAIRING_CANCELLED_TEXT));
    }

    if (!openId) {
      logger.warn('卡片回调里取不到 open_id，配对不成立');
      return undefined;
    }

    const expected = readPairingCode();
    if (!expected) {
      clearMenuCard();
      logger.warn('这次提交没有在册的配对码（过期 / 用过 / 已作废），忽略');
      return cardResponse(buildTextCard(PAIRING_CODE_EXPIRED_TEXT));
    }

    const typed = normalizePairingText(cuiEvent?.content?.formValue?.[INPUT_CARD_FIELD_NAME] ?? '');
    if (typed !== expected) {
      clearMenuCard();
      logger.warn('配对码不对，这次提交不处理');
      return cardResponse(buildTextCard(PAIRING_CODE_WRONG_TEXT));
    }

    await writeSettings({ ...readSettings(), userId: openId });
    clearPairingCode();
    clearMenuCard();
    logger.info('配对成功，user 已记下');
    return cardResponse(buildTextCard(PAIRING_SUCCESS_TEXT));
  }

  return { pushPairingCode, verifyPairingCode };
}
