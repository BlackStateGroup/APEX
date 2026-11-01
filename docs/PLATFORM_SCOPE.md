# iPhone and Android

APEX targets both iPhone and Android as first-class clients. The owner uses iPhone. Android-first is no longer the delivery scope.

The React Native/Expo interface and TypeScript protocol/session code are shared. Android currently has a compiled USB/NFC module. Native iOS integration and physical iPhone testing are still pending. Sharing the application code does not establish equal native hardware capability.

Every adapter must record iOS and Android implementation, build and physical-test status independently. New work must include the iPhone path from the design stage, with explicit limitations where an interface is unavailable. The accessory firmware and upstream reference library serve both clients.
