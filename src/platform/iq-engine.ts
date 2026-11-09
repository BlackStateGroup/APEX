import { IqAnalysisEngine } from '../iq-engine.ts';
export function createIqAnalysisEngine(){return new IqAnalysisEngine(()=>null,'JavaScript analysis on web. The native Android C++ module is not available on this platform.');}
