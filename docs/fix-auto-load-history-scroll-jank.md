# auto-load-history 滚动卡顿修复记录（2025，v0.6.4）

## 问题
dsh-experience-plugin 的 auto-load-history 模块导致中键自动滚动（以及任何持续滚动）一卡一卡不丝滑。

## 根因
`src/features/auto-load-history/client/index.ts` 的 MutationObserver 盯 `document.documentElement`（childList+subtree 全开）。DSH 消息列表是虚拟化渲染，持续滚动时每帧都有 DOM 变更 → observer 每 500ms 防抖触发一次 `loadAllHistory()`，内部 `querySelectorAll('.gdEzaW_userRow')` 全量扫描大滚动容器 + 条件满足时还会 click「加载更早」往列表顶部插消息，和滚动抢主线程，造成周期性卡顿。

## 修复（已实施，构建+热重载验证通过）
1. 新增滚动活动跟踪：window 级 scroll 监听（`capture: true, passive: true`），只刷新 `lastScrollActivity` 时间戳，零开销。
2. `loadAllHistory()` 入口处检查：滚动静默期（800ms）内直接 return——滚动期间不扫描、不点击。
3. 加载链进行中开始滚动不会被中断（step/check 轮询不加静默检查，避免加载半途卡死），只影响新链的启动。

## ⚠️ 第一版修复的回归 bug（已修复，浏览器实测复现）
第一版只做「拦下就 return」，导致**自动加载失效**：
- 会话切换的瞬间若用户正在滚动，新会话首批 DOM 插入触发的 observer → 500ms 后的 `loadAllHistory()` 被静默期拦掉；
- 但此时 DOM 已稳定不再有 mutation，observer 永远不会再触发 → 自动加载永久失活，直到下次会话切换；
- 另外 `lastScrollActivity` 初始为 0，页面刚加载时 `performance.now()` 很小（<800ms），首次加载调用也会被误拦。

## 最终修复
1. **静默期重试**：`loadAllHistory()` 被静默期拦下时，排一个 `scrollQuietRetry` 定时器（静默期剩余时间 + 50ms）自动补跑——保证拦掉的永远不会是「最后一次触发」。
2. **初始时间戳**改为 `-SCROLL_QUIET_MS`，首次加载不被误拦。
3. teardown 里清理 `scrollQuietRetry`。

## ⚠️ 第二版修复的回归 bug（用户反馈：卡顿又出现了）
重试修复让加载链活了，但暴露新问题：**滚动静默期只挡「新链的启动」**——链一旦启动（页面刚打开、滚动还没开始时），用户中途开始中键滚动，链里的 `step`/`check` 轮询仍每 200ms 全量扫一遍容器、继续 click 插消息，卡顿全部回来。第一版「不卡」其实是加载链失活的假象。

### 第三版（最终）修复：加载链内也感知滚动
- `step`（下一轮入口）与 `check`（插入等待轮询）开头都加静默期判断：滚动期间**挂起**——不扫描、不点击；
- 关键设计：轮询节拍保持 200ms 不变，挂起时只是空转一次时间戳比较（开销≈0），滚动停止 + 静默期过后**自动续跑**，链不中断、不失活。

## 浏览器实测结论（chrome-devtools MCP，127.0.0.1:3080，第三版）
- 长会话目标 100 条端到端测试：切会话后立刻持续滚动 20s（模拟中键）——加载链在滚动期间**挂起**（13→34 条，增速明显放缓），停止后**自动续跑**（37→44→50→53→…最终 66 条全部历史，olderBtn 消失 = 完成）；
- 滚动期间加载链零扫描零点击，卡顿消除；加载功能完整保留；
- 页面 bundle 确认含最终逻辑；测试后 `dsh-experience:auto-load:count` 已恢复为 20。

## 经验
凡是「全局 MutationObserver + 周期性 DOM 全量扫描」的模式，在虚拟化列表上都会造成滚动卡顿；修复方向是给副作用加「用户交互静默期」（scroll 事件时间戳门控），而不是缩小 observer 范围（DSH 会话切换会重建 scrollBody，观察 documentElement 是有意的）。两条铁律：
1. **门控必须配重试**——observer 驱动的任务被门控拦掉后，若 DOM 已稳定不再产生事件，任务会永久失活；拦下时必须排补跑定时器。
2. **门控必须覆盖长任务全程**——只在任务入口做判断不够，运行中的轮询/链式任务也要在每个节拍上检查静默期（空转等待而非跳过），否则用户中途开始交互时卡顿照样回来。