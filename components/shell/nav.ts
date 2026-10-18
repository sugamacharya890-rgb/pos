import {
  BarChart3,
  Boxes,
  ChefHat,
  ClipboardList,
  CreditCard,
  LayoutGrid,
  Settings,
  UtensilsCrossed,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Module } from "@/lib/auth/rbac";

export const NAV: { module: Module; label: string; icon: LucideIcon; group: "service" | "admin" }[] = [
  { module: "floor", label: "Tables", icon: LayoutGrid, group: "service" },
  { module: "orders", label: "Orders", icon: ClipboardList, group: "service" },
  { module: "pos", label: "Checkout", icon: CreditCard, group: "service" },
  { module: "kds", label: "Kitchen", icon: ChefHat, group: "service" },
  { module: "shift", label: "Shift", icon: Wallet, group: "service" },
  { module: "analytics", label: "Analytics", icon: BarChart3, group: "admin" },
  { module: "menu", label: "Menu", icon: UtensilsCrossed, group: "admin" },
  { module: "inventory", label: "Inventory", icon: Boxes, group: "admin" },
  { module: "staff", label: "Staff", icon: Users, group: "admin" },
  { module: "settings", label: "Settings", icon: Settings, group: "admin" },
];
