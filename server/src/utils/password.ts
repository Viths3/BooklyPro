import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
const dummyHash = hashPassword(randomBytes(32).toString('hex'));
export async function comparePassword(
  password: string,
  hash?: string,
): Promise<boolean> {
  const supported = hash !== undefined && /^\$2[ab]\$12\$/.test(hash);
  const matches = await bcrypt.compare(
    password,
    supported ? hash : await dummyHash,
  );
  return supported && matches;
}
