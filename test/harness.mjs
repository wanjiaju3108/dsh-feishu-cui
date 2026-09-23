/**
 * 测试脚手架：import lib 的路径、断言、记账日志、假出站、假设置。
 *
 * 各用例只关心自己的场景，公共部分都在这里；不引任何测试框架，`node test/all.mjs` 直接跑。
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * lib 里某个文件的绝对 URL。
 *
 * @param relative 相对 `lib/` 的路径，例如 `driving/feishu/admission.js`
 * @returns 可以 import 的 URL
 */
export function libUrl(relative) {
  return pathToFileURL(realpathSync(fileURLToPath(new URL(`../lib/${relative}`, import.meta.url)))).href;
}

/** 断言收集器：跑完调用 `finish()`，有失败就以非 0 退出。 */
export function createCheck() {
  let bad = 0;
  return {
    /**
     * 断言两个值（按 JSON 比）。
     *
     * @param name 这条断言叫什么
     * @param actual 实际值
     * @param expected 期望值
     */
    eq(name, actual, expected) {
      if (JSON.stringify(actual) === JSON.stringify(expected)) {
        console.log(`ok   ${name}`);
        return;
      }
      bad += 1;
      console.log(`FAIL ${name}\n  want ${JSON.stringify(expected)}\n  got  ${JSON.stringify(actual)}`);
    },

    /**
     * 断言一个条件成立。
     *
     * @param name 这条断言叫什么
     * @param condition 条件
     */
    ok(name, condition) {
      if (condition) {
        console.log(`ok   ${name}`);
        return;
      }
      bad += 1;
      console.log(`FAIL ${name}`);
    },

    /** 收尾：全过就 0，有失败就 1。 */
    finish() {
      console.log(bad === 0 ? '\nALL PASS' : `\n${bad} FAILED`);
      process.exit(bad ? 1 : 0);
    },
  };
}

/** 记账日志：用例可以断言"有没有留下某一类日志"。 */
export function createLogger() {
  const lines = { info: [], warn: [], error: [] };
  const push = (kind) => (line) => lines[kind].push(String(line));
  return { lines, logger: { info: push('info'), warn: push('warn'), error: push('error') } };
}

/** 假出站句柄：`sendCard` 收进 `sent`，`patchCard` 收进 `patched`，消息 ID 可预期。 */
export function createPush() {
  const sent = [];
  const patched = [];
  return {
    sent,
    patched,
    push: {
      async sendCard(target, card) {
        sent.push({ target, card });
        return `m${sent.length}`;
      },
      async patchCard(messageId, card) {
        patched.push({ messageId, card });
      },
    },
  };
}

/**
 * 装一份只在内存里的设置，返回读它、改它的入口。
 *
 * @param initial 初始值（`sessionId` / `userId` / `workspaceId`，缺的补空串）
 * @returns `{ read, set }`
 */
export async function installSettings(initial = {}) {
  const { setSettingsScope } = await import(libUrl('cache/settings-scope.js'));
  let stored = { sessionId: '', userId: '', workspaceId: '', ...initial };
  setSettingsScope({
    get: () => stored,
    replace: async (next) => {
      stored = next;
    },
  });
  return {
    read: () => stored,
    set: (next) => {
      stored = { ...stored, ...next };
    },
  };
}

/**
 * 把一张卡片对象里的所有 `content` 文本抠出来，用来断言"回的是哪句话"。
 *
 * @param card 卡片对象
 * @returns 文本按出现顺序拼成的串
 */
export function cardText(card) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (typeof node.content === 'string') out.push(node.content);
    Object.values(node).forEach(walk);
  };
  walk(card);
  return out.join('\n');
}

/**
 * 取卡片回调响应里那张新卡片。
 *
 * @param response `cardResponse(...)` 的返回值
 * @returns 卡片对象；没有时 undefined
 */
export function responseCard(response) {
  return response?.card?.data;
}

/** 等一拍，让 `setTimeout(..., 0)` 那类后台提交跑完。 */
export function tick(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
