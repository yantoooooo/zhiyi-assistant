# 我的订单与服务进度：接口接入设计

## 用户故事

| 场景 | 验收标准 |
| --- | --- |
| 查询我的订单 | 用户在聊天中询问“我的订单”，页面显示当前账号最近 10 条订单的编号、商品名称、金额、创建时间和接口状态。 |
| 查询服务进度 | 用户询问“服务进度”时，页面显示当前账号最近 10 项业务的名称、国家、申请号或注册号、当前状态。 |
| 异常处理 | 未登录、接口超时、没有记录、证书不可用分别显示明确提示；不编造订单或进度。 |
| 账号隔离 | 服务端从已验证会话获取用户身份，查询结果不得跨用户展示；退出登录后清除页面中的个人数据。 |

## 已确认接口

| 用途 | 测试文档接口 | 关键字段 |
| --- | --- | --- |
| 订单列表 | `POST /dev-api/zy/profile/order/list` | 请求：`orderType`（`0` 全部）、`pageIndex`、`pageSize`、`searchKey`；响应：`orderNo`、`productName`、`patentTotalPrice`、`createTime`、`status`。 |
| 订单详情 | `GET /dev-api/zy/profile/order/queryInfoByOrderNo?orderNo=...` | 订单状态、商品明细、金额、优惠等。 |
| 进度列表 | `POST /dev-api/zy/workbench/progressList` | 请求：`pageIndex`、`pageSize`、`searchKey`、可选类型与状态；响应：`id`、`orderNo`、`content`、`country`、`status`、`typeCode`、申请号等。 |
| 单项进度 | `POST /dev-api/zy/common/queryState.client` | 请求：业务 `id` 与二级 `type`；响应：进度标题、描述和时间。 |
| 状态字典 | `GET /dev-api/zy/workbench/progressDict?typeCode=...` | 一级类型 `1` 知识产权、`2` VAT、`3` 公司。 |

## 接入前提

1. 本地开发预览使用 `.env.local` 的共用测试账号 Token，由服务端的 `GET /api/account/query?kind=orders|progress` 调用测试接口；仅在开发模式开放。官网嵌入模式通过 `postMessage` 请求数据；官网页面须用已有登录请求客户端实际调用接口并回传。昵称和手机号仅作显示，不能当作接口鉴权凭证。
2. 该读取方案不向客服传递官网登录 Token。只接受 HTTPS 官网来源的响应，并匹配请求编号。个人查询结果只保留在当前页面内存，不写入本机聊天历史。
3. 独立打开 `localhost` 时只显示共用测试账号的数据；未配置测试 Token 或测试账号资料不可用时，页面提示先从官网登录。官网尚未添加下方监听代码时，查询会提示“官网暂未响应”。
4. 测试域名 `test-2026.cyberantt.com` 的证书已过期；官网正式地址 `https://www.cyberantt.com` 的订单和进度接口存在，但无凭证请求返回 401，需由官网现有授权请求客户端调用。

## 官网 iframe 对接代码

在官网已登录页面、创建客服 iframe 后，接入以下逻辑。`websiteApi` 应替换为官网已有的自动携带当前用户 Authorization 的请求客户端；路径以 `/dev-api` 为根，若客户端的 base URL 已含 `/dev-api`，请去掉路径中的该前缀。

```ts
const iframe = document.querySelector<HTMLIFrameElement>("#zhiyi-assistant");
const assistantOrigin = new URL(iframe!.src).origin;

window.addEventListener("message", async (event) => {
  if (event.source !== iframe?.contentWindow || event.origin !== assistantOrigin) return;
  const request = event.data;
  if (request?.type !== "zhiyi.account.query" || typeof request.requestId !== "string") return;
  if (request.kind !== "orders" && request.kind !== "progress") return;

  const path = request.kind === "orders"
    ? "/dev-api/zy/profile/order/list"
    : "/dev-api/zy/workbench/progressList";
  const params = request.kind === "orders"
    ? { orderType: "0", pageIndex: 1, pageSize: 10, searchKey: "" }
    : { pageIndex: 1, pageSize: 10, searchKey: "" };

  try {
    const response = await websiteApi.post(path, params);
    const body = response.data;
    if (body.code !== 200 || body.flag === false) throw new Error(body.msg || "接口查询失败");
    iframe.contentWindow?.postMessage({
      type: "zhiyi.account.result",
      requestId: request.requestId,
      kind: request.kind,
      data: body.data,
    }, assistantOrigin);
  } catch (error) {
    iframe.contentWindow?.postMessage({
      type: "zhiyi.account.result",
      requestId: request.requestId,
      kind: request.kind,
      error: error instanceof Error ? error.message : "查询失败",
    }, assistantOrigin);
  }
});
```

官网还需按 [官网登录资料接入](website-customer-profile.md) 同步当前用户资料，供客服判断登录和退出状态。客服项目只处理展示，账号权限由官网授权请求客户端及其后台接口负责。

## 展示规则

- 当前小窗默认每类显示最新 10 项；按订单编号查询详情、单项进度时间线和分页列入下一步。金额按订单列表接口的人民币字段展示，不自行改写状态或优惠。
- 订单状态与服务进度状态来自不同接口，应分别标注，不能把“已付款”当作“办理完成”。
- 问题中明确提到国家和服务类型时，只展示最近 10 条接口记录中与条件匹配的订单或进度；没有匹配记录时说明当前查询范围，不展示其他服务的记录，也不推断账号从未购买该服务。
- 聊天回复可以解释接口状态含义，但订单号、金额、日期、状态及进度节点必须直接取自接口结果。

## 订单列表界面

| 用户故事 | 展示与验收 |
| --- | --- |
| 快速核对订单 | 顶部按接口状态筛选当前加载的 10 笔订单；每笔订单显示创建时间、订单号，再按服务名称、规格、数量、订单总金额、订单状态和操作展示。筛选数量仅统计当前加载的记录。 |
| 查看多商品订单 | `profileOrderDiVoList` 中的每件商品各占一行；订单级总金额和状态在桌面表格中合并单元格显示。列表未返回明细时仅显示订单级名称和总价，缺失规格用“—”表示。 |
| 在小窗阅读 | 小窗与手机屏幕改用纵向卡片，金额、数量和状态仍可直接看到。 |
| 查看详情与复制订单号 | 订单详情展开当前列表接口已返回的编号、时间、状态、金额和支付截止时间；订单号右侧的复制图标反馈成功或失败，操作列只保留订单详情。支付与取消仍由官网订单中心处理，客服不伪造操作结果。 |
| 显示商品图片 | 优先使用订单明细 `profileOrderDiVoList[].productImage` 返回的国旗图片路径；图片缺失或加载失败时显示名称匹配的国旗或通用图标。 |

订单结果仅在当前页面内存中展示，不写入本机历史；状态原样取自接口，不猜测状态码含义。
`/dev-api/profile/DownloadImg/flags/4x3/*.svg` 是商品图片的静态资源路径。客服只接受该固定目录下的两位国家代码，通过同源 `/api/account/flag` 转发，避免 HTTPS 页面请求 HTTP 图片时被浏览器拦截。

## 服务进度界面

服务进度按公司名称、国家/地区、服务类型、服务单号、当前状态、操作六列展示；在小窗和手机端改为纵向记录卡。公司名称取进度列表的 `cname`，服务类型取 `type`，服务单号取 `orderNo`；当前测试数据的 `orderNo` 均为 `null`，因此明确显示“接口未返回”，不会把业务记录 `id` 冒充服务单号。点击“查看进度”展开当前状态、申请号 `sn`、注册号 `regSn` 与业务记录 ID；尚未取得的申请号或注册号会明确标注。详细时间线须在单项进度接口字段确认后接入。
