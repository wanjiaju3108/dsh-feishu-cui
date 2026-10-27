/** 飞书图片/文件资源：按 message_type 里的 key 下载，图片转 base64，文件落到工作区。 */

import fs from 'node:fs/promises';
import path from 'node:path';

/** 图片读进内存的上限；飞书侧发送上限 10MB，这里留一倍余量兜底。 */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** 文件落盘的子目录名。 */
const UPLOAD_DIR = '.dsh-uploads';

/**
 * 从文件头判断图片类型。
 *
 * @param buffer 图片字节
 * @returns DSH 支持的 mediaType；认不出时为空串
 */
function mediaTypeOf(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 6 && buffer.toString('ascii', 0, 3) === 'GIF') {
    return 'image/gif';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return '';
}

/**
 * 把文件名收拾成可落盘的名字：去掉路径分隔符，保留中文与常见字符。
 *
 * @param name 原始文件名
 * @param fallback 没有名字时的兜底
 * @returns 安全的文件名
 */
function safeName(name, fallback) {
  const leaf = String(name || '').split(/[\\/]/).pop() ?? '';
  const cleaned = leaf.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
  return cleaned === '' ? fallback : cleaned;
}

/**
 * 建资源下载器。
 *
 * @param deps.logger 日志
 * @param deps.client 取当前 REST 客户端（`transport.rest()`）；没凭据时返回 undefined
 * @returns readImage / saveFile
 */
export function createResourceFetcher({ logger, client }) {
  /**
   * 下载一张图片。
   *
   * @param deps.imageKey 飞书图片 key
   * @param deps.messageId 图片所在消息 ID
   * @returns `{ mediaType, data }`（data 是 base64）；下载失败或格式不支持时 undefined
   */
  async function readImage({ imageKey, messageId }) {
    const live = client();
    if (!live) {
      logger.warn('没有飞书客户端，图片读不了');
      return undefined;
    }
    try {
      const response = await live.im.v1.messageResource.get({
        path: { message_id: messageId, file_key: imageKey },
        params: { type: 'image' },
      });
      const chunks = [];
      let total = 0;
      for await (const chunk of response.getReadableStream()) {
        total += chunk.length;
        if (total > MAX_IMAGE_BYTES) {
          logger.warn(`图片超过 ${MAX_IMAGE_BYTES} 字节，丢弃`);
          return undefined;
        }
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const mediaType = mediaTypeOf(buffer);
      if (!mediaType) {
        logger.warn('图片格式不支持，丢弃');
        return undefined;
      }
      return { mediaType, data: buffer.toString('base64') };
    } catch (error) {
      logger.warn(`下载图片失败：${error?.message ?? error}`);
      return undefined;
    }
  }

  /**
   * 下载一个文件，落到会话工作区的 `.dsh-uploads/` 下。
   *
   * @param deps.fileKey 飞书文件 key
   * @param deps.messageId 文件所在消息 ID
   * @param deps.name 原始文件名
   * @param deps.dir 会话工作区目录
   * @param deps.prefix 文件名前缀（用消息 ID 加附件序号，避免重名）
   * @returns 落盘后的绝对路径；失败时 undefined
   */
  async function saveFile({ fileKey, messageId, name, dir, prefix }) {
    const live = client();
    if (!live) {
      logger.warn('没有飞书客户端，文件读不了');
      return undefined;
    }
    try {
      const folder = path.join(dir, UPLOAD_DIR);
      await fs.mkdir(folder, { recursive: true });
      const target = path.join(folder, `${safeName(prefix, 'file')}_${safeName(name, 'file')}`);
      const response = await live.im.v1.messageResource.get({
        path: { message_id: messageId, file_key: fileKey },
        params: { type: 'file' },
      });
      await response.writeFile(target);
      return target;
    } catch (error) {
      logger.warn(`下载文件失败：${error?.message ?? error}`);
      return undefined;
    }
  }

  return { readImage, saveFile };
}
