/**
 * 防休眠：插件在跑的时候持有一个 `caffeinate -s` 子进程，插件停就释放。只做 macOS。
 *
 * 做法跟 harness-station 的 `MacSleepPreventer` 一样：持有就是把子进程养着，释放就是 kill 它。
 * `caffeinate -s` 创建的是 `PreventSystemSleep` 断言，按 `man caffeinate` 这条断言
 * 「valid only when system is running on AC power」——插电才生效，正是插电合盖那个场景要的。
 *
 * 起的时候带上 `-w` 指到本进程：按 `man caffeinate`，`-w` 是「等这个 pid 退出，pid 一退断言
 * 就跟着释放」。插件进程一没（哪怕是 kill -9、崩溃，这些情况下任何 JS 钩子都跑不到），
 * 断言由 caffeinate 自己放掉，不靠插件记得去 kill——孤儿就是这么来的（keep-awake 攒了 66 个）。
 */

import { spawn } from 'node:child_process';

/** caffeinate 的绝对路径。 */
const CAFFEINATE = '/usr/bin/caffeinate';

/** 持有的断言：只防系统休眠（插电时有效）。 */
const CAFFEINATE_ARGS = ['-s'];

/**
 * 建防休眠。
 *
 * @param deps.logger 日志
 * @param deps.isEnabled 读总开关：`() => boolean`
 * @returns start / stop / snapshot
 */
export function createSleepGuard({ logger, isEnabled }) {
  /** 当前持有的子进程；null 表示没持有。 */
  let child = null;

  /** 最近一次失败原因；空串表示没失败过。 */
  let error = '';

  /** 起子进程持有断言。 */
  function start() {
    if (process.platform !== 'darwin' || child) return;
    if (!isEnabled()) return;

    const proc = spawn(CAFFEINATE, [...CAFFEINATE_ARGS, '-w', String(process.pid)], {
      stdio: 'ignore',
      detached: true,
    });
    proc.once('error', (cause) => {
      if (child === proc) child = null;
      error = cause.message;
      logger.warn(`起防休眠进程失败：${cause.message}`);
    });
    proc.once('exit', (code, signal) => {
      if (child !== proc) return;
      child = null;
      error = `防休眠进程退出了（code=${code} signal=${signal}）`;
      logger.warn(error);
    });
    child = proc;
    error = '';
    logger.info('已持有防休眠（caffeinate -s）');
  }

  /** 释放断言。 */
  function stop() {
    const proc = child;
    child = null;
    if (!proc) return;
    try {
      // detached 起的是进程组组长，杀整组；caffeinate 自己再 fork 的中间进程也不会漏。
      if (typeof proc.pid === 'number') process.kill(-proc.pid, 'SIGTERM');
      else proc.kill('SIGTERM');
    } catch {
      try {
        proc.kill('SIGTERM');
      } catch {
        /* 已经没了 */
      }
    }
    logger.info('已释放防休眠');
  }

  /**
   * 设置页要看的现场。
   *
   * @returns 状态快照
   */
  function snapshot() {
    return {
      supported: process.platform === 'darwin',
      enabled: Boolean(isEnabled()),
      holding: child !== null,
      pid: child?.pid ?? null,
      error,
    };
  }

  return { start, stop, snapshot };
}
