import type { BusinessRepository } from '../repositories/business.repository.js';
import type {
  CreateBusinessInput,
  UpdateBusinessInput,
  BusinessListQuery,
} from '../schemas/business.schema.js';
import { AppError } from '../utils/app-error.js';

export class BusinessService {
  constructor(private readonly repository: BusinessRepository) {}
  async list(query: BusinessListQuery) {
    const [data, total] = await this.repository.list(query);
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async getActive(id: string) {
    const business = await this.repository.findActive(id);
    if (!business) throw new AppError(404, 'Business not found');
    return business;
  }
  getOwned(ownerId: string) {
    return this.repository.findOwned(ownerId);
  }
  create(ownerId: string, input: CreateBusinessInput) {
    return this.repository.create(ownerId, input);
  }
  private async requireOwner(id: string, userId: string) {
    const business = await this.repository.findOwnership(id);
    if (!business) throw new AppError(404, 'Business not found');
    if (business.ownerId !== userId)
      throw new AppError(
        403,
        'Only the business owner can perform this action',
      );
  }
  async update(id: string, userId: string, input: UpdateBusinessInput) {
    await this.requireOwner(id, userId);
    return this.repository.update(id, userId, input);
  }
  async deactivate(id: string, userId: string) {
    await this.requireOwner(id, userId);
    await this.repository.deactivate(id, userId);
  }
}
