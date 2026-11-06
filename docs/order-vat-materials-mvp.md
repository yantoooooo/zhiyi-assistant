# 测试订单与 VAT 注册资料填写 MVP

## 用户故事

- 企业客户在结算后创建测试订单，可立即查看订单号、状态、商品明细、金额与优惠。
- 企业客户可选择“跳过支付并创建测试订单”：系统先创建订单，再调用测试跳过支付接口；只有支付状态查询确认为成功，页面才显示“支付成功”。
- 购买 VAT 注册服务后，待支付时可通过“填写 VAT 注册资料”读取并保存公司基础资料；支付状态确认成功后，入口改为“前往工作台”，在测试环境继续处理资料。

## 流程与接口

1. 结算金额来自 `GET /zy/cart/total`；创建订单前服务端重新核价。
2. 正常支付：`POST /zy/pay/createOrder`，随后 `POST /zy/pay/unifiedorder.client`。
3. 跳过支付：调用 `POST /zy/pay/createOrder`，再调用 `POST /zy/pay/exeNotify.client?orderNo=...`，最后通过 `POST /zy/pay/queryOrderPayStatus` 核对支付结果。不获取付款码；若测试支付确认失败，保留已创建订单号并显示原因。
4. 订单详情：`GET /zy/profile/order/queryInfoByOrderNo?orderNo=...`。服务重启后先用 `POST /zy/profile/order/list` 核对订单属于当前测试账号。
5. VAT 资料：先从 `GET /zy/workbench/ved/todoListDict?typeCode=2` 读取待填写状态，再用 `POST /zy/workbench/ved/todoList` 查找相同订单号的 VAT 待办业务 ID。随后调用 `GET /zy/vat/taxNo/queryInfo?id=...` 读取、`POST /zy/vat/taxNo/registerVat` 保存基础字段。

## 本期边界

- 仅接 VAT 注册基础字段：公司中英文名称、营业执照编号、公司中英文地址、法人中英文姓名、联系人手机与邮箱。
- 附件、店铺、股东、税号等资料及最终确认仍在原平台完成。页面不会把“保存基础资料”标记为“审核提交”。
- 若订单尚未生成 VAT 待办记录，填写入口会提示当前无法获取业务 ID。
- 支付、订单详情与资料接口均要求测试站有效 HTTPS 证书；资料保存与工作台跳转尚未做端到端联调。
- 测试账号凭证仅在服务端使用；VAT 表单内容不写入浏览器持久化存储。
