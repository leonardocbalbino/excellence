// O Metro do Expo detecta o monorepo pnpm (pacotes do workspace, como @excellence/shared).
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * O app usa o @excellence/shared direto do código-fonte (TypeScript), não do `dist/`: o
 * `dist/` fica fora do git e não chega ao EAS Build. Os imports internos do shared seguem o
 * ESM do TypeScript (`./x.js` apontando para `./x.ts`), então o `.js` é tirado antes de
 * resolver.
 */
const sharedSrc = path.resolve(__dirname, '../../packages/shared/src');
const resolveDefault = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveDefault ?? context.resolveRequest;
  if (moduleName === '@excellence/shared') {
    return { type: 'sourceFile', filePath: path.join(sharedSrc, 'index.ts') };
  }
  if (
    context.originModulePath.startsWith(sharedSrc) &&
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js')
  ) {
    return resolve(context, moduleName.slice(0, -3), platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
