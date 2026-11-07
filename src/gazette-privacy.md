---
layout: layouts/base.njk
title: GAZETTE 隐私政策
permalink: /gazette-privacy/
---

<div class="section-label">隐私政策</div>

<div class="post-content">
  <p>本政策适用于 Chrome 扩展程序 <strong>GAZETTE · The Morning Tab</strong>（下称"本扩展"）。最后更新：2026 年 11 月。</p>

  <h2>我们收集哪些信息</h2>
  <p><strong>不收集。</strong>本扩展没有账号体系、没有统计分析 SDK、没有任何服务器端用户数据存储。具体而言：</p>
  <ul>
    <li><strong>阅读状态与偏好</strong>（已读标记、主题选择）仅保存在你浏览器的本地存储（localStorage）中，永远不会离开你的设备。</li>
    <li><strong>位置信息</strong>：仅当你主动授权浏览器定位权限后，用于在新标签页展示当地天气。位置数据只在内存中即时使用（查询天气与城市名），不存储、不上传、不与任何第三方共享。拒绝授权不影响扩展的任何其他功能。</li>
  </ul>

  <h2>数据的流向</h2>
  <ul>
    <li>新标签页会从本扩展作者的博客服务器（Vercel 托管）拉取<strong>只读的新闻数据文件</strong>——请求中不携带任何用户信息或设备标识。</li>
    <li>天气功能调用 Open-Meteo（天气数据）与 BigDataCloud（城市名反查）的公开接口，仅传递经纬度坐标，且仅在你授权定位后发生。</li>
  </ul>

  <h2>权限说明</h2>
  <ul>
    <li><code>newtab</code>：本扩展的唯一用途就是提供一个报纸风格的新标签页。</li>
    <li><code>geolocation</code>：可选、需你主动授权，仅用于上述天气展示。</li>
    <li>三个网络权限：分别用于拉取新闻数据、天气数据、城市名称，均为只读公开数据。</li>
  </ul>

  <h2>卸载</h2>
  <p>随时可在 Chrome 扩展管理页移除本扩展，本地存储的偏好数据随之全部删除，我们服务器上没有任何你的残留数据（因为从来就没有过）。</p>

  <h2>联系方式</h2>
  <p>对本政策有疑问，可通过博客<a href="/about/">关于页</a>上的方式联系作者。</p>
</div>
