"use client";

import { useState } from "react";

export function ProfileAvatar({ photoUrl, name }: { photoUrl?: string | null; name: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return <div aria-hidden="true" className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/15">
    {initials || "?"}
    {photoUrl && failedUrl !== photoUrl ? (
      // Convex storage URLs are dynamic; use the original thumbnail directly.
      // eslint-disable-next-line @next/next/no-img-element
      <img key={photoUrl} src={photoUrl} alt="" width={40} height={40} className="absolute inset-0 h-full w-full object-cover" onError={() => setFailedUrl(photoUrl)} />
    ) : null}
  </div>;
}
