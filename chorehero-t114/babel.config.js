module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@':              './src',
            '@/components':   './src/components',
            '@/screens':      './src/screens',
            '@/navigation':   './src/navigation',
            '@/theme':        './src/theme',
            '@/content':      './src/content',
          },
        },
      ],
    ],
  };
};
