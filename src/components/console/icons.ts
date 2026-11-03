/**
 * The console's icon map (platform.md PLA-§4.3): the nav table names icons as strings (it is isomorphic and pure);
 * the sidebar and the palette turn them into lucide components here.
 */
import {
  ActivityIcon,
  BadgeCheckIcon,
  BellIcon,
  ChartNoAxesCombinedIcon,
  DatabaseBackupIcon,
  GlobeIcon,
  HeartPulseIcon,
  InboxIcon,
  LayersIcon,
  ListChecksIcon,
  MailIcon,
  MegaphoneIcon,
  ScaleIcon,
  ScanSearchIcon,
  ScrollTextIcon,
  Settings2Icon,
  ShieldAlertIcon,
  SirenIcon,
  SparklesIcon,
  StoreIcon,
  ToggleRightIcon,
  UserPlusIcon,
  UsersIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";
import type { ConsoleIconName } from "./nav";

const ICONS: Record<ConsoleIconName, LucideIcon> = {
  Activity: ActivityIcon,
  Inbox: InboxIcon,
  Bell: BellIcon,
  Store: StoreIcon,
  Users: UsersIcon,
  ScanSearch: ScanSearchIcon,
  ShieldAlert: ShieldAlertIcon,
  Layers: LayersIcon,
  ToggleRight: ToggleRightIcon,
  Globe: GlobeIcon,
  Sparkles: SparklesIcon,
  HeartPulse: HeartPulseIcon,
  DatabaseBackup: DatabaseBackupIcon,
  Megaphone: MegaphoneIcon,
  ChartNoAxesCombined: ChartNoAxesCombinedIcon,
  Settings2: Settings2Icon,
  UserPlus: UserPlusIcon,
  Scale: ScaleIcon,
  BadgeCheck: BadgeCheckIcon,
  Mail: MailIcon,
  UsersRound: UsersRoundIcon,
  ScrollText: ScrollTextIcon,
  Siren: SirenIcon,
  ListChecks: ListChecksIcon,
};

export function consoleIcon(name: ConsoleIconName): LucideIcon {
  return ICONS[name];
}
