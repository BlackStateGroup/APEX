import Foundation
import CryptoKit

enum Ed25519Verifier {
  static func verify(key: Data, message: Data, signature: Data) -> Bool {
    guard key.count == 32, signature.count == 64, (1...523).contains(message.count),
          let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: key) else { return false }
    return publicKey.isValidSignature(signature, for: message)
  }
}
