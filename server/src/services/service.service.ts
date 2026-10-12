import type {
  ServiceRepository,
  ServiceRecord,
} from '../repositories/service.repository.js';
import type {
  CreateServiceInput,
  UpdateServiceInput,
} from '../schemas/service.schema.js';
import { AppError } from '../utils/app-error.js';
import { assertBusinessOwner } from '../utils/business-access.js';

function response(service: ServiceRecord) {
  return { ...service, price: service.price.toFixed(2) };
}
function requireActive(active: boolean) {
  if (!active) throw new AppError(409, 'Business is inactive');
}
export class ServiceService {
  constructor(private readonly repository: ServiceRepository) {}
  async listPublic(businessId: string) {
    const business = await this.repository.findBusinessCatalog(
      businessId,
      true,
    );
    if (!business) throw new AppError(404, 'Business not found');
    return business.services.map(response);
  }
  async listManaged(businessId: string, userId: string) {
    const business = await this.repository.findBusinessCatalog(
      businessId,
      false,
    );
    assertBusinessOwner(business, userId);
    return business.services.map(response);
  }
  async getPublic(id: string) {
    const service = await this.repository.findActive(id);
    if (!service) throw new AppError(404, 'Service not found');
    return response(service);
  }
  async create(businessId: string, userId: string, input: CreateServiceInput) {
    return this.repository.withLockedBusiness(businessId, async (context) => {
      assertBusinessOwner(context.business, userId);
      requireActive(context.business.active);
      return response(await context.create(input));
    });
  }
  private async businessId(id: string) {
    const service = await this.repository.findBusinessId(id);
    if (!service) throw new AppError(404, 'Service not found');
    return service.businessId;
  }
  async update(id: string, userId: string, input: UpdateServiceInput) {
    const businessId = await this.businessId(id);
    return this.repository.withLockedBusiness(businessId, async (context) => {
      assertBusinessOwner(context.business, userId);
      requireActive(context.business.active);
      return response(await context.update(id, input));
    });
  }
  async deactivate(id: string, userId: string) {
    const businessId = await this.businessId(id);
    await this.repository.withLockedBusiness(businessId, async (context) => {
      assertBusinessOwner(context.business, userId);
      await context.deactivate(id);
    });
  }
}
