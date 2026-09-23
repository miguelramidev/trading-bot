import { db } from "../../../../db/index.js";
import { userConfig } from "../../../../db/schema.js";
import { eq } from "drizzle-orm";
import { User } from "../domain/User.js";
import { UserRepository } from "../domain/UserRepository.js";

export class PostgresUserRepository implements UserRepository {
  async findByFirebaseUid(uid: string): Promise<User | null> {
    const record = await db.query.userConfig.findFirst({
      where: eq(userConfig.firebaseUid, uid),
    });
    if (!record) return null;
    return this.mapToDomain(record);
  }

  async create(user: Omit<User, "id">): Promise<User> {
    const [record] = await db.insert(userConfig)
      .values({
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        isPaused: user.isPaused,
        leverage: user.leverage,
      })
      .returning();
    return this.mapToDomain(record);
  }

  async update(uid: string, data: Partial<User>): Promise<User> {
    const [record] = await db.update(userConfig)
      .set({
        email: data.email,
        name: data.name,
        isPaused: data.isPaused,
        leverage: data.leverage,
      })
      .where(eq(userConfig.firebaseUid, uid))
      .returning();
    return this.mapToDomain(record);
  }

  private mapToDomain(record: any): User {
    return {
      id: record.id,
      chatId: record.chatId,
      firebaseUid: record.firebaseUid!,
      email: record.email!,
      name: record.name,
      isPaused: record.isPaused,
      leverage: record.leverage,
    };
  }
}
