const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'production',
  devtool: 'source-map',
  entry: {
    popup: './src/popup/index.tsx',
    background: './src/background/index.ts',
    content: './src/content/index.ts',
    dashboard: './src/dashboard/index.tsx',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    publicPath: '',
  },
  performance: {
    hints: false,
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/popup/index.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),
    new HtmlWebpackPlugin({
      template: './src/dashboard/index.html',
      filename: 'dashboard.html',
      chunks: ['dashboard'],
    }),
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '.' },
        { from: 'manifest.json', to: '.' },
        { from: 'src/icons', to: 'icons' },
        { from: 'public/icon16.png', to: 'icon16.png' },
        { from: 'public/icon48.png', to: 'icon48.png' },
        { from: 'public/icon128.png', to: 'icon128.png' },
        { from: 'src/icons/icon16.png', to: 'icons/icon16.png' },
        { from: 'src/icons/icon48.png', to: 'icons/icon48.png' },
        { from: 'src/icons/icon128.png', to: 'icons/icon128.png' },
        { from: 'public/diff-viewer.html', to: 'diff-viewer.html' },
        { from: 'public/diff-viewer.js', to: 'diff-viewer.js' },
        { from: 'public/diff-viewer-loader.js', to: 'diff-viewer-loader.js' },
      ],
    }),
  ],
};