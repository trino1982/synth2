const webpack = require('webpack');
const path = require('path');

module.exports = function override(config) {
  // Add fallbacks for Node.js core modules
  config.resolve.fallback = {
    ...config.resolve.fallback,
    "crypto": require.resolve("crypto-browserify"),
    "stream": require.resolve("stream-browserify"),
    "path": require.resolve("path-browserify"),
    "os": require.resolve("os-browserify/browser"),
    "buffer": require.resolve("buffer/"),
    "process": require.resolve("process/browser"),
    "zlib": require.resolve("browserify-zlib"),
    "util": require.resolve("util/"),
    "querystring": require.resolve("querystring-es3"),
    "assert": require.resolve("assert/"),
    "fs": false,
    "http": false,
    "https": false,
    "net": false,
    "tls": false,
  };

  // Add alias for process/browser
  config.resolve.alias = {
    ...config.resolve.alias,
    'process/browser': path.resolve(__dirname, 'src/process-browser-mock.js'),
  };

  // Add plugins
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ];

  return config;
};
