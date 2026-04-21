const rssPlugin = require("@11ty/eleventy-plugin-rss");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(rssPlugin);
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  eleventyConfig.addCollection("posts", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/posts/*.md")
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addCollection("uniquePostTags", function (collectionApi) {
    const posts = collectionApi.getFilteredByGlob("src/posts/*.md");
    const tagSet = new Set();
    posts.forEach((post) => {
      (post.data.tags || []).forEach((tag) => tagSet.add(tag));
    });
    return [...tagSet];
  });

  eleventyConfig.addCollection("postsByYear", function (collectionApi) {
    const posts = collectionApi
      .getFilteredByGlob("src/posts/*.md")
      .sort((a, b) => b.date - a.date);
    const groups = {};
    posts.forEach((post) => {
      const year = post.date.getFullYear();
      if (!groups[year]) groups[year] = [];
      groups[year].push(post);
    });
    return Object.keys(groups)
      .sort((a, b) => b - a)
      .map((year) => ({ year: Number(year), posts: groups[year] }));
  });

  eleventyConfig.addCollection("defaultTagGroups", function (collectionApi) {
    const posts = collectionApi
      .getFilteredByGlob("src/posts/*.md")
      .sort((a, b) => b.date - a.date);

    const defaultTags = ["生活记录", "心情感想", "内容分享"];
    return defaultTags.map((tag) => ({
      tag,
      posts: posts.filter((post) => (post.data.tags || []).includes(tag))
    }));
  });

  eleventyConfig.addFilter("dateCn", (dateObj) => {
    if (!dateObj) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(dateObj);
  });

  eleventyConfig.addFilter("htmlDateString", (dateObj) => {
    if (!dateObj) return "";
    return dateObj.toISOString().slice(0, 10);
  });

  // Reading-time estimate:
  // - Chinese chars at ~300 chars/min
  // - English words at ~200 words/min
  // - Always rounds up and shows at least 1 minute
  eleventyConfig.addFilter("readingTime", (content) => {
    if (!content) return "约 1 分钟";
    const text = String(content).replace(/<[^>]*>/g, "");
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const minutes = Math.max(1, Math.ceil(chineseChars / 300 + englishWords / 200));
    return `约 ${minutes} 分钟`;
  });

  // Prev / next helpers that work with our newest-first "posts" collection.
  // "newer" = earlier in array, "older" = later in array.
  eleventyConfig.addFilter("newerPost", (posts, url) => {
    if (!posts || !url) return null;
    const idx = posts.findIndex((p) => p.url === url);
    if (idx <= 0) return null;
    return posts[idx - 1];
  });

  eleventyConfig.addFilter("olderPost", (posts, url) => {
    if (!posts || !url) return null;
    const idx = posts.findIndex((p) => p.url === url);
    if (idx < 0 || idx >= posts.length - 1) return null;
    return posts[idx + 1];
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      output: "_site"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
