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
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text?: string;
  type: 'text' | 'image' | 'video' | 'file';
  fileUrl?: string;
  fileName?: string;
  createdAt: any;
}
