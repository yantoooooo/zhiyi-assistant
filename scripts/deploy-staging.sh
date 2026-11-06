#!/usr/bin/env bash
set -euo pipefail

# Run from the customer-service checkout: ./scripts/deploy-staging.sh <pm2-name>
if [[ $# -ne 1 || -z "$1" ]]; then
  echo "用法：./scripts/deploy-staging.sh <客服 PM2 进程名>" >&2
  exit 2
fi

for command_name in git node npm pm2; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "缺少命令：$command_name" >&2
    exit 1
  fi
done

app_name="$1"
app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$app_dir"

if [[ "$(node -p "require('./package.json').name")" != "enterprise-service-ai-mvp" ]]; then
  echo "当前目录不是智能小蚁客服项目：$app_dir" >&2
  exit 1
fi

git_root="$(git rev-parse --show-toplevel)"
if [[ "$(cd "$git_root" && pwd -P)" != "$app_dir" ]]; then
  echo "Git 仓库根目录与客服项目目录不一致。" >&2
  exit 1
fi

check_pm2_app() {
  pm2 jlist | node -e '
    const fs = require("fs");
    const path = require("path");
    const [name, expectedDir, requireOnline] = process.argv.slice(1);
    const apps = JSON.parse(fs.readFileSync(0, "utf8"));
    const matching = apps.filter((app) => app.name === name);
    if (!matching.length) {
      console.error(`找不到客服 PM2 进程：${name}`);
      process.exit(1);
    }
    const expected = fs.realpathSync(expectedDir);
    for (const app of matching) {
      const cwd = app.pm2_env?.pm_cwd;
      if (!cwd || fs.realpathSync(cwd) !== expected) {
        console.error(`PM2 进程 ${name} 的运行目录不是客服项目目录：${cwd || "未知"}`);
        process.exit(1);
      }
      if (requireOnline === "yes" && app.pm2_env?.status !== "online") {
        console.error(`PM2 进程 ${name} 未处于 online 状态。`);
        process.exit(1);
      }
    }
  ' "$app_name" "$app_dir" "${1:-no}"
}

check_pm2_app no

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "客服目录有未提交的代码改动，请先处理，避免覆盖服务器改动。" >&2
  exit 1
fi

echo "更新客服代码：$app_dir"
git pull --ff-only
npm ci
npm run build
pm2 restart "$app_name" --update-env
check_pm2_app yes
echo "客服部署完成，PM2 进程已 online：$app_name"
