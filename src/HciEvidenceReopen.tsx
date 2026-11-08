import React, { useLayoutEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { HciDocumentState } from './hci-document-workbench.ts';
import type { EvidenceRecord, EvidenceStore } from '../packages/core/evidence.ts';
import { HciEvidenceReopenController } from './hci-evidence-reopen.ts';
import { HciDocumentWorkbenchView } from './HciDocumentWorkbench.tsx';
import { hciDigest } from './platform/hci-digest';
export function HciEvidenceReopen({ record, store }: { record: EvidenceRecord; store: Pick<EvidenceStore, 'verify'> }) {
 const [controller] = useState(() => new HciEvidenceReopenController(record, hciDigest));
 const [, refresh] = useState(0); const changed = () => refresh(n => n + 1);
 // Prop replacement invalidates old callbacks before the new tree is rendered.
 controller.replace(record);
 useLayoutEffect(() => { controller.activate(); changed(); return () => controller.deactivate(); }, [controller]);
 const lease = controller.lease, state = controller.state;
 return <HciEvidenceReopenView state={state} pending={controller.pending} message={controller.message}
 reopen={() => { void controller.reopen(store, lease, state).then(() => { if (controller.isActive(lease)) changed(); }); changed(); }}
 page={p => { controller.page(p, lease, state); changed(); }} />;
}
export function HciEvidenceReopenView({ state, pending, message, reopen, page }: { state: HciDocumentState; pending: boolean; message: string; reopen: () => void; page: (p: number) => void }) {
 return <View><Text>{message}</Text><Text>Journal observedAt is declared save time, never authenticated capture time. Original capture hash, size, index and offset remain UNVERIFIED.</Text>
 <Pressable accessibilityRole="button" accessibilityLabel="Check and reopen saved HCI document" disabled={pending} onPress={reopen}><Text>Check and reopen saved HCI document</Text></Pressable>
 {state.value && <HciDocumentWorkbenchView state={state} edit={() => {}} clear={() => {}} verify={() => {}} page={page} readonly />}
 </View>;
}