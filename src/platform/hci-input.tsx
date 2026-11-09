export interface HciInputProps {
 readonly resetKey: number;
 readonly sourceCurrent: () => boolean;
 readonly onBytes: (bytes: Uint8Array) => void;
}
/** Native file controls only; the existing strict hex input remains available on web. */
export function HciInput(_props: HciInputProps) {return null;}
