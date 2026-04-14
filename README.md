# 稼轩长短句（Eleventy）

个人博客记录。

## 本地启动

```bash
npm install
npm run dev
```

## 构建产物

```bash
npm run build
```

## 构建并生成搜索索引（Pagefind）

```bash
npm run build:search
```

## 写作方式

在 `src/posts/` 下新增 Markdown 文件，写好 Front Matter：

```md
---
layout: layouts/post.njk
title: 文章标题
date: 2026-04-14
tags:
  - 生活记录
excerpt: 摘要
---

正文...
```

## 评论系统（Giscus）

在 `src/_data/site.json` 修改 `giscus` 配置字段。

## RSS

自动生成 `/feed.xml`。
