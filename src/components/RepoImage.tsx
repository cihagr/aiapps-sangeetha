import React, { useEffect, useState } from "react";
import { AGENT_GENERATIVE_API_URL } from "@/utils/Aigapi";

type RepoImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
};

// Extract the blob path (everything after the container) from an Azure blob URL.
// e.g. https://acct.blob.core.windows.net/esaiknowledgebase/image_repository/general_images/pic.png?sas
//   -> image_repository/general_images/pic.png
function extractBlobPath(url: string): string {
  const m = String(url || "").match(/blob\.core\.windows\.net\/[^/]+\/([^?]+)/i);
  return m ? decodeURIComponent(m[1]) : "";
}

/**
 * <img> wrapper that transparently refreshes an expired Azure SAS URL.
 * If the image fails to load (e.g. 403 because the SAS token expired), it asks
 * the backend for a freshly-signed URL and retries once.
 */
const RepoImage: React.FC<RepoImageProps> = ({ src, ...imgProps }) => {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    setCurrentSrc(src);
    setRefreshed(false);
  }, [src]);

  const handleError = async () => {
    if (refreshed) return; // only try once to avoid loops
    setRefreshed(true);
    const path = extractBlobPath(src);
    if (!path) return;
    try {
      const resp = await fetch(
        `${AGENT_GENERATIVE_API_URL}/refresh-image-url?path=${encodeURIComponent(path)}`
      );
      const data = await resp.json();
      if (data?.url) setCurrentSrc(data.url);
    } catch (e) {
      // Leave the (broken) original src if refresh fails.
      console.error("Failed to refresh image URL", e);
    }
  };

  return <img src={currentSrc} onError={handleError} {...imgProps} />;
};

export default RepoImage;
