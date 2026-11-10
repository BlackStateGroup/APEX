import ExpoModulesCore
import Foundation
import Security

public class ApexTrustModule: Module {
  private func bytes(_ values: [Double], _ minimum: Int, _ maximum: Int) throws -> Data {
    guard (minimum...maximum).contains(values.count), values.allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 255 && $0.rounded(.towardZero) == $0 }) else {
      throw NSError(domain: "ApexTrust", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid verification bytes"])
    }
    return Data(values.map { UInt8($0) })
  }
  public func definition() -> ModuleDefinition {
    Name("ApexTrust")
    Function("isSupported") { true }
    Function("randomChallenge") { () throws -> [Int] in
      var value = [UInt8](repeating: 0, count: 32)
      guard SecRandomCopyBytes(kSecRandomDefault, value.count, &value) == errSecSuccess else {
        throw NSError(domain: "ApexTrust", code: 2, userInfo: [NSLocalizedDescriptionKey: "Secure random unavailable"])
      }
      return value.map { Int($0) }
    }
    Function("monotonicMilliseconds") { ProcessInfo.processInfo.systemUptime * 1000 }
    AsyncFunction("verifyEd25519") { (key: [Double], message: [Double], signature: [Double]) throws -> Bool in
      Ed25519Verifier.verify(key: try self.bytes(key, 32, 32), message: try self.bytes(message, 1, 523), signature: try self.bytes(signature, 64, 64))
    }
  }
}
