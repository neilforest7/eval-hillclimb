# Eval & Hillclimb

把“建立可靠评估 → 分析失败 → 小步修改 → 验证收益 → 保留或撤销”做成可复用 skill，供 Codex 和 ChatGPT 使用。

[English](README.md)

## 第一版包含什么

- 一个原生 skill，包含 build-eval、hillclimb 两种工作模式。
- 零依赖 Node.js 22+ 脚本：分组划分任务集、运行评估、比较版本。
- 离线路由示例、可选 OpenAI Responses API 适配器。
- 核心与端到端测试，以及 Node.js 22/24 的 GitHub Actions CI。
- 自动验证、按需安装 gh、创建公开仓库的发布脚本。

模型负责提出改进并修改目标；脚本负责运行、记录和统计。工具不会仅凭一句“优化一下”自行调用付费 API。

## 验证与演示

~~~bash
git clone https://github.com/neilforest7/eval-hillclimb.git
cd eval-hillclimb
npm test
npm run demo
~~~

演示使用合成案例和规则程序，不收费、不需要 API key，也不能据此证明真实模型或线上质量提升。

## Codex 安装

~~~bash
mkdir -p ~/.agents/skills
cp -R eval-hillclimb ~/.agents/skills/eval-hillclimb
~~~

团队可放在仓库 .agents/skills/eval-hillclimb/。保留整个目录以包含参考文件和脚本。

调用示例：

~~~text
$eval-hillclimb build-eval：根据这些真实失败，为我的研究智能体建立评估。

$eval-hillclimb 优化这个 skill 的触发准确率。
只修改 description，最小有价值收益 5 个百分点，最多 6 轮。
~~~

默认使用明确调用。build-eval / hillclimb 是本 skill 识别的工作模式，不是 Codex 内置 slash command。

## ChatGPT 使用

账号或工作区有 Skills 入口时，创建或上传完整 skill 包。ChatGPT 和 Codex 共用源文件，但各自管理安装和更新。

没有 Skills 入口时，建立 Project：
1. 将 docs/chatgpt-project-instructions.md 放进项目指令。
2. 上传 skill 的参考文档、实验协议和允许读取的训练案例。
3. 用它设计评估、校准评分器、分析实测报告。

实际批量调用、版本保存和独立评分，需要可用执行环境或已连接的 runner。最终盲测集和答案不放进 Project 或优化对话。详见 [ChatGPT 说明](docs/chatgpt.md)。

## 真实实验怎样运行

每个案例使用 JSONL，包含 id、input、expected；相关案例标记相同 group_id。具体命令见 [英文快速开始](README.md)，运行接口见 [适配器说明](eval-hillclimb/references/adapters.md)。

训练集用于诊断；验证集用于选择；最终盲测用于检验选定版本。优化过程只接收验证集汇总指标，不能阅读其具体案例和执行记录。

配对统计检查、质量门槛和预算不能替代业务回归。收益没有超过噪声时保留基线。

干净工作目录并非安全沙箱，外部目录也并非访问隔离；严格盲测应使用独立权限或服务。

## 打包

~~~bash
npm run bundle
~~~

在 dist/ 中生成完整仓库 ZIP 和用于上传的 skill ZIP。

## 发布到 GitHub Public 仓库

在解压后的新目录运行：

~~~bash
node scripts/publish.mjs --install-gh --owner 你的GitHub用户名 --name eval-hillclimb
~~~

脚本先跑测试和免费演示，再按需安装官方 gh CLI、检查登录账号，创建公开仓库并推送。

支持 Linux/macOS 的常见 x64/arm64 环境；Windows 先自行安装 gh。需要登录或补充 classic/OAuth 凭据的 workflow 权限时会启动 GitHub 浏览器授权流程。环境提供的 token 应具有 repo 和 workflow 权限；fine-grained token 需允许写入 Actions workflow。它不会覆盖已有仓库。

## 方法来源

Lance Martin，2026-09-28：
[Automating eval design and hillclimbing with Claude](https://claude.dev/blog/automating-eval-design-and-hillclimbing/)。

本实现补充分组划分、独立最终盲测、可追溯实验记录和跨模型执行接口。代码为原创实现，采用 [MIT](LICENSE) 许可。
