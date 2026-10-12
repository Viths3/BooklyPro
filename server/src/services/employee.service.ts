import type {
  EmployeeRepository,
  EmployeeWriteContext,
} from '../repositories/employee.repository.js';
import type { ServiceRecord } from '../repositories/service.repository.js';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from '../schemas/employee.schema.js';
import { AppError } from '../utils/app-error.js';
import { assertBusinessOwner } from '../utils/business-access.js';
function services(links: { service: ServiceRecord }[]) {
  return links.map(({ service }) => ({
    ...service,
    price: service.price.toFixed(2),
  }));
}
function requireActive(active: boolean, entity: string) {
  if (!active) throw new AppError(409, entity + ' is inactive');
}
export class EmployeeService {
  constructor(private readonly repository: EmployeeRepository) {}
  async listPublic(businessId: string) {
    const business = await this.repository.findPublicBusiness(businessId);
    if (!business) throw new AppError(404, 'Business not found');
    return business.employees;
  }
  async listManaged(businessId: string, userId: string) {
    const business = await this.repository.findManagedBusiness(businessId);
    assertBusinessOwner(business, userId);
    return business.employees.map((employee) => ({
      ...employee,
      services: services(employee.services),
    }));
  }
  async getPublic(id: string) {
    const employee = await this.repository.findActive(id);
    if (!employee) throw new AppError(404, 'Employee not found');
    return { ...employee, services: services(employee.services) };
  }
  async create(businessId: string, userId: string, input: CreateEmployeeInput) {
    return this.repository.withLockedBusiness(businessId, async (context) => {
      assertBusinessOwner(context.business, userId);
      requireActive(context.business.active, 'Business');
      return context.create(input);
    });
  }
  private async withOwnedEmployee<T>(
    id: string,
    userId: string,
    action: (
      context: EmployeeWriteContext & {
        business: { ownerId: string; active: boolean };
      },
      employee: { active: boolean; businessId: string },
    ) => Promise<T>,
  ) {
    const found = await this.repository.findBusinessId(id);
    if (!found) throw new AppError(404, 'Employee not found');
    return this.repository.withLockedBusiness(
      found.businessId,
      async (context) => {
        assertBusinessOwner(context.business, userId);
        const employee = await context.findEmployee(id);
        if (!employee) throw new AppError(404, 'Employee not found');
        return action({ ...context, business: context.business }, employee);
      },
    );
  }
  update(id: string, userId: string, input: UpdateEmployeeInput) {
    return this.withOwnedEmployee(id, userId, async (context) => {
      requireActive(context.business.active, 'Business');
      return context.update(id, input);
    });
  }
  deactivate(id: string, userId: string) {
    return this.withOwnedEmployee(id, userId, (context) =>
      context.deactivate(id),
    );
  }
  changeAssignment(
    id: string,
    serviceId: string,
    userId: string,
    assign: boolean,
  ) {
    return this.withOwnedEmployee(id, userId, async (context, employee) => {
      const service = await context.findService(serviceId);
      if (!service) throw new AppError(404, 'Service not found');
      if (service.businessId !== employee.businessId)
        throw new AppError(
          400,
          'Employee and service must belong to the same business',
        );
      if (!assign) return context.unassign(id, serviceId);
      requireActive(context.business.active, 'Business');
      requireActive(employee.active, 'Employee');
      requireActive(service.active, 'Service');
      if (!(await context.assign(id, serviceId)))
        throw new AppError(409, 'Service is already assigned');
    });
  }
}
