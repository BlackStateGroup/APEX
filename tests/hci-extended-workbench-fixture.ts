// Manually authored bytes. Independent of the core encoder/selector; never a capture.
export const marker = 'PRIVATE_EXTENDED_PAYLOAD';
export function header(status = 0, data = Buffer.from(marker)) {
 const b = Buffer.alloc(24 + data.length); b.writeUInt16LE(status * 32);
 b[2] = 255; b.set([161,162,163,164,165,166],3); b[9]=3; b[10]=4; b[11]=255;
 b[12]=127; b[13]=192; b.writeUInt16LE(6,14); b[16]=3; b.set([177,178,179,180,181,182],17);
 b[23]=data.length; b.set(data,24); return b;
}
export function record(rows = [header()]) {
 const payload=Buffer.concat([Buffer.from([4,62,2+rows.reduce((n,r)=>n+r.length,0),13,rows.length]),...rows]);
 const b=Buffer.alloc(24);b.writeUInt32BE(payload.length);b.writeUInt32BE(payload.length,4);b.writeUInt32BE(3,8);return Buffer.concat([b,payload]);
}
export function source(records = [record()]) {return Buffer.concat([Buffer.from('6274736e6f6f700000000001000003ea','hex'),...records]).toString('hex');}
