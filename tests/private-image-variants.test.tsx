// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {PrivateImage} from "../src/components/common/PrivateImage";
const state=vi.hoisted(()=>({keys:[] as string[],error:false}));
vi.mock("../src/services/hooks",()=>({useQuery:(key:string)=>{
  state.keys.push(key);
  return {data:state.error?undefined:{url:"https://example.invalid/private-thumbnail.webp",url_expires_at:Date.now()+60000},error:state.error?new Error("unavailable"):null};
}}));
vi.mock("../src/services/queryCache",()=>({useDataScope:()=>({mediaScope:"fixture"})}));
vi.mock("../src/services/db",()=>({edge:vi.fn()}));
afterEach(()=>{cleanup();vi.unstubAllEnvs();state.keys=[];state.error=false;});
describe("stored private image variants",()=>{
  it("keeps a failed thumbnail on the placeholder without requesting the original",()=>{
    vi.stubEnv("VITE_LMS_STORED_MEDIA_VARIANTS","1");
    render(<PrivateImage eager assetId="fixture" alt="Fixture" />);
    fireEvent.error(screen.getByAltText("Fixture"));
    expect(screen.getByAltText("Fixture").getAttribute("src")).toBe("/image-placeholder.svg");
    expect(state.keys.some(key=>key.includes("image:original:"))).toBe(false);
  });
  it("does not request an original when signing a stored thumbnail fails",()=>{
    vi.stubEnv("VITE_LMS_STORED_MEDIA_VARIANTS","1");state.error=true;
    render(<PrivateImage eager assetId="fixture" alt="Fixture" />);
    expect(screen.getByAltText("Fixture").getAttribute("src")).toBe("/image-placeholder.svg");
    expect(state.keys.some(key=>key.includes("image:original:"))).toBe(false);
  });
  it("preserves the existing legacy fallback until stored variants are enabled",()=>{
    vi.stubEnv("VITE_LMS_STORED_MEDIA_VARIANTS","0");
    render(<PrivateImage eager assetId="fixture" alt="Fixture" />);
    fireEvent.error(screen.getByAltText("Fixture"));
    expect(state.keys.some(key=>key.includes("image:original:"))).toBe(true);
  });
});
