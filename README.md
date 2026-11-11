# MOSS-5B Krea Studio（独立生图项目）

100% 独立的 **MOSS-Image 5B SFT (SLG=22)** 商业生图网站与工作台（1:1 复刻 `krea.ai/krea-2` 落地页与 `krea.ai/image/k3-edit` 生图内页），与 `AI_Anime_Studio` 完全解耦。

## 目录结构

```text
d:\ai\MOSS_Krea_Studio\
├─ public/
│  ├─ index.html                       # 1:1 复刻 Krea 2 官网首页（含 Stripe 合规条款与 HKD/USD 定价）
│  └─ generate.html                    # 1:1 复刻 Krea 生图工作台（纯 MOSS-Image 5B 生图 + FIFO 队列）
├─ api/
│  └─ moss.js                          # Vercel Serverless 无状态生图接口（支持直接部署 Vercel）
├─ colab/
│  └─ 纯生图_MOSS_Image_5B_Colab.py    # Colab 端 MOSS-Image 5B 纯生图一键启动脚本
├─ outputs/                            # 本地生成的图片与历史记录自动保存在此目录
├─ server.py                           # 本地独立服务端（端口 3091，自动识别 Windows 代理连接 Colab）
├─ vercel.json                         # Vercel 一键部署路由配置
└─ 双击本地启动.bat                     # 双击即可启动本地独立服务并打开工作台
```

## 使用方法

1. **Colab 端**：在 Google Colab 中运行 `colab/纯生图_MOSS_Image_5B_Colab.py`。
2. **本地运行**：双击 `双击本地启动.bat`（或运行 `python server.py`），自动打开：
   - 官网首页：`http://127.0.0.1:3091/`
   - 生图工作台：`http://127.0.0.1:3091/generate.html`
3. **Vercel 测试部署**：将代码推送到 GitHub 并导入 Vercel。公开提供服务前，须先完成下方所列的生成代理安全改造、支付功能及线上测试。

## Supabase 云端历史

工作台使用用户名和密码注册登录，无需邮箱验证。用户名为 3–24 位英文字母、数字或下划线，密码为 8–72 个字符。`viora-signup` Edge Function 在 Supabase Auth 内为账号使用保留域名的内部标识，不向用户发送邮件；项目原有的邮箱验证规则不变。此前已有邮箱账号仍可在用户名输入框中输入原邮箱登录。无邮箱账号目前无法通过邮件自助找回密码。

生成完成后，网页将图片上传到私有 `moss-images` 存储桶，生成参数写入 `public.moss_images`；数据库和存储策略限制为每个用户自己的记录。退出登录后本页面不再显示该账号的云端记录。注册接口包含每小时项目总数和单来源频率限制，定义见 `supabase/viora_signup_rate_limit.sql`。

Supabase 配置位于 `public/assets/supabase-config.js`，其中仅包含可公开的项目地址和 publishable key，不要在前端放 secret / service role key。数据库结构和权限定义见 `supabase/moss_cloud.sql`；当前项目已应用该配置，请勿重复执行。原有 `outputs/` 和浏览器历史不会自动导入，也不会被删除。

需要保持页面打开直到任务完成且图片保存成功；失败会继续尝试。Supabase 图片链接有时效，可刷新列表重新获取。现有 Vercel 版本仍经由函数转发生成图片，单次响应超过 Vercel 大小限制时会失败。登录只保护 Supabase 数据；生成代理仍缺少完整的服务端鉴权、任务归属验证和限流，在这些问题修复前不要公开部署供他人使用。

若未来启用邮箱找回或邮件验证，须配置 Supabase Auth 回调地址与可靠的 SMTP。Vercel 上的模型仍运行在外部 ComfyUI，不由 Vercel 提供 GPU。实际生图、登录邮件和线上部署需要各自实测。

## 服务端连接配置

工作台不展示或允许修改生成服务器地址。现有本地地址保存在不随 Git 提交的 `outputs/settings.json`；如需更换，在本机运行 `python tools/set_gateway.py` 并按提示输入地址，不要在客户页面输入。Python 服务每次读取配置，更新后无需重启。`MOSS_GATEWAY_URL` 环境变量优先于本地配置。

Vercel 部署需要在项目的服务端环境变量中设置 `MOSS_GATEWAY_URL`，不要写进前端或提交到仓库；更新环境变量后重新部署。Colab 固定隧道地址可通过 Colab Secret `MOSS_PUBLIC_URL` 配置，`CF_TUNNEL_TOKEN` 仍保存在 Colab Secret。

隐藏地址不等于服务器已经安全：已泄露的旧地址仍可能被使用，应按隧道提供商的方式更换地址或实施身份访问控制。当前生成 API 尚不适合公开运营。

## 页面语言

首页、工作台与登录注册默认使用中文，可通过页面上的「中文 / EN」切换。语言偏好保存在当前浏览器中；用户输入的提示词与生成参数不会随界面语言改变。

## 共享 GPU 提交规则

工作台约每 4 秒读取一次上游全局队列，在输入框上方和侧边栏显示正在运行及排队的任务数。队列不空或状态无法读取时禁止提交；等待的用户并没有加入队列，需要空闲时自行点击提交，因此当前不统计等待的用户人数，也不提供先到先得保证。

服务端要求登录后才能提交，并使用 Supabase 短租约串行化来自本地与 Vercel 实例的提交检查，随后再次核对上游队列。提交超时结果不明确时会暂时保留租约（最长 90 秒），以避免重复提交。此协调只覆盖本项目的提交接口；直接调用上游生成服务的其他客户端不受该锁约束。线上需部署新前后端，Supabase 必须可访问。
