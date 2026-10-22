// Immutable derivatives beside their original; no paid transformation endpoint.
export const mediaVariantSpecs = {
  avatar: { width: 160, height: 160, maxBytes: 24 * 1024 },
  thumbnail: { width: 640, height: 480, maxBytes: 80 * 1024 },
  detail: { width: 1280, height: 960, maxBytes: 240 * 1024 },
} as const;
export type StoredMediaVariant = keyof typeof mediaVariantSpecs;
export function mediaVariantPath(original: string, variant: StoredMediaVariant): string {
  if (!Object.hasOwn(mediaVariantSpecs, variant) || !original || original.includes(".."))
    throw new Error("Invalid media variant");
  return `${original}.lms-v1-${variant}.webp`;
}
export function webpDimensions(bytes: Uint8Array): {width:number;height:number} | null {
  const text=(start:number,end:number)=>new TextDecoder().decode(bytes.slice(start,end));
  if(bytes.length<30||text(0,4)!=="RIFF"||text(8,12)!=="WEBP")return null;
  const le24=(n:number)=>bytes[n]|bytes[n+1]<<8|bytes[n+2]<<16;
  if(text(12,16)==="VP8X")return {width:1+le24(24),height:1+le24(27)};
  if(text(12,16)==="VP8 "&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)
    return {width:(bytes[26]|bytes[27]<<8)&16383,height:(bytes[28]|bytes[29]<<8)&16383};
  if(text(12,16)==="VP8L"&&bytes[20]===47)
    return {width:1+((bytes[21]|bytes[22]<<8)&16383),height:1+((bytes[22]>>6|bytes[23]<<2|bytes[24]<<10)&16383)};
  return null;
}
