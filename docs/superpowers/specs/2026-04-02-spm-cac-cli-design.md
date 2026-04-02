# `spm` CLI 使用 `cac` 重构设计说明

## 背景

当前 `spm` CLI 入口位于 `packages/skills-package-manager/src/cli/runCli.ts`，由手写参数解析与命令分发逻辑驱动。现有实现已经支持：

- `spm add`
- `spm install`
- `spm update`
- `spm init`

这些命令对应的业务逻辑已经拆分在 `packages/skills-package-manager/src/commands/*.ts` 中，但 CLI 入口仍存在以下问题：

1. 参数解析依赖手写逻辑，命令定义不集中。
2. `--help`、`--version`、未知命令提示等标准 CLI 能力不完整。
3. 错误提示、参数校验和命令用法信息缺乏统一入口。
4. 后续继续增加命令时，CLI 入口的维护成本会持续上升。

本次改造目标是在保持现有命令兼容的前提下，引入 `cac` 作为唯一 CLI 框架，并顺手做一轮受控的 CLI 体验重设计。

## 目标

本次设计目标如下：

1. 将 `spm` 的 4 个现有命令全部迁移到 `cac`：`add`、`install`、`update`、`init`。
2. 保持现有命令名和核心语义兼容。
3. 补齐标准 CLI 体验，包括：
   - 顶层 `--help`
   - 子命令 `--help`
   - 顶层 `--version`
   - 更标准的未知命令和参数错误提示
4. 统一 CLI 层的错误出口与帮助信息组织方式。
5. 保持业务逻辑继续由现有 `*Command` 函数承载，而不是把逻辑塞回 CLI 入口。
6. 为后续继续新增子命令提供更清晰、低维护成本的结构。

## 非目标

以下内容不在本次设计范围内：

- 修改 `skills.json`、`skills-lock.yaml` 的数据语义
- 改写 `add`、`install`、`update`、`init` 的核心业务流程
- 重命名现有子命令
- 引入大量短别名或新的交互模式
- 为本次改造引入与 `cac` 无关的大规模重构
- 新增与当前需求无关的配置项、抽象层或兼容垫片

## 总体方案

本次采用 `cac` 作为唯一命令入口，并保留当前两层结构：

1. **CLI 装配层**：负责创建 `cac('spm')`、注册命令、声明参数、输出 help/version，并将解析结果转交给命令处理函数。
2. **业务命令层**：继续由 `addCommand`、`installCommand`、`updateCommand`、`initCommand` 承接业务行为。

这意味着 `cac` 负责“命令模型与参数入口”，现有 command handler 继续负责“manifest、lockfile、安装与交互式业务逻辑”。

这种拆分的好处是：

- 改造范围集中在 CLI 入口，不污染现有业务边界。
- 可以最大程度复用已有测试和命令实现。
- 新增标准 help/version、未知命令处理时，不需要在每个命令里重复实现。

## 文件改造范围

本次改造涉及以下文件：

- `packages/skills-package-manager/src/cli/runCli.ts`
  - 从手写解析器改为 `cac` 命令装配入口
- `packages/skills-package-manager/src/commands/*.ts`
  - 仅在必要时做小幅入参适配，不改变业务职责
- `packages/skills-package-manager/package.json`
  - 增加 `cac` 依赖
- `packages/skills-package-manager/test/*.test.ts`
  - 增加或更新 CLI 行为测试
- `packages/skills-package-manager/README.md`
  - 更新 CLI usage、帮助说明和关键示例

## CLI 架构设计

### `runCli` 的职责

改造后的 `runCli` 负责：

- 创建 `cac('spm')`
- 注册命令与参数
- 将 CLI 解析结果映射为现有 command handler 的入参
- 配置顶层帮助与版本输出
- 统一兜底处理 CLI 层报错

改造后的 `runCli` 不负责：

- manifest 读写
- lockfile 解析与同步
- install/update/add/init 的业务细节
- 命令内部的交互式流程

### command handler 的职责

现有命令函数继续承担原有责任：

- `addCommand`：处理 specifier 归一化、manifest 更新、lock 同步与安装
- `installCommand`：执行安装流程
- `updateCommand`：更新 lock 中的 resolution 并执行安装
- `initCommand`：生成 manifest 并处理交互式初始化

CLI 层不新增新的业务中间层，只做装配与参数入口收敛。

## 命令设计

### 顶层行为

引入 `cac` 后，顶层 CLI 行为统一为：

- `spm --help`：显示顶层命令列表与说明
- `spm --version`：显示包版本
- `spm`：默认输出 help
- `spm <unknown-command>`：显示明确的未知命令提示，并指向 help

顶层不再依赖“手写 unknown command error”来表达命令用法问题。

### `spm add`

保持兼容的用法：

- `spm add owner/repo`
- `spm add https://github.com/owner/repo`
- `spm add https://github.com/owner/repo.git#path:/skills/my-skill`
- `spm add file:./local-source#path:/skills/my-skill`
- `spm add owner/repo --skill find-skills`

设计要点：

- 将 `specifier` 声明为必填位置参数
- 将 `--skill` 声明为正式选项，出现在 help 中
- 缺少 `specifier` 时，由 CLI 层给出更标准的命令用法提示
- 继续复用现有 `addCommand` 业务逻辑

### `spm install`

保持兼容用法：

- `spm install`

设计要点：

- 顶层 help 与子命令 help 中明确该命令用途
- 明确不接受多余位置参数
- 出错时统一走 CLI 层错误出口

### `spm update`

保持兼容用法：

- `spm update`
- `spm update skill-a skill-b`

设计要点：

- 位置参数声明为可选的多个 skill 名称
- help 中明确“支持 0 到多个 skill 名称”
- 继续复用现有 `updateCommand`

### `spm init`

保持兼容用法：

- `spm init`
- `spm init --yes`

设计要点：

- `--yes` 作为正式选项出现在 help 中
- 保持“不接受多余位置参数”的约束
- 非法参数形式仍然应尽早失败，但提示形式可更标准
- 继续复用现有 `initCommand`

## 受控的 CLI 体验重设计

本次允许优化 CLI 体验，但限定在以下范围内：

1. **帮助系统标准化**
   - 顶层 help 展示命令总览
   - 子命令 help 展示参数、说明与示例
2. **参数声明标准化**
   - 必填参数、可选参数和多值参数由 `cac` 统一声明
3. **错误提示统一化**
   - 未知命令、参数错误与业务错误走统一出口
4. **默认展示优化**
   - 未输入子命令时展示 help，而不是报语义模糊的错误

以下能力明确不纳入本次重设计：

- 修改命令名称
- 修改 manifest / lockfile 语义
- 改变 `add`、`install`、`update`、`init` 的业务默认行为
- 引入大规模 alias 体系

## alias 策略

本次不引入激进 alias。

具体约束：

- 不为 `install`、`update`、`init` 等新增短别名，如 `i`、`up`、`-y`
- 以 `spm <command> --help` 作为主要帮助入口
- 如果实现上需要补充帮助入口，也只允许使用低风险、可解释的帮助导向能力，不扩展到命令语义 alias

这样可以在改善体验的同时，控制文档面、测试面与潜在 breaking change 风险。

## 错误处理与输出规范

### 分层策略

错误处理分为两层：

#### CLI 层

负责：

- 统一捕获命令执行过程中抛出的错误
- 控制错误输出形式
- 统一设置 `process.exitCode = 1`
- 对 CLI 参数错误优先展示更贴近命令用法的信息

#### 业务命令层

负责：

- 继续抛出业务语义错误
- 保持命令内部对数据合法性、存在性、冲突等问题的判断

CLI 层不吞掉业务错误，也不将业务判断重新复制一遍。

### 输出规范

#### 成功输出

- 保留命令内部已有的成功输出与交互输出
- 不在 CLI 外层重复打印额外的 success 日志
- 避免命令内部和 CLI 外层重复输出导致的噪声

#### 失败输出

- 默认输出 `error.message`
- 不输出堆栈
- CLI 参数错误尽量带上 usage/help 指引
- 业务错误保持简洁、单行、可读

## 兼容性边界

本次改造采取“命令兼容，交互可优化”的边界。

### 必须保持兼容

- 子命令名：`add`、`install`、`update`、`init`
- `add` 的 `specifier` 位置参数语义
- `update` 支持 0 到多个 skill 名称
- `init --yes` 的核心行为
- 现有业务层返回值与安装流程语义

### 允许变化

- 顶层无命令时默认展示 help
- help 文案更完整
- 参数错误提示更标准
- 未知命令提示更明确
- README 中的 usage 组织方式调整

## 测试设计

按照当前仓库约束，本次 CLI 改造需要补充或更新测试。

### CLI 入口测试

应至少覆盖以下场景：

- `spm add <specifier>` 正常分发
- `spm add` 缺少必填参数时报错
- `spm install` 正常执行
- `spm install extra` 的参数边界行为
- `spm update`
- `spm update skill-a skill-b`
- `spm init`
- `spm init --yes`
- `spm init extra`
- `spm init --yes true`
- 未知命令
- `spm --help`
- `spm init --help`
- `spm --version`

测试重点是锁定 CLI 入口行为，而不是重复覆盖每个业务命令内部实现。

### README 一致性测试

当前已有测试会校验 README 中的 `init` 文档。本次可延续该思路，确保 README 与实际 CLI 行为一致，至少覆盖：

- 4 个命令章节仍然存在
- 文档包含 `--help` / `--version` 或对应 usage 说明
- 关键示例与当前命令语义不冲突

## README 设计

`packages/skills-package-manager/README.md` 需要做与本次改造直接相关的更新，范围包括：

- 顶层 usage
- 4 个子命令的标准用法
- `--help` / `--version` 说明
- 关键命令示例

README 仅更新与 CLI 入口体验相关的内容，不扩展到本次改造无关的话题。

## 实施顺序

建议实施顺序如下：

1. 在 `packages/skills-package-manager/package.json` 中增加 `cac`
2. 重写 `packages/skills-package-manager/src/cli/runCli.ts`
3. 根据 `cac` 的参数模型，做必要的 command handler 入参适配
4. 更新或新增 CLI 测试
5. 更新 `packages/skills-package-manager/README.md`
6. 运行 `pnpm test`

## 风险与控制

本次方案的主要风险在于：

1. `cac` 的默认参数行为与当前手写解析器不完全一致，可能引入细微兼容性变化。
2. 帮助信息与错误文案标准化后，测试快照或字符串断言可能需要调整。
3. 在“优化体验”的同时，如果顺手改动过多，容易引入不必要的 breaking change。

对应控制策略如下：

- 仅重构 CLI 入口，不扩展业务范围
- 不引入新的命令语义
- 对参数边界、未知命令和 help/version 建立明确测试
- 将 alias、默认行为调整控制在已批准范围内

## 最终结论

本次重构采用 `cac` 作为 `spm` 的唯一 CLI 框架，并在保持命令兼容的前提下，对帮助系统、参数声明、错误出口和默认交互做一轮受控优化。

最终结果应满足以下标准：

- 现有 4 个命令全部由 `cac` 驱动
- 业务逻辑仍由现有 command handler 负责
- CLI 具备标准的 help/version 体验
- 未知命令和参数错误提示更加统一
- 测试与 README 与新 CLI 行为保持一致
