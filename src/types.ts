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
  isVerified?: boolean;
  verifiedAt?: any;
  sessionVersion?: number;
  friends?: string[];
  friendDetails?: { [uid: string]: {
    displayName?: string;
    photoURL?: string;
    nameColor?: string;
    isVerified?: boolean;
  } };
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
  participantProfiles?: { [userId: string]: {
    displayName?: string;
    photoURL?: string;
    nameColor?: string;
    isVerified?: boolean;
    phoneNumber?: string;
  } };
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
  gameType?: 'ludo' | 'blackjack';
  replyTo?: { id: string; text: string; senderName: string };
  isEdited?: boolean;
}

export interface CardGame21 {
  id: string;
  type: 'blackjack';
  status: 'playing' | 'finished';
  players: string[];
  turn: string;
  hands: { [uid: string]: string[] };
  scores: { [uid: string]: number };
  deck: string[];
  winner: string | null;
  updatedAt: any;
}
