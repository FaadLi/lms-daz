import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import { useQuery } from "../../services/hooks";
import { useDataScope } from "../../services/queryCache";
import { edge } from "../../services/db";
import {
  invalidateMedia,
  mediaUrls,
  type MediaLoader,
  type MediaVariant,
  type SignedAsset,
} from "../../services/mediaCache";

const MediaContext = createContext<MediaLoader | null>(null);
export function ParentMediaProvider({
  loader,
  children,
}: {
  loader: MediaLoader;
  children: ReactNode;
}) {
  return (
    <MediaContext.Provider value={loader}>{children}</MediaContext.Provider>
  );
}
const teacherLoader: MediaLoader = async (requests) =>
  (
    await edge<{ items: SignedAsset[] }>(
      { action: "media-urls", requests },
      true,
    )
  ).items;
export function PrivateImage({
  assetId,
  variant = "thumbnail",
  eager = false,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  assetId: string;
  variant?: MediaVariant;
  eager?: boolean;
}) {
  const scope = useDataScope();
  const loader = useContext(MediaContext) || teacherLoader;
  const ref = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(eager);
  const [fallback, setFallback] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string>();
  const allowOriginalFallback = import.meta.env.VITE_LMS_STORED_MEDIA_VARIANTS !== "1";
  useEffect(() => {
    if (eager || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "160px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [eager]);
  const size = fallback ? "original" : variant;
  const query = useQuery(
    `image:${size}:${assetId}`,
    async () =>
      (
        await mediaUrls(
          scope?.mediaScope || "isolated",
          [{ id: assetId, variant: size }],
          loader,
        )
      )[0],
    {
      enabled: visible && !!scope,
      refetchInterval: (query) => {
        const asset = query.state.data as SignedAsset | undefined;
        return asset
          ? Math.max(1000, asset.url_expires_at - Date.now() - 15_000)
          : false;
      },
    },
  );
  const valid = query.data && query.data.url_expires_at > Date.now();
  useEffect(() => {
    if (visible && query.error && !fallback && allowOriginalFallback) setFallback(true);
  }, [visible, query.error, fallback, allowOriginalFallback]);
  return (
    <img
      {...props}
      ref={ref}
      src={valid && query.data!.url !== failedUrl ? query.data!.url : "/image-placeholder.svg"}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      width={props.width || (variant === "avatar" ? 160 : 640)}
      height={props.height || (variant === "avatar" ? 160 : 480)}
      style={{
        backgroundColor: "#f1f5f9",
        aspectRatio: variant === "avatar" ? "1 / 1" : "4 / 3",
        ...props.style,
      }}
      onError={() => {
        if (!allowOriginalFallback) {
          setFailedUrl(query.data?.url);
          return;
        }
        if (!fallback) {
          invalidateMedia(scope?.mediaScope, assetId);
          setFallback(true);
        }
      }}
    />
  );
}
