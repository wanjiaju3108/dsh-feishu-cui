/** 配对：推送配对码、验证配对码。骨架走 `input-card-flow.js`。 */

import { clearPairingCode, readPairingCode, setPairingCode } from '../../cache/pairing.js';
import { readSettings, writeSettings } from '../../infra/plugin/config.js';
import { createPairingCode, normalizePairingText } from '../../infra/plugin/pairing-code.js';
import { buildInputCard } from '../../ui/input-card.js';
import { createInputCardFlow } from './input-card-flow.js';
import {
  CANCEL_TEXT,
  CONFIRM_TEXT,
  INPUT_CARD_STALE_TEXT,
  PAIRING_ALREADY_BOUND_TEXT,
  PAIRING_CANCELLED_TEXT,
  PAIRING_CARD_DESCRIPTION,
  PAIRING_CARD_PLACEHOLDER,
  PAIRING_CARD_TITLE,
  PAIRING_CODE_EXPIRED_TEXT,
  PAIRING_CODE_WRONG_TEXT,
  PAIRING_SUCCESS_TEXT,
} from '../../common/copy.js';

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
  const flow = createInputCardFlow({
    logger,
    push,
    key: PAIRING_KEY,
    label: '配对卡片',
    cancelledText: PAIRING_CANCELLED_TEXT,
    staleText: INPUT_CARD_STALE_TEXT,

    /**
     * 已经绑过就只回一句话；没绑过就现铸一个码，发输入框卡片。
     *
     * @returns `{ card }` 或 `{ text }`
     */
    readCard: async () => {
      if (readSettings().userId) return { text: PAIRING_ALREADY_BOUND_TEXT };
      setPairingCode(createPairingCode());
      logger.info('已生成配对码');
      return {
        card: buildInputCard({
          tag: PAIRING_KEY,
          title: PAIRING_CARD_TITLE,
          description: PAIRING_CARD_DESCRIPTION,
          placeholder: PAIRING_CARD_PLACEHOLDER,
          confirmText: CONFIRM_TEXT,
          cancelText: CANCEL_TEXT,
        }),
      };
    },

    /**
     * 确定：比对用户填的码，对了就把填的那个人记成 user。
     *
     * @param deps.typed 用户在输入框里填的内容
     * @param deps.cuiEvent CUI 事件（填的人从 `cuiEvent.operatorId` 取）
     * @returns `{ text }`；取不到 open_id 时 undefined
     */
    onSubmit: async ({ typed, cuiEvent }) => {
      const openId = cuiEvent?.operatorId ?? '';
      if (!openId) {
        logger.warn('卡片回调里取不到 open_id，配对不成立');
        return undefined;
      }

      const expected = readPairingCode();
      if (!expected) {
        logger.warn('这次提交没有在册的配对码（过期 / 用过 / 已作废），忽略');
        return { text: PAIRING_CODE_EXPIRED_TEXT };
      }

      if (normalizePairingText(typed) !== expected) {
        logger.warn('配对码不对，这次提交不处理');
        return { text: PAIRING_CODE_WRONG_TEXT };
      }

      await writeSettings({ ...readSettings(), userId: openId });
      clearPairingCode();
      logger.info('配对成功，user 已记下');
      return { text: PAIRING_SUCCESS_TEXT };
    },

    /** 取消：在册的配对码一并作废。 */
    onCancel: () => {
      clearPairingCode();
      logger.info('申请配对已取消，在册的配对码一并作废');
    },
  });

  return { pushPairingCode: flow.pushCard, verifyPairingCode: flow.handleCardAction };
}
