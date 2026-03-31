# `spm update` 设计说明

## 背景

当前 `spm` 仅支持 `add` 与 `install`。其中：

- `add` 负责更新 `skills.json` 并同步生成 `skills-lock.yaml`
- `install` 负责根据 `skills.json` 重新生成 lock，并将技能安装到本地目录

为了支持已声明技能的升级，需要新增 `update` 命令。该命令不修改 `skills.json`，而是以其中声明的 specifier 为准，重新解析可更新依赖的最新 resolution，并在安装成功后提交新的 `skills-lock.yaml`。

## 目标

新增命令：

- `spm update`
- `spm update <skill...>`

命令语义：

1. 以 `skills.json` 为唯一声明源。
2. 不修改 `skills.json`。
3. 默认更新全部已声明 skill；传入名称时仅更新指定 skill，支持多个名称。
4. `file:` 依赖直接跳过。
5. git 依赖按 `skills.json` 中的 specifier 重新解析：如果指向分支、`HEAD` 或其他 ref，则解析该 ref 当前对应的最新 commit，并写入新的 lock entry。
6. 如果任一指定 skill 不存在于 `skills.json` 中，立即报错退出。
7. 如果解析阶段存在失败项，则继续处理其余目标项，但最终不进入安装、不写入新的 lock，并返回非 0。
8. 只有当解析阶段没有失败，且安装阶段成功完成时，才写入新的 `skills-lock.yaml`。

## 非目标

以下内容不在本次设计范围内：

- 修改 `skills.json` 中的 specifier
- 为 `update` 增加交互式选择 UI
- 增加 npm 类型依赖的更新逻辑
- 新增筛选参数或复杂更新策略

## 命令接口设计

### CLI 入口

在 CLI 分发层新增 `update` 分支：

- `spm update`：更新全部已声明 skill
- `spm update foo bar`：仅更新 `foo` 与 `bar`

`runCli` 只负责参数解析与分发，不承载更新逻辑。

### 命令实现

新增文件：

- `packages/skills-package-manager/src/commands/update.ts`

新增导出：

- `packages/skills-package-manager/src/index.ts`

建议新增类型：

```ts
export type UpdateCommandOptions = {
  cwd: string
  skills?: string[]
}
```

## 架构与职责边界

### 阶段模型

本次设计将 package manager 内核明确分成三个阶段：

1. **resolve**
   - 输入：`skills.json`、命令选择的目标 skill、当前 `skills-lock.yaml`
   - 输出：标准 lock 或 candidate lock
   - 职责：按 specifier 解析 resolution，不触碰安装目录

2. **fetch**
   - 输入：lock 中的 resolution
   - 输出：将 skill 内容 materialize 到受管安装目录
   - 职责：获取或复制 skill 内容，执行 prune，维护 install state 所需的物理文件状态

3. **link**
   - 输入：安装目录中的 skill 与 `linkTargets`
   - 输出：各 link target 下的最终可用链接
   - 职责：建立或更新 symlink，使 agent 能消费安装结果

命令本身不直接拥有底层实现，而是编排这三个阶段。

### 三类行为

在这个阶段模型下，命令语义变成三种 orchestration：

- **install**：全量 `resolve -> fetch -> link`
- **update**：部分 `resolve` 生成 candidate lock，再执行受该 candidate lock 约束的 `fetch -> link`；仅在完整成功后提交 lock
- **增量 install（未来能力）**：复用同一阶段模型，但仅对变化项执行必要的 `fetch` 与 `link`

本次设计只实现 `update`，并为未来的增量 install 预留阶段边界，不在这次实现中新增该用户可见能力。

### 新职责划分

#### `runCli`

负责：

- 解析 `update` 子命令
- 收集位置参数作为 `skills[]`
- 调用 `updateCommand`

不负责：

- manifest 校验
- lock 构造
- fetch / link 控制

#### `updateCommand`

负责：

1. 读取 `skills.json` 与现有 `skills-lock.yaml`
2. 校验指定 skill 是否存在
3. 计算本次目标 skill 集合
4. 驱动 resolve 阶段，为目标项生成 candidate lock
5. 调用 fetch 与 link 阶段验证 candidate lock 能否成功落地
6. 仅在全部阶段成功后写入新的 lock
7. 返回结构化结果摘要

#### resolve 层

负责：

- 解析单个 specifier
- 生成标准 lock entry
- 从 manifest 全量生成 lock
- 从 manifest + current lock + 目标 skill 生成 candidate lock

不负责：

- 文件 materialization
- symlink 管理
- 命令级错误策略之外的展示逻辑

#### fetch 层

负责：

- 按 lock 将 skill 内容 materialize 到 installDir
- 执行 prune
- 维护 install state

不负责：

- 解析 specifier
- 决定 linkTargets
- 提交 lock

#### link 层

负责：

- 将 installDir 中的已安装 skill 链接到各个 `linkTargets`

不负责：

- resolution 解析
- materialization
- lock 提交

## 内部结构设计

### 1. resolve：抽出单个 specifier 的 lock 解析能力

当前 `packages/skills-package-manager/src/config/syncSkillsLock.ts` 内部已有 `createLockEntry` 逻辑。应将其提升为可复用能力，例如：

```ts
resolveLockEntry(cwd: string, specifier: string): Promise<{ skillName: string; entry: SkillsLockEntry }>
```

职责：

- 调用 `normalizeSpecifier`
- 根据类型分流 `file` / `git`
- 对 git 使用 `git ls-remote` 将 ref 解析为 commit
- 生成 `SkillsLockEntry`

此能力将被：

- 全量 resolve 复用，用于从 manifest 生成标准 lock
- `updateCommand` 复用，用于目标 skill 的部分 resolve

### 2. resolve：保留全量 lock 同步能力

`syncSkillsLock(cwd, manifest, existingLock)` 继续保留，作为全量 resolve 入口，主要服务于 `install`。

它仍然从 manifest 出发构造标准 lock，不承担部分更新的语义。`existingLock` 参数当前未被使用，可以在本次实现中顺手移除，或明确保留但不参与逻辑。

### 3. fetch + link：为安装流程拆出阶段化入口

建议将当前 `installSkills` 拆成三层：

#### 上层：命令级编排入口

```ts
installSkills(rootDir: string)
```

职责：

- 读取 manifest
- 触发全量 resolve
- 调用 fetch 阶段
- 调用 link 阶段
- 在成功后写入 lock

#### 中层：fetch 入口

```ts
fetchSkillsFromLock(rootDir: string, manifest: SkillsManifest, lockfile: SkillsLock)
```

职责：

- 计算 lock digest
- 检查 install state
- 执行 prune
- materialize 每个 skill 到 installDir
- 更新 install state

#### 中层：link 入口

```ts
linkSkillsFromLock(rootDir: string, manifest: SkillsManifest, lockfile: SkillsLock)
```

职责：

- 遍历 lockfile.skills
- 为每个 `linkTarget` 建立或更新 symlink

`fetch` 与 `link` 均不应负责写 `skills-lock.yaml`，以便 `updateCommand` 在成功前保持 lock 不落盘。

### 4. `updateCommand` 的 candidate lock 构造流程

`updateCommand` 的建议流程：

1. 读取 manifest；若不存在则直接返回或报错，与现有 CLI 风格保持一致。
2. 读取 current lock，作为当前已解析状态的基准。
3. 计算目标 skill 集合：
   - 未传参：`Object.keys(manifest.skills)`
   - 传参：使用指定 skill 名称数组
4. 校验所有指定 skill 都在 `manifest.skills` 中；否则立即报错。
5. 基于 manifest 与 current lock 构造 candidate lock 骨架，保留非目标项当前状态。
6. 遍历目标 skill 执行部分 resolve：
   - `file:`：标记为 `skipped`，不改动 lock entry
   - `git`：调用 `resolveLockEntry` 解析新 entry
   - 若 commit 与当前 lock 相同，标记为 `unchanged`
   - 若不同，写入 candidate lock 并标记为 `updated`
   - 若解析失败，标记为 `failed`
7. 若存在任意失败项：
   - 汇总结果
   - 返回非 0
   - 不执行 fetch / link
   - 不写 lock
8. 若无失败项：
   - 依次调用 `fetchSkillsFromLock(rootDir, manifest, candidateLock)` 与 `linkSkillsFromLock(rootDir, manifest, candidateLock)`
   - 若全部成功，则写入新的 `skills-lock.yaml`
   - 若任一阶段失败，则保持旧 lock 不变并返回非 0

## 数据流说明

### `spm install`

```text
skills.json
  -> resolve
  -> lockfile
  -> fetch
  -> link
  -> write skills-lock.yaml
```

### `spm update`

```text
skills.json + current skills-lock.yaml
  -> select target skills
  -> partial resolve target lock entries
  -> candidate lock
  -> fetch(candidate lock)
  -> link(candidate lock)
  -> write skills-lock.yaml on success only
```

## 行为细则

### 目标选择

- `spm update`：目标为全部 manifest skill
- `spm update a b`：目标为 `a`、`b`

### 不存在的 skill

- 若任一指定名称不存在，立即抛错并退出
- 不继续处理其余项
- 不写 lock

### `file:` 依赖

- 永远跳过
- 记入 `skipped`
- 维持现有 lock entry 不变
- 若当前 lock 中缺少该项，可选择基于 manifest 全量同步骨架，确保 candidate lock 结构完整

### git 依赖

完全以 `skills.json` 中的 specifier 为准：

- 若 specifier 带分支、`HEAD` 或其他 ref，则重新执行 `git ls-remote <url> <ref>`
- 使用解析结果中的最新 commit 构造新 lock entry
- 不能根据现有 lock 中已固定 commit 判断是否跳过更新

### unchanged

若重新解析出的 commit 与当前 lock entry 的 commit 一致：

- 记入 `unchanged`
- candidate lock 可不修改该项
- 仍可继续处理其他 skill

## 失败处理

### 解析阶段失败

场景示例：

- git 远端不可访问
- ref 不存在
- specifier 非法

处理规则：

- 记录失败项
- 继续处理其余目标项
- 最终只要存在失败项：
  - 返回非 0
  - 不执行安装
  - 不写 lock

### 安装阶段失败

场景示例：

- materialize 失败
- 链接失败
- prune / 文件系统操作失败

处理规则：

- 返回非 0
- 保留旧的 `skills-lock.yaml`
- 保留旧安装状态
- 不要求回滚文件系统中的中间副作用，但命令语义上以“不提交新 lock”为边界

## 返回结果与输出

建议 `updateCommand` 返回结构化结果，便于测试与后续 CLI 展示：

```ts
{
  status: 'updated' | 'skipped' | 'failed'
  updated: string[]
  unchanged: string[]
  skipped: Array<{ name: string; reason: 'file-specifier' }>
  failed: Array<{ name: string; reason: string }>
}
```

说明：

- `status` 可按最终结果聚合：
  - 有 `failed` => `failed`
  - 无失败且有 `updated` => `updated`
  - 无失败且仅有 `unchanged` / `skipped` => `skipped`
- CLI 文案可后续细化，但测试应以结构化返回值为准

## 测试设计

新增：

- `packages/skills-package-manager/test/update.test.ts`

覆盖场景：

1. **全量更新成功**
   - 多个 git skill
   - 初始 lock 为旧 commit
   - 更新后 lock commit 变化
   - 安装结果同步更新

2. **按名称更新多个 skill**
   - 只更新指定 skill
   - 非目标 skill lock 保持不变

3. **指定不存在的 skill**
   - 立即报错
   - lock 不变

4. **混合 `file:` 与 git**
   - `file:` 被记录为 `skipped`
   - git 项正常更新

5. **部分 git 解析失败**
   - 某一项解析失败
   - 其余项即便解析成功，也不写 lock、不执行安装提交

6. **解析成功但安装失败**
   - candidate lock 可生成
   - 安装阶段抛错
   - 新 lock 不写入

7. **commit 未变化**
   - 解析结果与现有 lock 相同
   - 结果记为 `unchanged`

## 影响文件

预计涉及：

- `packages/skills-package-manager/src/cli/runCli.ts`
- `packages/skills-package-manager/src/commands/update.ts`（新增）
- `packages/skills-package-manager/src/index.ts`
- `packages/skills-package-manager/src/config/types.ts`
- `packages/skills-package-manager/src/config/syncSkillsLock.ts`
- `packages/skills-package-manager/src/install/installSkills.ts`
- `packages/skills-package-manager/test/update.test.ts`（新增）
- `packages/skills-package-manager/README.md`
- 根目录 `README.md`

## 设计结论

采用独立 `updateCommand` 的方案，并抽出可复用的 lock 解析能力。这样可以：

- 保持 `install` 与 `update` 职责清晰
- 精准表达“部分目标刷新 + 原子提交 lock”的语义
- 复用现有 git/file resolution 逻辑
- 避免为当前需求过度重构整个安装引擎

该设计满足以下关键要求：

- 默认全量更新，支持按名称更新多个 skill
- `file:` 跳过
- git resolution 完全以 `skills.json` 为准
- 不存在的目标 skill 立即报错
- 解析阶段允许继续收集失败，但不提交结果
- 只有安装成功后才写新的 lock
