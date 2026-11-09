import type { User } from "../../db/schema.js";

export function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    username: user.username,
    role: user.role,
    disabledAt: user.disabledAt,
    employeeId: user.employeeId,
    lastSignInAt: user.lastSignInAt,
  };
}
