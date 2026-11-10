import expo.modules.apextrust.Ed25519Verifier;
import java.nio.file.Files;
import java.nio.file.Path;
public final class NativeTrustCheck {
  private static byte[] hex(String value) {
    if (value.equals("-")) return new byte[0];
    return java.util.HexFormat.of().parseHex(value);
  }
  public static void main(String[] args) throws Exception {
    int count = 0;
    for (String line : Files.readAllLines(Path.of(args[0]))) {
      String[] fields = line.split(" ");
      boolean expected = fields[0].equals("1"), actual;
      try { actual = Ed25519Verifier.verify(hex(fields[1]), hex(fields[2]), hex(fields[3])); }
      catch (java.security.GeneralSecurityException error) { actual = false; }
      if (actual != expected) throw new AssertionError("Native Java verification mismatch at " + count);
      count++;
    }
    if (count < 20) throw new AssertionError("Missing verification cases");
    System.out.println("Java Ed25519: " + count + " C-generated valid/tampered/bounded cases passed.");
  }
}
