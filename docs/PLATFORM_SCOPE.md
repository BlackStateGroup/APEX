# iPhone and Android

APEX targets both iPhone and Android as first-class clients. The owner uses iPhone. Android-first is no longer the delivery scope.

The React Native/Expo interface and TypeScript protocol/session code are shared. Android currently has a compiled USB/NFC module. Native NFC and custom AXP BLE integrations are implemented for both platforms, using pinned react-native-nfc-manager and react-native-ble-plx releases. Physical iPhone testing is still pending; new native build results are recorded per revision. Sharing the application code does not establish equal native hardware capability.

Every adapter must record iOS and Android implementation, build and physical-test status independently. New work must include the iPhone path from the design stage, with explicit limitations where an interface is unavailable. The accessory firmware and upstream reference library serve both clients.
