// O Metro do Expo detecta o monorepo pnpm (pacotes do workspace, como @excellence/shared).
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
