export interface User {
  id?: number;
  chatId?: string | null;
  firebaseUid: string;
  email: string;
  name?: string | null;
  isPaused: boolean;
  leverage: number;
}
