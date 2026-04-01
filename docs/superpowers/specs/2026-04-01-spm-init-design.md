# `spm init` 设计说明

## 背景

当前 `spm` 已支持：

- `spm add`
- `spm install`
- `spm update`

其中：

- `add` 负责向 `skills.json` 增加声明，并同步解析、写入 `skills-lock.yaml`
- `install` 负责根据 `skills.json` 与 lock 执行 materialize + link
- `update` 负责基于已声明 skill 刷新 lock 中的 resolution

目前还缺少一个“初始化 manifest”的入口。用户第一次接入 `spm` 时，需要手动创建 `skills.json`，这会增加理解成本，也不利于推广统一的默认目录与 agent link target 约定。

因此需要新增 `spm init`，专门用于生成项目的首个 `skills.json`。该命令应同时支持：

- 交互式向导
- 非交互式默认初始化

## 目标

新增命令：

- `spm init`
- `spm init --yes`

命令语义：

1. `spm init` 以交互式方式生成 `skills.json`。
2. `spm init --yes` 以非交互方式生成默认 `skills.json`。
3. 若当前目录已存在 `skills.json`，命令立即失败，不覆盖、不合并、不补字段。
4. 首版仅生成 `skills.json`，不生成 `skills-lock.yaml`。
5. 首版支持配置 `installDir` 与预设 `linkTargets`，并始终写出 `skills: {}`。
6. 交互式流程中，`installDir` 允许直接输入，空输入回退到默认值 `.agents/skills`。
7. 交互式流程中，`linkTargets` 通过 agent 预设多选产生；如果用户不配置，也显式写出空数组 `[]`。
8. 首版非交互模式只支持 `--yes`，不提供其他显式参数。

## 非目标

以下内容不在本次设计范围内：

- 生成或更新 `skills-lock.yaml`
- 自动触发 `install`
- 修改 `pnpm-workspace.yaml`
- 自动配置 `pnpm-plugin-skills`
- 自动探测本地已有 agent 目录
- 支持手动输入自定义 `linkTargets`
- 为 `init` 增加 `--install-dir`、`--link-target` 等显式参数
- 提供 `-y` 等短参数别名

## 命令接口设计

### CLI 入口

在 CLI 分发层新增 `init` 分支：

- `spm init`
- `spm init --yes`

约束：

- `spm init` 不接受位置参数
- `spm init` 首版只接受 `--yes`
- 出现未知 flag 或多余位置参数时，立即报错

`runCli` 只负责：

- 解析 `init` 子命令
- 校验参数边界
- 调用 `initCommand`

不负责：

- 交互实现
- manifest 文件存在性判断
- manifest 内容组装
- 文件写入

### 命令实现

新增文件：

- `packages/skills-package-manager/src/commands/init.ts`

新增导出：

- `packages/skills-package-manager/src/index.ts`

建议新增类型：

```ts
export type InitCommandOptions = {
  cwd: string
  yes?: boolean
}
```

## 输出文件设计

`spm init` 只生成一个文件：

- `skills.json`

输出结构固定为：

```json
{
  "installDir": ".agents/skills",
  "linkTargets": [],
  "skills": {}
}
```

字段约束：

- `installDir`
  - 交互式：来自用户输入；空输入使用 `.agents/skills`
  - 非交互式：固定为 `.agents/skills`
- `linkTargets`
  - 交互式：来自 agent 预设多选
  - 未选择时也写出 `[]`
  - 非交互式：固定为 `[]`
- `skills`
  - 固定写出空对象 `{}`

### 文件存在性规则

命令执行前先检查目标目录下是否已存在 `skills.json`。

- 若存在：立即报错退出
- 若不存在：继续初始化流程

此处按“文件是否存在”判断，而不是读取并解析 manifest 内容。因为本命令的要求是“只要已存在就失败”，无需区分内容是否合法。

## 交互式流程设计

`spm init` 的交互顺序固定为三步。

### 第一步：输入 installDir

使用文本输入框：

- message：`Where should skills be installed?`
- initial value：`.agents/skills`

规则：

- 用户输入先做 `trim()`
- 若结果为空字符串，则使用 `.agents/skills`
- 最终结果写入 `installDir`

### 第二步：确认是否配置额外 agent 目标

使用确认框：

- message：`Do you want to configure additional agent link targets?`
- initial value：`false`

规则：

- 若选择否：直接使用 `linkTargets: []`
- 若选择是：进入第三步多选

### 第三步：选择 additional agents

使用多选框：

- message：`Which agents do you want to install to?`

展示上分成两块：

1. `Universal (.agents/skills) — always included`
2. `Additional agents`

其中：

- Universal 仅作为说明文本，不可选
- Additional agents 才是真正的可选项
- 选中的 Additional agents 会转换为 `linkTargets`

如果用户取消任一步交互：

- 立即退出
- 不写任何文件

## Agent 预设设计

### Universal agents

以下 agents 只作为说明文本展示，表示它们默认可直接消费 `installDir` 对应的 `.agents/skills` 目录：

- Amp
- Antigravity
- Cline
- Codex
- Cursor
- Deep Agents
- Firebender
- Gemini CLI
- GitHub Copilot
- Kimi Code CLI
- OpenCode
- Warp

这部分不会写入 `linkTargets`。

### Additional agents

以下选项参与多选，并写入 `linkTargets`：

- Augment → `.augment/skills`
- IBM Bob → `.bob/skills`
- Claude Code → `.claude/skills`
- OpenClaw → `skills`
- CodeBuddy → `.codebuddy/skills`
- Command Code → `.commandcode/skills`
- Continue → `.continue/skills`
- Cortex Code → `.cortex/skills`
- Trae → `.trae/skills`

建议使用固定常量表维护上述映射关系，不抽离为外部配置文件。

### 结果生成规则

- `linkTargets` 仅包含 Additional agents 对应路径
- `.agents/skills` 不重复写入 `linkTargets`
- 结果按预设列表顺序输出
- 由于选项来源固定，天然避免重复值

示例：

若用户选择 `Claude Code` 与 `Continue`，则输出：

```json
{
  "installDir": ".agents/skills",
  "linkTargets": [
    ".claude/skills",
    ".continue/skills"
  ],
  "skills": {}
}
```

## 架构与职责边界

### `runCli`

负责：

- 识别 `init` 子命令
- 解析 `--yes`
- 拒绝未知 flag 与多余位置参数
- 调用 `initCommand`

不负责：

- 交互 prompt 细节
- manifest 写入
- preset 数据维护

### `initCommand`

负责：

1. 检查 `skills.json` 是否已存在
2. 根据 `yes` 决定进入交互式或非交互式流程
3. 组装标准 `SkillsManifest`
4. 写入 `skills.json`

不负责：

- lock 解析
- install / link
- agent 自动探测

### prompt helpers

建议在 `packages/skills-package-manager/src/cli/prompt.ts` 中新增 init 相关 helper，用于：

- 输入 `installDir`
- 询问是否启用 additional agents
- 展示并返回 Additional agents 多选结果

这些 helper 只返回数据，不直接负责文件写入。

### preset 常量

建议将 agent 预设定义为常量，职责仅包括：

- label
- target path
- 所属分组

这样后续新增 agent 时，不需要修改命令主流程。

## 写入与实现细节

### manifest 写入

建议复用现有 `writeSkillsManifest`，由 `initCommand` 组装 manifest 后统一调用。

写入时保持与现有 manifest 一致的序列化风格：

- 两空格缩进
- 尾部换行
- 字段顺序：`installDir`、`linkTargets`、`skills`

### 参数校验

由于当前 CLI 参数解析较宽松，新增 `init` 时应显式增加命令级校验：

- `positionals.length > 0` 时报错
- `flags` 中出现 `yes` 之外的键时报错

避免 silently ignore 未知参数。

### 取消处理

交互取消沿用现有 `@clack/prompts` 风格：

- 输出取消信息
- 退出进程
- 不写出半成品文件

## 错误处理设计

### 已存在 manifest

报错文案：

```text
skills.json already exists
```

### 参数非法

建议直接抛出明确错误，例如：

```text
Unknown flag for init: --foo
```

或：

```text
init does not accept positional arguments
```

### Prompt 取消

取消不视为异常恢复场景，不写文件即可。

## 测试设计

新增测试文件：

- `packages/skills-package-manager/test/init.test.ts`

至少覆盖以下场景。

### `initCommand`

1. `yes: true` 时写出默认 manifest
2. 已存在 `skills.json` 时抛错
3. 不会生成 `skills-lock.yaml`
4. 交互式输入为空时，`installDir` 回退为 `.agents/skills`
5. 交互式选择“不配置额外目标”时，写出 `linkTargets: []`
6. 交互式选择多个 Additional agents 时，正确写出 `linkTargets`
7. 交互取消时，不写文件

### `runCli`

1. `spm init --yes` 正确分发到 `initCommand`
2. `spm init foo` 报错
3. `spm init --foo` 报错
4. `spm init --yes --foo` 报错

## 文档变更

需要同步更新：

- `packages/skills-package-manager/README.md`
- 根目录 `README.md`

补充内容：

- `spm init`
- `spm init --yes`
- 交互式初始化说明
- 默认生成的 `skills.json` 示例

## 实现落点

建议涉及以下文件：

- `packages/skills-package-manager/src/commands/init.ts`
- `packages/skills-package-manager/src/cli/runCli.ts`
- `packages/skills-package-manager/src/cli/prompt.ts`
- `packages/skills-package-manager/src/config/types.ts`
- `packages/skills-package-manager/src/index.ts`
- `packages/skills-package-manager/test/init.test.ts`
- `packages/skills-package-manager/README.md`
- `README.md`

## 结论

`spm init` 在首版应聚焦于“安全、明确地生成首个 `skills.json`”。

其核心原则是：

- 只初始化 manifest，不承担安装职责
- 交互式流程尽量短
- 非交互式流程只提供一个稳定默认入口 `--yes`
- 使用内置 agent 预设生成 `linkTargets`
- 已存在 `skills.json` 时绝不覆盖

这样可以在不增加过多复杂度的前提下，为 `spm` 提供一个明确的初始化入口，并与现有 manifest/CLI 架构保持一致。
