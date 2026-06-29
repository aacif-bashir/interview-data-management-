/** @type {import('@babel/core').ConfigAPI} */
module.exports = function (api) {
  const isDev = api.env("development");

  return {
    presets: ["next/babel"],
    plugins: [
      // LocatorJS: injects __source fiber metadata so the browser extension
      // can map DOM elements back to their source file + line.
      // Only active in development — zero cost in production builds.
      ...(isDev ? [["module:@locator/babel-jsx", { env: "development" }]] : []),
    ],
  };
};
