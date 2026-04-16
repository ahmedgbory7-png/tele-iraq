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
  typing?: { [userId: string]: boolean };
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text?: string;
  type: 'text' | 'image' | 'video' | 'file' | 'location';
  fileUrl?: string;
  fileName?: string;
  location?: { latitude: number; longitude: number };
  createdAt: any;
  read?: boolean;
  reactions?: { [emoji: string]: string[] }; // emoji -> list of userIds
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
