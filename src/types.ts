export interface UserProfile {
  uid: string;
  phoneNumber: string;
  displayName?: string;
  photoURL?: string;
  status?: string;
  lastSeen?: any;
  nameColor?: string;
  privacy?: {
    phoneNumber?: string;
    lastSeen?: string;
    photo?: string;
  };
  reels?: { id: string; url: string; createdAt: any; caption?: string }[];
  reelsCount?: number;
  lastReelAt?: any;
  blockedUsers?: string[]; // Array of UIDs this user has blocked
  chatBackground?: string;
  magicUnlockedAt?: any;
  animatedColorsUnlockedAt?: any;
  sessionVersion?: number;
  friends?: string[];
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessage?: {
    text: string;
    senderId: string;
    createdAt: any;
  };
  updatedAt: any;
  isGroup?: boolean;
  groupName?: string;
  groupPhoto?: string;
  admins?: string[]; // Array of UIDs who are admins
  memberRoles?: { [userId: string]: { 
    canChangeInfo: boolean; 
    canKick: boolean; 
    canLockChat: boolean; 
    canDeleteMessages: boolean;
    canAddAdmins: boolean;
  } };
  isLocked?: boolean;
  typing?: { [userId: string]: boolean };
  hiddenFor?: string[]; // Array of UIDs who have hidden/deleted the chat for themselves
  call?: {
    type: 'voice' | 'video';
    callerId: string;
    status: 'ringing' | 'active' | 'ended';
    startedAt: any;
  };
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text?: string;
  type: 'text' | 'image' | 'video' | 'file' | 'location' | 'voice';
  fileUrl?: string;
  fileName?: string;
  location?: { latitude: number; longitude: number };
  createdAt: any;
  read?: boolean;
  reactions?: { [emoji: string]: string[] }; // emoji -> list of userIds
  gameId?: string;
  gameType?: 'dominoes' | 'ludo';
  replyTo?: { id: string; text: string; senderName: string };
  isEdited?: boolean;
}

export interface DominoGame {
  id: string;
  type: 'dominoes';
  status: 'waiting' | 'playing' | 'finished';
  players: string[];
  turn: string;
  board: {
    left: number;
    right: number;
    pieces: { value: { a: number; b: number }; side: 'left' | 'right' }[];
  };
  hands: { [uid: string]: { a: number; b: number }[] };
  boneyard: { a: number; b: number }[];
  winner: string | null;
  updatedAt: any;
}

export interface LudoGame {
  id: string;
  type: 'ludo';
  status: 'playing' | 'finished';
  players: string[];
  turn: string;
  positions: { [userId: string]: number[] }; // 4 pieces per player
  diceValue: number;
  winner: string | null;
  updatedAt: any;
}
