# 部署到 GitHub Pages（详细步骤）

本文档手把手教你把 `d:\quiz` 部署到 GitHub Pages，得到一个 **https 网址**，所有人微信扫同一个二维码都能进入。

> **最终你会得到**：`https://你的用户名.github.io/quiz/`
> 截图打印或投到大屏 → 所有人微信扫一扫 → 直接进入答题页。

---

## 目录

- [第 0 步：先确认本地能跑通](#第-0-步先确认本地能跑通)
- [第 1 步：创建 GitHub 仓库](#第-1-步创建-github-仓库)
- [第 2 步：配置 Git](#第-2-步配置-git)
- [第 3 步：上传代码](#第-3-步上传代码)
- [第 4 步：开启 Pages（两种方式，选一个）](#第-4-步开启-pages两种方式选一个)
- [第 5 步：拿到网址并验证](#第-5-步拿到网址并验证)
- [第 6 步：换成真实题库并重新部署](#第-6-步换成真实题库并重新部署)
- [日常维护速查](#日常维护速查)
- [常见问题排查](#常见问题排查)
- [备选方案：Vercel](#备选方案vercel)

---

## 第 0 步：先确认本地能跑通

部署前先确保程序本身没问题（万一部署上去打不开不好排查）。

```bash
cd d:\quiz
npm test
```

看到三行 `=== 结果: N 通过, 0 失败 ===` 说明逻辑没问题。

再手动跑一下：

```bash
cd d:\quiz
node server.js
```

浏览器打开 `http://localhost:8080/selfcheck.html`，自检页应该全是绿色。

**注意**：本地能跑 ≠ 部署能跑。本地用的是 `localhost`，部署后是子路径 `https://用户名.github.io/quiz/`，路径处理不同，所以**必须部署完实测一次**。

按 `Ctrl+C` 停掉本地服务。

---

## 第 1 步：创建 GitHub 仓库

### 1.1 打开创建页面

浏览器访问：

```
https://github.com/new
```

### 1.2 填写仓库信息

| 字段 | 填什么 | 说明 |
|---|---|---|
| **Owner** | 你的账号 | 默认就是你的个人账号 |
| **Repository name** | `quiz` | 建议就用 `quiz`，网址短、好记 |
| **Description** | 扫码答题程序 | 可留空 |
| **Public / Private** | **Public** | ⚠️ 重要！Pages 免费版只支持公开仓库 |
| **Add a README file** | **不勾选** | 我们本地已有文件，不要让 GitHub 建 README 免得冲突 |
| **.gitignore** | **不选** | 我们本地已有 .gitignore |
| **License** | **不选** | 无所谓 |

### 1.3 创建

点绿色的 **Create repository**，进入仓库主页。

### 1.4 记下仓库地址

页面右上角绿色 **Code** 按钮 → 复制 HTTPS 地址，格式是：

```
https://github.com/你的用户名/quiz.git
```

---

## 第 2 步：配置 Git

只需要配置一次，以后所有仓库都不用再配。

打开 **Git Bash**（不是 PowerShell，命令更通用），执行：

```bash
git config --global user.name "liu"
git config --global user.email "liu962566@outlook.com"
git config --global init.defaultBranch main
```

> `init.defaultBranch main` 这条很重要，避免默认分支叫 `master` 导致 Pages 配置找不到 `main`。

检查一下：

```bash
git config --global --list
```

---

## 第 3 步：上传代码

在 **Git Bash** 里执行（注意用 `/d/quiz` 而不是 `d:\quiz`）：

```bash
cd /d/quiz

# 1. 初始化仓库
git init

# 2. 把所有文件加入暂存区
git add .

# 3. 提交
git commit -m "扫码答题程序：微信扫码 + 随机50题 + 自动判分 + 逐题解析"

# 4. 关联远程仓库（把 你的用户名 换成你自己的）
git remote add origin https://github.com/你的用户名/quiz.git

# 5. 推送
git push -u origin main
```

### 推送时要求登录

第一次推送会弹出浏览器让你登录 GitHub，授权即可。

**如果没弹浏览器 / 报错**，用下面任一方法：

**方法 A：Personal Access Token（推荐）**

1. 访问 `https://github.com/settings/tokens`
2. 点 **Generate new token (classic)**
3. 勾选 `repo` 和 `workflow`（部署 Pages 需要 workflow 权限）
4. 生成后**立刻复制**那串 token（只显示一次）
5. 推送时用户名随便填，密码处粘贴 token

```bash
git push -u origin main
# Username: 你的用户名
# Password: 粘贴那串 token
```

**方法 B：改用 SSH**

```bash
git remote set-url origin git@github.com:你的用户名/quiz.git
git push -u origin main
```

### 确认推送成功

```bash
git remote -v
git log --oneline -3
```

刷新 GitHub 仓库页面，应该能看到 `index.html`、`assets/`、`data/` 等文件。

---

## 第 4 步：开启 Pages（两种方式，选一个）

### 方式 A：GitHub Actions 自动部署 ⭐ 推荐

**优点**：以后每次 `git push` 就自动重新部署，不用手动进设置改东西。

#### A.1 确认工作流文件存在

项目里已经放好了 `.github/workflows/deploy.yml`，你直接 `git push` 时就带上去了。

#### A.2 设置 Pages 的 Source

1. 进入仓库 → 顶部 **Settings** 标签
2. 左侧菜单 **Code and automation** → **Pages**
3. **Build and deployment** → **Source** 选 **GitHub Actions**（不是 `Deploy from a branch`）
4. 其余不用改，保存

> ⚠️ 一定要选 **GitHub Actions**。选成 `Deploy from a branch` 会和 workflow 冲突。

#### A.3 触发部署

**方法 1（推荐）**：随便改一行再推送，触发自动部署

```bash
cd /d/quiz
echo "# build $(date)" >> README.md
git add README.md
git commit -m "trigger deploy"
git push
```

**方法 2**：在仓库页面点 **Actions** 标签 → 左侧选 **Deploy to GitHub Pages** → 右侧点 **Run workflow** → 确认。

#### A.4 看部署日志

仓库 **Actions** 标签 → 点最新那次运行 → 展开 "部署静态站点" → 看到绿色 ✅ 就成功了。

日志里最后会显示网址：

```
部署到 GitHub Pages
  https://你的用户名.github.io/quiz/
```

#### A.5 如果报权限错误

如果日志里出现 `Error: Resource not accessible by integration` 或 `403`：

1. 仓库 **Settings** → 左侧 **Actions** → 顶部 **General** → 往下找到 **Workflow permissions**
2. 选 **Read and write permissions**
3. 保存，再重新触发

如果还不行：

**Settings** → **Pages** → Source 改回 **Deploy from a branch**，选 `main` 分支 `/ (root)`，保存后把 `.github/workflows/deploy.yml` 删掉再推送（改用方式 B）。

---

### 方式 B：直接从分支部署（最简单）

**优点**：不用管 Actions，最少步骤。
**缺点**：以后换题库要手动去 Settings 里改一下 Source（其实不用改，只是要等 build）。

#### B.1 设置 Source

1. 仓库 → **Settings** → **Pages**
2. **Build and deployment** → **Source** 选 **Deploy from a branch**
3. **Branch** 选 `main`，目录选 **`/ (root)`**
4. 点 **Save**

#### B.2 等待部署

大约 **1-3 分钟**，页面会刷新并显示：

```
Your site is live at https://你的用户名.github.io/quiz/
```

#### B.3 验证

浏览器打开 `https://你的用户名.github.io/quiz/`，应该能看到答题首页。

---

## 第 5 步：拿到网址并验证

### 5.1 你的最终网址

```
https://你的用户名.github.io/quiz/
```

### 5.2 三层验证

**第一层：电脑浏览器打开**

```
https://你的用户名.github.io/quiz/
```

能看到「知识竞赛答题」首页 = 部署成功。

**第二层：打开大屏页拿二维码**

```
https://你的用户名.github.io/quiz/cast.html
```

页面中央就是那张二维码，下方显示网址。**这就是你要投放的唯一二维码。**

> GitHub Pages 上没有 `/api/info` 接口，此时大屏页会自动使用「当前目录地址」模式，
> 二维码内容正好是 `https://你的用户名.github.io/quiz/` —— 这正是你要的。

**第三层：手机微信实测（必做）**

1. 手机连 4G/5G 或任意能上网的 WiFi
2. 微信 → 右上角 **+** → **扫一扫**
3. 扫 `cast.html` 页面上的二维码
4. 应该直接进入答题首页

如果微信弹出「非微信官方网页」，点 **继续访问** 即可。

### 5.3 自检页

```
https://你的用户名.github.io/quiz/selfcheck.html
```

在这里可以检查题库状态、二维码地址，并**用手机扫这一页的二维码**验证。

---

## 第 6 步：换成真实题库并重新部署

1. 把你的题库覆盖 `d:\quiz\data\questions.sample.json`
   （或改 `d:\quiz\assets\app.js` 里 `bankUrl` 指向你的文件名）

2. 本地先验一遍：

```bash
cd /d/quiz
npm test
```

3. 提交推送：

```bash
cd /d/quiz
git add data/
git commit -m "更新题库"
git push
```

4. 等 1-2 分钟（方式 A 会自动部署；方式 B 需要去 Settings → Pages 点 **Build site** 或重新触发 workflow）

5. 刷新 `https://你的用户名.github.io/quiz/cast.html` 确认新题库生效

> 题库加载用了 `?t=时间戳` 防缓存，微信里的旧页面强制刷新（右上角 → 刷新）也能拿到新题。

---

## 日常维护速查

### 只改题库（最常见）

```bash
cd /d/quiz
git add data/
git commit -m "更新题库"
git push
```

等 1-2 分钟即可。

### 改分数 / 改抽题量

编辑 `d:\quiz\assets\app.js` 顶部：

```javascript
var CONFIG = {
  quota: { single: 20, multi: 20, judge: 10 },   // 抽题量
  score: { single: 2, multi: 2, judge: 2 },      // 每题分值（满分 = 2×50 = 100）
  ...
};
```

改完同样 `git add . && git commit && git push`。

### 看部署日志

仓库页面 → **Actions** 标签 → 点最新那次运行。

### 回滚到上一个版本

```bash
cd /d/quiz
git log --oneline              # 找到要回滚的 commit
git revert <commit-id>         # 生成一个新 commit 撤销它
git push
```

### 彻底重新部署（改了配置文件后）

Actions 页面 → **Deploy to GitHub Pages** → **Run workflow**。

---

## 常见问题排查

### 1. 404 Not Found

**原因**：Pages 没开启，或 Source 选错了。

- 去 Settings → Pages 确认 Source 和分支
- 方式 A 要选 **GitHub Actions**
- 方式 B 要选 `main` + `/ (root)`

### 2. 页面打开是白屏 / 样式丢失

**原因**：资源路径错了。检查 `index.html` 里是不是写成了绝对路径 `/assets/style.css`。

正确写法（相对路径，兼容子路径）：

```html
<link rel="stylesheet" href="assets/style.css">
<script src="assets/core.js"></script>
<script src="assets/app.js"></script>
```

⚠️ 千万别写成 `/assets/style.css`（绝对路径会指向 `https://用户名.github.io/assets/...`，404）。

### 3. 题库加载失败

浏览器按 `F12` → Console 看报错。

- 检查 `data/questions.sample.json` 是否真的推上去了（仓库页面能看到吗）
- 检查文件名大小写完全一致
- 检查 JSON 格式合法（不能有尾随逗号）

### 4. 微信扫码打不开 / 提示非官方网页

点「继续访问」。如果连继续访问都没有：

- 确认网址能在电脑浏览器打开
- 确认用的是 `https://` 而不是 `http://`
- 尝试 `https://你的用户名.github.io/quiz/index.html`（完整文件名）

### 5. 更新了但页面没变

- GitHub Pages 部署有 1-3 分钟延迟
- 微信缓存：右上角 → 刷新，或下拉刷新
- 实在不行在网址后面加 `?v=2` 强制换缓存

### 6. Actions 报 `Resource not accessible by integration`

Settings → Actions → General → Workflow permissions → 选 **Read and write permissions**。

### 7. 想让网址更短

仓库名改成 `q`，网址就变成 `https://用户名.github.io/q/`，更短。

也可以用自定义域名（CNAME 文件），但需要一个自己的域名。

---

## 备选方案：Vercel

如果 GitHub Pages 访问慢（国内偶尔抽风），用 Vercel，国内访问通常更快。

### 步骤

1. 打开 `https://vercel.com/signup`，用 GitHub 账号一键登录
2. 登录后点 **Add New...** → **Project**
3. 选择 **Import GitHub Repository** → 选中你的 `quiz` 仓库 → **Import**
4. Framework Preset 选 **Other**，其他都保持默认
5. 点 **Deploy**
6. 等 1-2 分钟，得到网址 `https://quiz-xxxx.vercel.app`

### 用 Vercel 的二维码

打开 `https://quiz-xxxx.vercel.app/cast.html`，大屏页会自动用当前目录地址生成二维码。

### 以后更新题库

Vercel 会在你 `git push` 到 main 分支后**自动重新部署**，不用手动操作。

### 对比

| | GitHub Pages | Vercel |
|---|---|---|
| 国内访问速度 | 一般，偶尔慢 | 较快 |
| 部署方式 | 手动配一次 / Actions 自动 | 导入后全自动 |
| 更新题库后 | 方式 A 自动 / 方式 B 手动 | 自动 |
| 免费额度 | 无限制 |  hobby 额度，静态站足够 |
| 自定义域名 | 支持 | 支持 |

**建议**：两个都部署一遍，Vercel 作为主力，GitHub Pages 作为备份。代码是同一份，不用维护两份。

---

## 完整命令清单（复制粘贴版）

```bash
# ===== 第 2 步：配置 Git（只做一次） =====
git config --global user.name "liu"
git config --global user.email "liu962566@outlook.com"
git config --global init.defaultBranch main

# ===== 第 3 步：上传 =====
cd /d/quiz
git init
git add .
git commit -m "扫码答题程序"
git remote add origin https://github.com/你的用户名/quiz.git
git push -u origin main

# ===== 第 6 步：以后只改题库时 =====
cd /d/quiz
git add data/
git commit -m "更新题库"
git push
```

## 部署后最终检查清单

- [ ] 电脑浏览器打开 `https://用户名.github.io/quiz/` → 显示答题首页
- [ ] 打开 `https://用户名.github.io/quiz/cast.html` → 显示二维码和网址
- [ ] 手机微信扫二维码 → 直接进答题页
- [ ] 答完 50 题 → 显示总分、题号总览（绿/红/灰）
- [ ] 点某个题号 → 展开该题解析
- [ ] 点「查看全体详解」→ 50 题每题下方都有解析
- [ ] 换到另一台手机扫同一个码 → 能独立答题、各自算分
