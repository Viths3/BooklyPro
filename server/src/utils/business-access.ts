import { AppError } from './app-error.js';

export function assertBusinessOwner<T extends { ownerId: string }>(
  business: T | null,
  userId: string,
): asserts business is T {
  if (!business) throw new AppError(404, 'Business not found');
  if (business.ownerId !== userId)
    throw new AppError(403, 'Only the business owner can perform this action');
}
