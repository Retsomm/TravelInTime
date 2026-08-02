const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 讓 Metro 把 .epub 當成靜態資源打包，才能用 require() 引入內建範例書籍。
config.resolver.assetExts.push('epub');

module.exports = config;
