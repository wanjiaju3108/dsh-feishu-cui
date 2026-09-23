/** 飞书事件：这个插件要收的那三类事件名，以及要收的事件清单。 */

/** 私聊消息事件名：user 发一句话就是一次提问。 */
export const MESSAGE_RECEIVE_EVENT_TYPE = 'im.message.receive_v1';

/** 机器人菜单点击事件名。 */
export const MENU_EVENT_TYPE = 'application.bot.menu_v6';

/** 卡片回调事件名。 */
export const CARD_ACTION_EVENT_TYPE = 'card.action.trigger';

/** 要收的事件清单：长连接按它登记处理函数。 */
export const SUBSCRIBED_EVENT_TYPES = [
  MESSAGE_RECEIVE_EVENT_TYPE,
  MENU_EVENT_TYPE,
  CARD_ACTION_EVENT_TYPE,
];
