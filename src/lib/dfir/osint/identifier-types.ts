// src/lib/dfir/osint/identifier-types.ts
import type { LucideIcon } from 'lucide-react';
import {
  Instagram,
  Twitter,
  Facebook,
  Linkedin,
  Youtube,
  Github,
  Send,
  MessageCircle,
  Phone,
  Mail,
  Globe,
  User,
  Calendar,
  MapPin,
  Car,
  CreditCard,
  IdCard,
  AtSign,
  Hash,
  FileText,
  Camera,
  Building2,
} from 'lucide-react';
import type { IdentifierCategory } from './osint-schema';

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
}
export interface IdentifierTypeDef {
  type: string;
  category: IdentifierCategory;
  label: string;
  icon: LucideIcon;
  fields: readonly FieldDef[];
}

export const IDENTIFIER_CATEGORIES: IdentifierCategory[] = ['social', 'contact', 'personal', 'vehicle', 'other'];

const handle: readonly FieldDef[] = [
  { key: 'handle', label: 'Handle / username', placeholder: '@example' },
  { key: 'url', label: 'Profile URL', placeholder: 'https://…' },
  { key: 'notes', label: 'Notes' },
];

export const IDENTIFIER_TYPES: IdentifierTypeDef[] = [
  // Social
  { type: 'instagram', category: 'social', label: 'Instagram', icon: Instagram, fields: handle },
  { type: 'twitter', category: 'social', label: 'X / Twitter', icon: Twitter, fields: handle },
  { type: 'facebook', category: 'social', label: 'Facebook', icon: Facebook, fields: handle },
  { type: 'linkedin', category: 'social', label: 'LinkedIn', icon: Linkedin, fields: handle },
  { type: 'youtube', category: 'social', label: 'YouTube', icon: Youtube, fields: handle },
  { type: 'github', category: 'social', label: 'GitHub', icon: Github, fields: handle },
  { type: 'telegram', category: 'social', label: 'Telegram', icon: Send, fields: handle },
  { type: 'discord', category: 'social', label: 'Discord', icon: MessageCircle, fields: handle },
  { type: 'username', category: 'social', label: 'Generic username', icon: AtSign, fields: handle },
  // Contact
  {
    type: 'phone',
    category: 'contact',
    label: 'Phone number',
    icon: Phone,
    fields: [
      { key: 'number', label: 'Number', placeholder: '+1 555 …' },
      { key: 'carrier', label: 'Carrier' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'email',
    category: 'contact',
    label: 'Email address',
    icon: Mail,
    fields: [
      { key: 'address', label: 'Email', placeholder: 'name@example.com' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'website',
    category: 'contact',
    label: 'Website',
    icon: Globe,
    fields: [
      { key: 'url', label: 'URL', placeholder: 'https://…' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  // Personal
  {
    type: 'person',
    category: 'personal',
    label: 'Person / name',
    icon: User,
    fields: [
      { key: 'fullName', label: 'Full name' },
      { key: 'aliases', label: 'Aliases' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'dob',
    category: 'personal',
    label: 'Date of birth',
    icon: Calendar,
    fields: [
      { key: 'date', label: 'Date' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'address',
    category: 'personal',
    label: 'Address',
    icon: MapPin,
    fields: [
      { key: 'address', label: 'Street address' },
      { key: 'city', label: 'City' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'photo',
    category: 'personal',
    label: 'Photo / image',
    icon: Camera,
    fields: [
      { key: 'url', label: 'Image URL' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'employer',
    category: 'personal',
    label: 'Employer / org',
    icon: Building2,
    fields: [
      { key: 'name', label: 'Organisation' },
      { key: 'role', label: 'Role' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  // Vehicle
  {
    type: 'license-plate',
    category: 'vehicle',
    label: 'License plate',
    icon: CreditCard,
    fields: [
      { key: 'plate', label: 'Plate' },
      { key: 'region', label: 'Region / state' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'vehicle',
    category: 'vehicle',
    label: 'Vehicle',
    icon: Car,
    fields: [
      { key: 'makeModel', label: 'Make / model' },
      { key: 'color', label: 'Color' },
      { key: 'vin', label: 'VIN' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  // Other
  {
    type: 'document',
    category: 'other',
    label: 'Document / ID',
    icon: IdCard,
    fields: [
      { key: 'kind', label: 'Document kind' },
      { key: 'number', label: 'Number' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'crypto',
    category: 'other',
    label: 'Crypto address',
    icon: Hash,
    fields: [
      { key: 'address', label: 'Address' },
      { key: 'chain', label: 'Chain' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  {
    type: 'other',
    category: 'other',
    label: 'Other / note',
    icon: FileText,
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'value', label: 'Value' },
      { key: 'notes', label: 'Notes' },
    ],
  },
];

const BY_TYPE = new Map(IDENTIFIER_TYPES.map((t) => [t.type, t]));
const fallbackEntry = BY_TYPE.get('other');
if (!fallbackEntry) throw new Error('identifier-types: "other" entry is required');
const FALLBACK: IdentifierTypeDef = fallbackEntry;

export function getIdentifierType(type: string): IdentifierTypeDef {
  return BY_TYPE.get(type) ?? FALLBACK;
}
