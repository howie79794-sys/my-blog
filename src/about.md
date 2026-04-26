---
layout: layouts/base.njk
title: 关于
permalink: /about/
---

<div class="section-label">关于博主</div>

<div class="about-hero">
  <div class="about-av"><img src="/assets/images/avatar.jpg" alt="稼轩头像" /></div>
  <div>
    <div class="about-name">稼轩</div>
    <div class="about-line">{{ site.description }}</div>
    <div class="about-bio">
      <p>「稼轩长短句」取自南宋词人辛弃疾的词集之名。这里是我日常记录生活、思考与感受的一方小天地。</p>
      <p>没有刻意的主题，没有强求的更新频率。只是想在这个信息过载的时代，留一片能慢下来写字的地方。</p>
    </div>
  </div>
</div>

<div class="about-details">
  <div>
    <div class="about-sec-title">在写什么</div>
    <div class="interest-grid">
      {% for tag in collections.uniquePostTags %}
        <span class="int-chip">{{ tag }}</span>
      {% endfor %}
    </div>
  </div>

  <div>
    <div class="about-sec-title">关于我</div>
    <div class="about-bio">
      <p>目前是一名软件行业从业者，喜欢阅读、听音乐，偶尔会对世界产生一些零碎的想法。</p>
      <p>如果你也喜欢这些文字，欢迎 <a href="/feed.xml">RSS 订阅</a> 或留言交流。</p>
    </div>
  </div>

  <div>
    <div class="about-sec-title">联系方式</div>
    <div class="about-bio">
      <p>GitHub：<a href="https://github.com/howie79794-sys">@howie79794-sys</a></p>
    </div>
  </div>

  <div>
    <div class="about-sec-title">关于这个博客</div>
    <div class="about-bio">
      <p>由 <a href="https://www.11ty.dev/">Eleventy</a> 生成，部署在 Vercel。评论使用 <a href="https://giscus.app/">Giscus</a>（基于 GitHub Discussions）。</p>
      <p>主题支持三种外观：纸 / 摩登 / 午夜，点击右上角图标即可切换。</p>
    </div>
  </div>
</div>
