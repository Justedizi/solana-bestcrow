export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  createdAt: number;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SessionDto {
  user: UserDto;
  token: string;
  expiresAt: number;
}

export interface AuthenticatedSession {
  user: UserDto;
  sessionId: string;
  expiresAt: number;
}
