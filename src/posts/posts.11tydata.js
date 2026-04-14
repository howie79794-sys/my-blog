module.exports = {
  layout: "layouts/post.njk",
  eleventyComputed: {
    title: (data) => {
      if (data.title) return data.title;
      const slug = (data.page && data.page.fileSlug) || "";
      const cleaned = slug.replace(/^\d{4}-\d{2}-\d{2}[\s_-]*/, "").trim();
      return cleaned || "未命名文章";
    }
  }
};
