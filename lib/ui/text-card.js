/** 文字卡片：只有正文的 `buildTextCard`，和「标题栏 + 正文」的 `buildHeaderTextCard`。 */

import { CARD_SCHEMA_VERSION, markdownElement } from './card.js';

/**
 * 造一张只有正文的卡片。
 *
 * @param content 正文（markdown）
 * @returns 卡片对象
 */
export function buildTextCard(content) {
  return {
    schema: CARD_SCHEMA_VERSION,
    body: {
      elements: [markdownElement(content)],
    },
  };
}

/**
 * 造一张带标题栏的卡片。
 *
 * @param deps.title 标题栏里的字
 * @param deps.content 正文（markdown）
 * @param deps.color 标题栏颜色（飞书 `InteractiveCardHeaderTemplate` 的取值）
 * @returns 卡片对象
 */
export function buildHeaderTextCard({ title, content, color }) {
  return {
    schema: CARD_SCHEMA_VERSION,
    header: {
      template: color,
      title: { tag: 'plain_text', content: title },
    },
    body: {
      elements: [markdownElement(content)],
    },
  };
}
