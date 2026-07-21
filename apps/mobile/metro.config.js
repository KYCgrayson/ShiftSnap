const { getDefaultConfig } = require('expo/metro-config');

// Expo SDK 52+ detects pnpm workspaces and configures monorepo resolution.
// Keeping the default config also keeps Metro and native autolinking aligned.
module.exports = getDefaultConfig(__dirname);
