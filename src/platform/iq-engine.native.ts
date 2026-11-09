import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { IqAnalysisEngine } from '../iq-engine.ts';
interface ApexIqModule {
 capabilities():{available:boolean;contractVersion:number;backend:string;cancellation:string;mobileRust:boolean};
 openSession():number;reserve(session:number,request:number):void;
 execute(request:Uint8Array):Promise<Uint8Array>;
 cancel(session:number,request:number):void;closeSession(session:number):void;
}
export function createIqAnalysisEngine(){
 const platform=Platform.OS;
 return new IqAnalysisEngine(()=>{
  if(platform!=='android')return null;
  const module=requireOptionalNativeModule<ApexIqModule>('ApexIq');if(!module)return null;
  const cap=module.capabilities();if(cap.available!==true||cap.contractVersion!==1||cap.backend!=='cpp'||cap.cancellation!=='between-frames'||cap.mobileRust!==false)return null;
  const session=module.openSession();
  return {bridge:{session,cancel:(s:number,r:number)=>module.cancel(s,r),execute:(bytes:Uint8Array)=>{
   const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);module.reserve(session,view.getUint32(12,true));return module.execute(bytes);
  }},close:()=>module.closeSession(session)};
 },platform==='android'?'JavaScript fallback. Native C++ module is unavailable or incompatible in this app build.':'JavaScript analysis on iOS. An iOS native FFT binding has not been enabled.');
}
