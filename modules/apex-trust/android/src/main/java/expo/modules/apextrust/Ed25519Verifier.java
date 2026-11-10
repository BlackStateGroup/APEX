package expo.modules.apextrust;

import java.security.KeyFactory;
import java.security.Signature;
import java.security.GeneralSecurityException;
import java.security.spec.X509EncodedKeySpec;

/** Pure Ed25519 verification only. No key import into a trust store or signing. */
public final class Ed25519Verifier {
  private Ed25519Verifier() {}
  public static boolean verify(byte[] key, byte[] message, byte[] signature) throws GeneralSecurityException {
    if (key == null || key.length != 32 || signature == null || signature.length != 64 ||
        message == null || message.length < 1 || message.length > 523) return false;
    // RFC 8410 SubjectPublicKeyInfo wrapper around the explicitly paired raw key.
    byte[] spki = new byte[44];
    byte[] prefix = {0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00};
    System.arraycopy(prefix, 0, spki, 0, 12);
    System.arraycopy(key, 0, spki, 12, 32);
    Signature verifier = Signature.getInstance("Ed25519");
    verifier.initVerify(KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(spki)));
    verifier.update(message);
    return verifier.verify(signature);
  }
}
