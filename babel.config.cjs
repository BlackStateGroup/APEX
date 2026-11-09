const path = require('node:path');
const frozenControllers = new Set([
  'evidence-bundle-workbench',
  'hci-comparison-workbench',
  'hci-document-workbench',
  'hci-evidence-reopen',
  'hci-workbench',
  'iq-workbench',
  'ir-receiver-workbench',
  'ir-workbench',
  'native-hci-file',
  'nfc-static-workbench',
].map(name => path.join(__dirname, 'src', `${name}.ts`)));

module.exports = {
  presets: ['babel-preset-expo'],
  overrides: [{
    // These controllers freeze their public surface, but their private state is
    // mutable. Expo's loose private transforms put that state on the instance,
    // where Object.freeze makes it read-only. Use spec WeakMap/WeakSet storage
    // only for these modules, retaining both lifecycle and ownership contracts.
    // Expo also loads this config without a filename when computing cache keys.
    include: filename => typeof filename === 'string' && frozenControllers.has(path.resolve(filename)),
    plugins: [
      ['@babel/plugin-transform-class-properties', { loose: false }],
      ['@babel/plugin-transform-private-methods', { loose: false }],
      ['@babel/plugin-transform-private-property-in-object', { loose: false }],
    ],
  }],
};
