# 智蚁 AI 企业服务 MVP

面向企业客户的企业服务网页 MVP。服务端会从测试环境的 `GET /dev-api/zy/workbench/getRemenList` 读取商品，按 IPR、VAT、海外公司三种 `type` 合并结果，商品卡片和聊天推荐使用同一目录。商品只来自测试接口；接口不可用时目录为空，页面会显示提示。聊天可使用本地关键词规则回复，也可配置百炼等 OpenAI 兼容协议的大模型服务。测试支付接口已接入代码，但只有测试环境 HTTPS 证书有效时才允许创建订单。

接口分组：`type=1` 为商标、专利、版权；`type=2` 为 VAT、EPR、授权代表；`type=3` 为海外公司。聊天推荐会结合商品名称、服务类型、国家和“注册、申报、注销、年审、转代理”等关键词筛选；用户同时提到多个类型或国家时，会兼顾各组的匹配商品。

## 本地运行

```bash
npm install
npm run dev
```

默认访问 `http://localhost:3000`。如果端口已占用，可运行 `npm run dev -- --port 3001`。

测试环境商品接口在 `.env.local` 中配置：

```env
CYBERANTT_API_BASE_URL=https://test-2026.cyberantt.com/dev-api
CYBERANTT_API_TOKEN=你的测试环境凭证
```

凭证只由服务端读取，不要使用 `NEXT_PUBLIC_` 前缀。页面底部会标明测试接口状态；`GET /api/products` 可查看目录来源与商品数量。测试结算价格与优惠以结算接口返回为准。

测试域名证书过期期间，可仅在本地 `.env.local` 添加 `CYBERANTT_ALLOW_INVALID_TEST_CERT=true` 临时联调商品与结算预览。此开关只在开发模式、且只对 `test-2026.cyberantt.com` 的商品列表和购物车试算固定路径生效；支付接口始终校验证书。证书更新后请删除该设置或改回 `false`，并更换测试 Token。

生产构建和静态代码检查：

```bash
npm run build
npm run lint
```

## 目录结构

测试服务器的一键更新流程见 [Git 部署说明](docs/git-deployment.md)；首次通过 ZIP 部署仍可参考 [测试站点部署说明](docs/test-site-deployment.md)。

- `src/app/`：Next.js App Router 页面入口、全局布局和样式。
- `src/components/`：聊天工作区、商品卡片及交互界面。
- `src/data/products.ts`：商品类型与货币格式化。
- `src/services/cyberantt-products.ts`：测试环境商品接口、字段映射与短时缓存。
- `src/app/api/products/route.ts`：不向浏览器暴露凭证的商品代理。
- `src/services/catalog.ts`：基于测试接口目录的查询适配器。
- `src/services/chat.ts`：聊天响应适配器；当前调用本地关键词推荐，后续可替换为 OpenAI。
- `src/lib/`：推荐规则、订单金额计算和 localStorage 持久化逻辑。
- `src/types/`：跨组件共享的聊天和持久化类型。

## 当前交互

- 按关键词、国家和服务类型推荐测试接口商品。
- 可查看服务详情、选择商品和修改数量。
- 商品卡片、详情和订单结算显示人民币代理费、官费与总价。测试商品结算时调用 `GET /zy/cart/total`，读取接口总价、优惠和适用优惠券；用户可选择一张券并重新核价，创建订单时传递已核价的 `ticketIds`。页面不计算或展示税费。服务端临时加入购物车并在试算后清理，已有购物车条目会恢复原数量和勾选状态。接口核价后可选择微信或支付宝；用户再次点击创建订单时才调用订单与支付接口。优惠券接入说明见 [优惠券结算接入](docs/coupon-checkout.md)。
- 对话和选择数量保存在浏览器 `localStorage`，刷新页面后恢复；历史消息中的商品只有仍存在于接口目录时才会显示。
- 侧栏通过 `/dev-api/zy/baseInfo/profile` 展示昵称和脱敏手机号。本地独立预览使用已配置的测试 Token，并标明“测试账号”；正式官网嵌入时由官网按当前用户的 Authorization 获取资料并发送给客服 iframe。接入步骤见 [官网登录资料接入](docs/website-customer-profile.md)。
- 输入“我的订单”或“服务进度”可通过接口查询最近记录。本地开发预览查询共用测试账号；正式官网登录用户须由官网页面用当前会话调用接口，再回传给客服小窗。接入方式见 [订单与进度接口接入](docs/account-orders-progress.md)。
- 点击侧栏“需要帮助”会在新窗口打开企业微信顾问链接。
- 输入区可上传图片、PDF、DOCX、TXT、MD、CSV；每次最多 5 个附件，每个不超过 10 MB，总大小不超过 20 MB。PDF/Word/文本在服务端提取文字，图片通过多模态模型分析；只保存附件名称和类型到本地对话记录，不保存文件内容。

## 后续接入点

- 大模型：百炼（DashScope）通过 OpenAI 兼容的 Chat Completions 协议接入。复制 `.env.example` 为 `.env.local`，填入 `DASHSCOPE_API_KEY`；默认使用 `qwen-plus` 与中国内地兼容端点，也可按百炼控制台的地域设置调整 `CHAT_BASE_URL` 和 `CHAT_MODEL`。图片分析默认使用 `qwen-vl-plus`，可通过 `CHAT_VISION_MODEL` 指定视觉模型；其他模型服务商需提供支持图片的兼容模型。未配置模型时，文本附件仍可走本地关键词推荐，图片需要可用的视觉模型。API 密钥仅在服务端读取，不要使用 `NEXT_PUBLIC_` 前缀。
- 请求转发位于 `src/app/api/chat/route.ts`，模型适配与输出解析位于 `src/services/llm.ts`。未设置 `CHAT_API_KEY` 时使用本地模拟；模型调用失败时自动回退到本地规则。
- 结算接口：已接入测试环境 `GET /zy/cart/total`，通过 `POST /api/checkout/quote` 供页面调用；测试结算仅在本地开发环境开放。商品明细通过 `zyywProductList.client` 获取默认规格。多规格商品若存在多个同价规格，当前按首个规格试算并在页面提示，正式下单前仍需增加规格与套餐选择。
- 支付接口：`POST /api/payment/create` 重新核价后调用 `createOrder`，普通支付再调用 `unifiedorder.client`；`POST /api/payment/status` 查询支付结果；`POST /api/payment/code` 可重新获取付款码。只支持测试环境的微信和支付宝，且仅在本地开发模式及 HTTPS 证书有效时开放。当前测试域名证书过期，因此普通支付按钮会禁用，点击跳过支付会显示接口受阻原因，无法创建真实订单。证书修复后，还需由用户手动验证付款码及支付回调；目前没有生产账号隔离、正式支付配置和真实支付验收。
- 本地开发模式的测试结算页提供“跳过支付并创建测试订单”。它先调用 `createOrder` 生成订单，再调用测试专用的 `exeNotify.client`，并以 `queryOrderPayStatus` 的结果确认支付成功；不调用 `unifiedorder.client` 获取付款码。测试支付未确认时显示真实状态并保留订单号，避免重复下单。该流程需要有效 HTTPS 证书。结算弹窗展示订单号、状态、商品和金额，并调用 `GET /zy/profile/order/queryInfoByOrderNo` 补充接口详情。
- VAT 注册订单在待支付时提供“填写 VAT 注册资料”：先从 `GET /zy/workbench/ved/todoListDict` 获取待填写状态，再在 `POST /zy/workbench/ved/todoList` 中按订单号匹配待办业务 ID；随后通过 `GET /zy/vat/taxNo/queryInfo` 读取资料，并用 `POST /zy/vat/taxNo/registerVat` 保存基础字段。支付结果确认成功后，入口改为“前往工作台”，在新标签页打开测试环境 VAT 工作台，资料仍需在原平台补充并最终确认。未付款订单若尚未生成待办事项，页面会显示原因。资料仅保留在当前表单内，不写入浏览器持久化存储。
- Supabase：设计真实订单前的用户认证与数据表。
- 正式优惠：只从商品/报价接口明确返回的优惠字段读取，不在前端自行推导。

> 不同厂商的模型 ID、Base URL 和 API key 需从对应服务商控制台获取。此适配器要求兼容 OpenAI Chat Completions 请求和响应格式；原生 API 不兼容的服务需另写 provider adapter。
