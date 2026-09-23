#!/usr/bin/env bash
# 把当前仓库同步到 GitHub —— codeup 流水线里跑的就是这份脚本。
#
# 依赖两个环境变量（在云效流水线里配成私密变量，别写死在流水线的脚本框里）：
#   GITHUB_USER   GitHub 用户名
#   GITHUB_TOKEN  fine-grained token，权限 Contents: Read and write
#
# 用法（云效「执行命令」步骤里）：
#   bash ci/push-to-github.sh          # 同步 master
#   bash ci/push-to-github.sh test     # 同步别的分支
#
# 两个刻意的选择：
# - 只推当前分支的 HEAD 和标签，不用 --mirror：--mirror 会把 GitHub 上多出来的
#   分支和标签删掉，容易误伤。
# - 强制 HTTP/1.1：从国内构建集群直连 github.com 时，HTTP/2 常常在传输中途被掐
#   （SSL_ERROR_ZERO_RETURN / send-pack: unexpected disconnect），HTTP/1.1 稳得多。
set -uo pipefail

: "${GITHUB_USER:?没取到 GITHUB_USER（检查流水线变量是否关联）}"
: "${GITHUB_TOKEN:?没取到 GITHUB_TOKEN（检查流水线变量是否关联）}"

BRANCH="${1:-master}"
REPO="${GITHUB_USER}/dsh-feishu-cui"

export GIT_TERMINAL_PROMPT=0
git config user.name "codeup-ci"
git config user.email "codeup-ci@local"
git config http.version HTTP/1.1

URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git"

# 网络抖动不该把流水线判红：最多试 6 次，每次隔 10 秒。
for attempt in 1 2 3 4 5 6; do
  echo "=== 第 ${attempt} 次尝试：$(git rev-parse --short HEAD) → github.com/${REPO} (${BRANCH}) ==="
  if git push "$URL" "refs/heads/${BRANCH}:refs/heads/${BRANCH}" && git push "$URL" --tags; then
    echo "同步完成 → https://github.com/${REPO}"
    exit 0
  fi
  if [ "$attempt" = 6 ]; then break; fi
  echo "这次没成，等 10 秒再试"
  sleep 10
done

echo "连试 6 次都没成，看上面的报错"
exit 1
