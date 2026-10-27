/** 飞书消息的读数：文本正文，以及图片/文件消息、富文本消息里的资源键。 */

/** 飞书文本消息类型。 */
export const TEXT_MESSAGE_TYPE = 'text';

/** 飞书图片消息类型。 */
export const IMAGE_MESSAGE_TYPE = 'image';

/** 飞书文件消息类型。 */
export const FILE_MESSAGE_TYPE = 'file';

/** 飞书富文本消息类型。 */
export const POST_MESSAGE_TYPE = 'post';

/**
 * 解析消息的 content JSON；解析不了时返回空对象。
 *
 * @param message 飞书消息
 * @returns content 对象
 */
function parseContent(message) {
  try {
    const parsed = JSON.parse(message?.content ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 读富文本消息里的文字与图片/文件节点。
 *
 * @param message 飞书富文本消息
 * @returns `{ text, attachments }`
 */
function readPostContent(message) {
  const parsed = parseContent(message);
  const paragraphs = Array.isArray(parsed.content) ? parsed.content : [];
  const lines = typeof parsed.title === 'string' && parsed.title.trim() !== '' ? [parsed.title.trim()] : [];
  const attachments = [];

  for (const paragraph of paragraphs) {
    const line = [];
    for (const node of Array.isArray(paragraph) ? paragraph : []) {
      switch (node?.tag) {
        case 'text':
        case 'a':
          line.push(typeof node.text === 'string' ? node.text : '');
          break;
        case 'at':
          line.push(typeof node.user_name === 'string' ? `@${node.user_name}` : '');
          break;
        case 'img':
          if (typeof node.image_key === 'string' && node.image_key !== '') {
            attachments.push({ kind: 'image', key: node.image_key, name: '' });
          }
          break;
        case 'media':
          if (typeof node.file_key === 'string' && node.file_key !== '') {
            attachments.push({ kind: 'file', key: node.file_key, name: '' });
          }
          break;
        default:
          break;
      }
    }
    lines.push(line.join(''));
  }

  return { text: lines.join('\n').trim(), attachments };
}

/**
 * 读一条飞书消息的正文和附件。
 *
 * @param message 飞书消息
 * @returns `{ text, attachments }`；附件是 `{ kind: 'image'|'file', key, name }` 数组
 */
export function readMessageContent(message) {
  const type = message?.message_type;

  if (type === TEXT_MESSAGE_TYPE) {
    const text = parseContent(message).text;
    return { text: typeof text === 'string' ? text.trim() : '', attachments: [] };
  }

  if (type === IMAGE_MESSAGE_TYPE) {
    const key = parseContent(message).image_key;
    return {
      text: '',
      attachments: typeof key === 'string' && key !== '' ? [{ kind: 'image', key, name: '' }] : [],
    };
  }

  if (type === FILE_MESSAGE_TYPE) {
    const content = parseContent(message);
    const key = content.file_key;
    if (typeof key !== 'string' || key === '') return { text: '', attachments: [] };
    return {
      text: '',
      attachments: [{
        kind: 'file',
        key,
        name: typeof content.file_name === 'string' ? content.file_name : '',
      }],
    };
  }

  if (type === POST_MESSAGE_TYPE) return readPostContent(message);

  return { text: '', attachments: [] };
}

