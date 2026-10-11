import type { ReactElement } from "react";

export default function MapSpotPreview(props: {
  points: { id: string; name: string; cost?: number; tags?: string[]; image?: string }[];
  onSelect: (id: string) => void;
  onClose: () => void;
}): ReactElement;
