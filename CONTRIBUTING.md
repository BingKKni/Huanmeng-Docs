# 参与贡献文档

感谢您愿意花时间改进幻梦Bot的相关文档。下面说明如何从本地修改到提交 Pull Request（PR）。

## 您需要准备的环境

- [Node.js](https://nodejs.org/)（建议使用当前的 LTS 版本）
- [Git](https://git-scm.com/)
- 任意代码编辑器（推荐带 Markdown 预览）

本项目的文档基于 **VitePress** 构建，依赖与脚本定义在仓库根目录的 **`package.json`** 中，因此安装、启动与构建命令都应在**仓库根目录**执行。

## 目录与职责（改哪里）

| 路径 | 说明 |
| --- | --- |
| `src/index.md` | 首页（入口介绍与按钮等） |
| `src/docs/` | 机器人帮助文档（如 `index.md` 等） |
| `src/public/` | 静态资源（图片等），在 Markdown 里常以 `/img/...` 引用 |
| `src/.vitepress/` | VitePress 配置与主题（一般贡献文档时少改） |

修改前先浏览现有页面的语气和结构，**纠错、补全步骤、更新配图**都很受欢迎。若需要大幅改写语气或版式，建议在 PR 或群里先简单沟通一下。

## 本地运行与构建

在仓库根目录克隆完成后，请保持当前目录不变并执行：

```bash
npm install
npm run docs:dev
```

浏览器访问终端里提示的地址（本仓库脚本默认为 **`http://localhost:23333`**）。

确认无报错后，建议再执行一次构建，避免线上部署失败：

```bash
npm run docs:build
```

构建输出位于 `src/.vitepress/dist/`（该目录通常已被 `.gitignore` 忽略，不要提交）。

## 提交改动与发起 PR

1. 新建一个分支（示例：`fix/typo-docs` 或 `docs/update-invite`），**不要直接在默认分支上堆大量无关修改**。
2. 提交信息建议写清楚「做了什么」，例如：`docs: 修正邀请入群说明中的错字`。
3. 推送到您 Fork 的远程仓库后，在托管平台（如 GitHub）上向**本仓库**发起 **Pull Request**。
4. 在 PR 描述中说明：**动机**（修 bug / 补充说明 / 更新链接等）、**主要改动点**；若与某个 Issue 相关，可写上编号。

维护者可能会对措辞、排版或小节结构提出修改意见，属正常协作流程。

## 无法使用 Git 时

如果您不熟悉 Git，仍可通过 [QQ 群](https://qm.qq.com/cgi-bin/qm/qr?k=RpOzkOt8DJmXjFcMq_-SRVRMG4C8fwlQ&jump_from=webapi&authKey=wfj8bPCfrvKJXMVZGgORbBw+PIY9RShKltbtFFcf6Kp55Pnh3aNzuvPDmFqEzBIk) 或 [QQ 频道「幻梦Official」](https://pd.qq.com/s/13nxjzopi) 发送**可复制粘贴的修改建议**或截图说明，由维护者酌情合并进仓库。

## 许可说明

参与贡献即表示您同意将您提交的内容按本仓库根目录 **[LICENSE](./LICENSE)** 中的条款授权分发（若 LICENSE 与上述说明不一致，以 LICENSE 文件为准）。
