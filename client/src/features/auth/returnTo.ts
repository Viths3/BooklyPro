import { safeBookingReturn } from '../booking/model';
export function safeReturnTo(state: unknown): string | null {
  if (
    state &&
    typeof state === 'object' &&
    'returnTo' in state &&
    typeof state.returnTo === 'string' &&
    /^\/dashboard(?:\/appointments(?:\/[a-zA-Z0-9-]+)?)?$/.test(state.returnTo)
  )
    return state.returnTo;
  return safeBookingReturn(state);
}
