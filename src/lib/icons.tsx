import {
  Heart, FileText, Stethoscope, ShoppingBasket, House, Briefcase, Plane, Wallet, Sparkles, Zap, Smartphone, Shield,
  Repeat, Dumbbell, Utensils, ShoppingBag, Car, PartyPopper, ChefHat, Sofa, Gift, Lightbulb, NotebookPen, Coffee,
  BookOpen, Baby, PawPrint, GraduationCap, Palette, Camera, Flower2, Leaf, Music2, Film, Wine, Pill, Shirt, Train,
  Star, Target, PiggyBank, Receipt, Tag, type LucideIcon,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  heart: Heart, 'file-text': FileText, stethoscope: Stethoscope, 'shopping-basket': ShoppingBasket, home: House,
  briefcase: Briefcase, plane: Plane, wallet: Wallet, sparkles: Sparkles, zap: Zap, smartphone: Smartphone,
  shield: Shield, repeat: Repeat, dumbbell: Dumbbell, utensils: Utensils, 'shopping-bag': ShoppingBag, car: Car,
  'party-popper': PartyPopper, 'chef-hat': ChefHat, sofa: Sofa, gift: Gift, lightbulb: Lightbulb,
  'notebook-pen': NotebookPen, coffee: Coffee, book: BookOpen, baby: Baby, paw: PawPrint, graduation: GraduationCap,
  palette: Palette, camera: Camera, flower: Flower2, leaf: Leaf, music: Music2, film: Film, wine: Wine, pill: Pill,
  shirt: Shirt, train: Train, star: Star, target: Target, piggy: PiggyBank, receipt: Receipt, tag: Tag,
};
export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, size = 16, className }: { name?: string; size?: number; className?: string }) {
  const C = (name && ICONS[name]) || Tag;
  return <C size={size} strokeWidth={1.75} className={className} />;
}

export const COLORS = [
  '#A83278', '#81265D', '#D46A8C', '#E0789E', '#C7A0C9', '#8E6BB0', '#5B6FB5', '#3E9C9B', '#4E9A6A', '#C9A13B', '#C98A4B', '#9C8A96',
];
