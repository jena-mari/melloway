module.exports = function (api) {
  api.cache(true);
  return {
    // SDK 54 needs this opt-in for the existing Zustand ESM middleware.
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
  };
};
