import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getNameColorClass(nameColor: string | undefined | null, expiry?: any) {
  if (!nameColor || typeof nameColor !== 'string') return '';
  
  // Check expiry if provided
  if (expiry) {
    const expiryTime = typeof expiry === 'number' ? expiry : (expiry.toMillis ? expiry.toMillis() : 0);
    if (expiryTime > 0 && Date.now() > expiryTime) return '';
  }
  
  if (nameColor === 'magic') return 'magic-color-text';
  if (nameColor === 'magic_neon') return 'magic-neon-orange-text';
  if (nameColor === 'magic_rb') return 'magic-red-blue-text';
  if (nameColor === 'magic_pb') return 'magic-pink-black-text';
  if (nameColor === 'magic_iraq') return 'magic-iraq-text';
  if (nameColor === 'magic_iraq_phosphor') return 'magic-iraq-phosphor-text';
  if (nameColor === 'magic_neon_orange_moving') return 'magic-neon-orange-moving-text';
  if (nameColor === 'magic_neon_green_moving') return 'magic-neon-green-moving-text';
  if (nameColor === 'magic_red_yellow_moving') return 'magic-red-yellow-moving-text';
  if (nameColor === 'magic_phosphor_moving') return 'magic-phosphor-moving-text';
  if (nameColor === 'animated-green') return 'animated-green-text';
  if (nameColor === 'animated-red') return 'animated-red-text';
  if (nameColor === 'animated-blue') return 'animated-blue-text';
  if (nameColor === 'animated-purple') return 'animated-purple-text';
  if (nameColor === 'animated-gold') return 'animated-gold-text';
  if (nameColor === 'animated-silver') return 'animated-silver-text';
  if (nameColor === 'animated-rainbow') return 'animated-rainbow-text';
  if (nameColor === 'animated-carbon') return 'animated-carbon-text';
  if (nameColor === 'animated-neon-yellow') return 'animated-neon-yellow-text';
  if (nameColor === 'animated-fire') return 'animated-fire-text';
  if (nameColor === 'animated-neon-red') return 'animated-neon-red-text';
  
  return '';
}

export function isMagicColor(nameColor: string | undefined | null, expiry?: any) {
  if (!nameColor || typeof nameColor !== 'string') return false;

  if (expiry) {
    const expiryTime = typeof expiry === 'number' ? expiry : (expiry.toMillis ? expiry.toMillis() : 0);
    if (expiryTime > 0 && Date.now() > expiryTime) return false;
  }

  return nameColor.startsWith('magic') || nameColor.startsWith('animated-');
}
