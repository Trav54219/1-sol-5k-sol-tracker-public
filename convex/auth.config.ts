const siteUrl = process.env.CONVEX_SITE_URL;

export default {
  providers: siteUrl
    ? [
        {
          domain: siteUrl,
          applicationID: "convex",
        },
      ]
    : [],
};
