const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const previous = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
  /[/\\]research[/\\]upstream-sources[/\\].*/,
];
module.exports = config;
