module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['.'],
        alias: {
          '@sdk': './src',
          '@types': './src/types',
          '@utils': './src/utils',
          '@constants': './src/constants',
        },
      },
    ],
  ],
};
