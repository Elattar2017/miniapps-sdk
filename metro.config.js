const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  transformer: {
    babelTransformerPath: require.resolve('react-native/scripts/transformer'),
  },
};

module.exports = mergeConfig(defaultConfig, config);
