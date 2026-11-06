# 智能小蚁：测试服务器部署

以下以测试官网所在的 Linux/Nginx 服务器为例。客服是 Next.js 服务端应用，需要单独运行一个 Node.js 进程；不要把 `.next` 当成静态网站直接复制到 Nginx 目录。

## 1. 上传源码包

将 `zhiyi-assistant-deploy.zip` 上传到服务器，解压到例如 `/opt/zhiyi-assistant`。包内没有 `.env.local`、`node_modules` 或本机 `.next`。服务器需安装满足项目 `node_modules/next/package.json` 中 `engines.node` 要求的 Node.js（当前安装的 Next 15.5.28 要求 `^18.18.0 || ^19.8.0 || >=20.0.0`）；建议使用受支持的 Node.js LTS 版本。

```bash
mkdir -p /opt/zhiyi-assistant
unzip zhiyi-assistant-deploy.zip -d /opt/zhiyi-assistant
cd /opt/zhiyi-assistant
node --version
npm ci
```

## 2. 在服务器配置环境变量

在 `/opt/zhiyi-assistant/.env.production.local` 中填写服务器专用配置。不要把密钥写入网页源码、iframe 地址或 `NEXT_PUBLIC_` 变量。

```env
DASHSCOPE_API_KEY=服务器上的百炼密钥
CHAT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
CHAT_MODEL=qwen-plus
CYBERANTT_API_BASE_URL=https://test-2026.cyberantt.com/dev-api
CYBERANTT_API_TOKEN=测试环境接口凭证
NEXT_PUBLIC_CUSTOMER_PARENT_ORIGINS=http://47.107.120.126:8080
```

`NEXT_PUBLIC_CUSTOMER_PARENT_ORIGINS` 必须在构建前设置。若不填 `CYBERANTT_API_TOKEN`，商品目录为空，不会使用本地演示/快照数据。部署模式不允许跳过测试接口的无效 HTTPS 证书，因此商品接口证书也必须有效。

## 3. 构建并在本机端口启动

```bash
cd /opt/zhiyi-assistant
npm run build
npm run start -- --hostname 127.0.0.1 --port 3001
```

在服务器上另开终端检查：

```bash
curl -I http://127.0.0.1:3001/
```

确认可以访问后，使用服务器已有的进程管理方式（如 systemd）保持 `npm run start` 常驻；不要长期依赖一个 SSH 终端。

## 4. 由 Nginx 对外提供测试地址

可先使用一个未占用的测试端口，例如 `8081`。以下配置只作示例，端口、防火墙和 Nginx 文件位置以服务器实际情况为准。不要修改当前官网 `8080` 的配置。

```nginx
server {
    listen 8081;
    server_name 47.107.120.126;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }
}
```

```bash
nginx -t
systemctl reload nginx
```

完成后在其他电脑访问 `http://47.107.120.126:8081/`。后续正式嵌入官网时，建议改为独立的 HTTPS 测试域名。

## 5. 在测试官网嵌入客服

确认 `8081` 地址可访问后，在 `http://47.107.120.126:8080/` 的官网前端页面添加客服 iframe。初始尺寸只容纳右下角“问小蚁”按钮；客服会在打开小窗、进入完整工作区或关闭时通知官网调整 iframe 尺寸，避免关闭后透明 iframe 挡住官网内容：

```html
<iframe
  id="zhiyi-assistant"
  title="智能小蚁"
  src="http://47.107.120.126:8081/"
  style="position:fixed;right:12px;bottom:calc(40dvh - 50px);width:216px;height:125px;border:0;background:transparent;z-index:9999"
></iframe>
<script>
  const assistantFrame = document.querySelector("#zhiyi-assistant");
  const assistantOrigin = new URL(assistantFrame.src).origin;
  window.addEventListener("message", (event) => {
    if (event.source !== assistantFrame.contentWindow || event.origin !== assistantOrigin) return;
    if (event.data?.type !== "zhiyi.widget.view") return;
    const view = event.data.view;
    if (view === "closed") {
      assistantFrame.style.right = "12px";
      assistantFrame.style.bottom = "calc(40dvh - 50px)";
      assistantFrame.style.width = "216px";
      assistantFrame.style.height = "125px";
    } else if (view === "compact") {
      assistantFrame.style.right = "12px";
      assistantFrame.style.bottom = "12px";
      assistantFrame.style.width = "min(520px, calc(100vw - 24px))";
      assistantFrame.style.height = "min(760px, calc(100dvh - 24px))";
    } else if (view === "full") {
      assistantFrame.style.right = "0";
      assistantFrame.style.bottom = "0";
      assistantFrame.style.width = "100vw";
      assistantFrame.style.height = "100dvh";
    }
  });
</script>
```

要显示官网登录用户资料和“我的订单”，官网还需用当前用户的 Authorization 调用接口，并按 [官网登录资料接入](website-customer-profile.md) 和 [订单与进度接口接入](account-orders-progress.md) 的 `postMessage` 约定将结果发送给客服 iframe。测试官网使用固定来源 `http://47.107.120.126:8080`；切换域名后更新 `NEXT_PUBLIC_CUSTOMER_PARENT_ORIGINS` 并重新构建。

## 当前功能边界

- 上述 `npm run build` / `npm run start` 是生产运行模式，可用于测试问答和商品推荐。
- 生产运行模式的测试账号订单查询接口关闭；嵌入官网后，个人资料与订单须由官网登录会话查询并回传。
- 代码中的测试结算和支付接口明确限制为本地开发模式，部署后不会开放。不要通过将线上 `NODE_ENV` 改为 `development` 绕过该限制。
- 当前聊天记录保存在浏览器本地，接入官网多账号前还需按用户隔离记录。
