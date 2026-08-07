import {
  FiBookmark,
  FiBookOpen,
  FiClock,
  FiCrosshair,
  FiFileText,
  FiGrid,
  FiHardDrive,
  FiFolder,
  FiTrendingUp,
  FiType,
} from "react-icons/fi";
import { isLocalFrontend } from "../utils/media";

export const NAV_ITEMS = [
  {
    to: "/",
    label: "Dashboard",
    icon: FiGrid,
    match: (path) => path === "/",
  },
  {
    to: "/mission",
    label: "Today's Target",
    icon: FiCrosshair,
    match: (path) => path.startsWith("/mission"),
  },
  {
    to: "/papers",
    label: "PYQ Papers",
    icon: FiFileText,
    match: (path) => path.startsWith("/papers") || path.startsWith("/paper/"),
  },
  {
    to: "/cloudinary",
    label: "Cloudinary Storage",
    icon: FiHardDrive,
    match: (path) => path.startsWith("/cloudinary"),
  },
  {
    to: "/settings/pc-media",
    label: "PC Media Storage",
    icon: FiFolder,
    localOnly: true,
    match: (path) => path.startsWith("/settings/pc-media"),
  },
  {
    to: "/vocabulary",
    label: "Vocabulary",
    icon: FiBookOpen,
    match: (path) => path.startsWith("/vocabulary"),
  },
  {
    to: "/idioms",
    label: "Idioms",
    icon: FiBookmark,
    match: (path) => path.startsWith("/idioms"),
  },
  {
    to: "/one-word-substitution",
    label: "One Word",
    icon: FiType,
    match: (path) => path.startsWith("/one-word-substitution"),
  },
  {
    to: "/history",
    label: "Watch History",
    icon: FiClock,
    match: (path) => path === "/history",
  },
  {
    to: "/history/intelligence",
    label: "Study Intelligence",
    icon: FiTrendingUp,
    match: (path) => path.startsWith("/history/intelligence"),
  },
];

export const getVisibleNavItems = () =>
  NAV_ITEMS.filter((item) => !item.localOnly || isLocalFrontend());
