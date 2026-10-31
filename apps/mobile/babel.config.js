// Preset do Expo (inclui o suporte ao expo-router).
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
