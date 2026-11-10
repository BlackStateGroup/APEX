import Foundation
func hex(_ value: Substring) -> Data {
  if value == "-" { return Data() }
  let chars = Array(value)
  var bytes: [UInt8] = []
  for i in stride(from: 0, to: chars.count, by: 2) { bytes.append(UInt8(String(chars[i...i+1]), radix: 16)!) }
  return Data(bytes)
}
let lines = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8).split(separator: "\n")
for (index, line) in lines.enumerated() {
  let fields = line.split(separator: " ")
  let actual = Ed25519Verifier.verify(key: hex(fields[1]), message: hex(fields[2]), signature: hex(fields[3]))
  precondition(actual == (fields[0] == "1"), "Native CryptoKit mismatch at \(index)")
}
precondition(lines.count >= 20, "Missing verification cases")
print("Apple CryptoKit: \(lines.count) C-generated valid/tampered/bounded cases passed.")
