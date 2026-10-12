import type { RequestHandler } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { RegisterInput } from '../schemas/auth.schema.js';

export function createAuthController(auth: AuthService) {
  const register: RequestHandler = async (req, res) => {
    const input = req.body as RegisterInput;
    res.status(201).json(await auth.register(input));
  };
  const login: RequestHandler = async (req, res) => {
    const input = req.body as { email: string; password: string };
    res.json(await auth.login(input.email, input.password));
  };
  const refresh: RequestHandler = async (req, res) => {
    const input = req.body as { refreshToken: string };
    res.json(await auth.refresh(input.refreshToken));
  };
  const logout: RequestHandler = async (req, res) => {
    const input = req.body as { refreshToken: string };
    await auth.logout(input.refreshToken);
    res.status(204).end();
  };
  const me: RequestHandler = (req, res) => {
    res.json(req.authUser);
  };
  return { register, login, refresh, logout, me };
}
