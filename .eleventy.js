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
