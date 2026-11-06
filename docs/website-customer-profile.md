# 官网登录资料接入

侧栏展示昵称和脱敏手机号，不保存用户资料到 `localStorage`。官网接口为 `GET /dev-api/zy/baseInfo/profile`，响应中的 `data.ncName` 是昵称，`data.mobile` 是手机号。当前接口没有可用的企业名称字段，因此侧栏的第二行显示脱敏手机号。

**本地预览：**独立打开客服时，`GET /api/customer/profile` 仅在开发模式下使用 `.env.local` 的 `CYBERANTT_API_TOKEN` 请求测试环境资料，侧栏标注“测试账号”。测试环境证书失效时，仅在设置 `CYBERANTT_ALLOW_INVALID_TEST_CERT=true` 且请求目标为固定的测试域名和资料接口路径时允许本地联调。生产环境不会使用这份共享凭证展示用户资料。

**官网正式接入：**客服页面与官网处于不同源时，官网使用**已有的带 Authorization 的请求客户端**获取当前登录用户资料，再把最小化的展示资料发给客服 iframe。客服已监听 `zhiyi.customer.profile` 和 `zhiyi.customer.clear` 消息，并在 iframe 初始化时发送 `zhiyi.customer.ready`。未收到资料时显示“访客 / 未关联官网账号”。

官网集成示例（将 `websiteApi` 替换为官网现有的授权请求客户端，将 `iframe` 指向实际客服 iframe）：

```ts
const iframe = document.querySelector<HTMLIFrameElement>("#zhiyi-assistant");
const assistantOrigin = new URL(iframe!.src).origin;

async function syncCustomerProfile() {
  const response = await websiteApi.get("/dev-api/zy/baseInfo/profile");
  const body = response.data;
  if (body.code !== 200 || !body.data) return;

  const mobile = String(body.data.mobile ?? "");
  const maskedMobile = /^\d{11}$/.test(mobile)
    ? `${mobile.slice(0, 3)}****${mobile.slice(-4)}`
    : undefined;

  iframe?.contentWindow?.postMessage({
    type: "zhiyi.customer.profile",
    profile: {
      name: body.data.ncName || "企业客户",
      maskedMobile,
    },
  }, assistantOrigin);
}

window.addEventListener("message", (event) => {
  if (event.source === iframe?.contentWindow && event.origin === assistantOrigin && event.data?.type === "zhiyi.customer.ready") {
    void syncCustomerProfile();
  }
});

// 登录完成或用户信息更新后再次调用 syncCustomerProfile()。
// 退出登录时清除客服页面的资料：
function clearCustomerProfile() {
  iframe?.contentWindow?.postMessage({ type: "zhiyi.customer.clear" }, assistantOrigin);
}
```

如果官网的请求客户端已经把 `/dev-api` 设为 base URL，示例中的请求路径改为 `/zy/baseInfo/profile`。客服只接受来自正式官网 `https://www.cyberantt.com`、测试官网 `http://47.107.120.126:8080`、客服同源页面或 `NEXT_PUBLIC_CUSTOMER_PARENT_ORIGINS` 中配置的来源的消息。若官网实际使用其他域名，请在客服项目配置该变量，并重启或重新构建服务。
