import { UserRepository } from "../domain/UserRepository.js";
import { User } from "../domain/User.js";

interface SyncUserDTO {
  firebaseUid: string;
  email: string;
  name?: string;
}

export class SyncUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(dto: SyncUserDTO): Promise<User> {
    const existingUser = await this.userRepository.findByFirebaseUid(dto.firebaseUid);

    if (existingUser) {
      // Si el usuario ya existe, actualizamos su nombre o email en caso de que hayan cambiado
      return await this.userRepository.update(dto.firebaseUid, {
        email: dto.email,
        name: dto.name || existingUser.name,
      });
    }

    // Si no existe, creamos un nuevo perfil por defecto
    return await this.userRepository.create({
      firebaseUid: dto.firebaseUid,
      email: dto.email,
      name: dto.name,
      isPaused: false,
      leverage: 1, // Apalancamiento conservador por defecto
    });
  }
}
