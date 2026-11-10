// The first accessory build installs beside the main APEX app.
export default ({ config }) => process.env.EXPO_PUBLIC_APEX_FLIPPER_STATUS === '1' ? {
  ...config,
  scheme: 'apex-flipper',
  ios: { ...config.ios, bundleIdentifier: 'group.blackstate.apex.flipper', supportsTablet: false,
    infoPlist: { ...config.ios?.infoPlist, CFBundleDisplayName: 'APEX Flipper' } },
  // This status-only build does not request NFC access or its signing entitlement.
  plugins: config.plugins.filter(plugin => (Array.isArray(plugin) ? plugin[0] : plugin) !== 'react-native-nfc-manager'),
} : config;
