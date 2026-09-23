import { User } from "./User.js";

export interface UserRepository {
  findByFirebaseUid(uid: string): Promise<User | null>;
  create(user: Omit<User, "id">): Promise<User>;
  update(uid: string, data: Partial<User>): Promise<User>;
}
