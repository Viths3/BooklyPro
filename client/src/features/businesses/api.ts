import { z } from 'zod';
import { apiRequest } from '../../api/client';
const business = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  imageUrl: z.string().nullable(),
  currency: z.string(),
  timeZone: z.string().optional(),
});
export type Business = z.infer<typeof business>;
const pagination = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});
const service = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.string(),
  durationMinutes: z.number(),
});
const employee = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
});
export type Service = z.infer<typeof service>;
export type Employee = z.infer<typeof employee>;
const review = z.object({
  id: z.string(),
  rating: z.number(),
  comment: z.string().nullable(),
  createdAt: z.string(),
  customer: z.object({ firstName: z.string() }),
});
export const businessApi = {
  async list(page: number, search: string, signal?: AbortSignal) {
    const query = new URLSearchParams({
      page: String(page),
      limit: '9',
      sortBy: 'name',
      order: 'asc',
      ...(search ? { search } : {}),
    });
    return z
      .object({ data: z.array(business), pagination })
      .parse(await apiRequest(`/api/businesses?${query}`, { signal }));
  },
  async detail(id: string, signal?: AbortSignal) {
    return z.object({ data: business }).parse(
      await apiRequest(`/api/businesses/${encodeURIComponent(id)}`, {
        signal,
      }),
    );
  },
  async services(id: string, signal?: AbortSignal) {
    return z.object({ data: z.array(service) }).parse(
      await apiRequest(`/api/businesses/${encodeURIComponent(id)}/services`, {
        signal,
      }),
    );
  },
  async employees(id: string, signal?: AbortSignal) {
    return z
      .object({ data: z.array(employee) })
      .parse(
        await apiRequest(
          `/api/businesses/${encodeURIComponent(id)}/employees`,
          { signal },
        ),
      );
  },
  async reviews(id: string, signal?: AbortSignal) {
    return z
      .object({
        data: z.array(review),
        pagination,
        summary: z.object({
          averageRating: z.number().nullable(),
          totalReviews: z.number(),
        }),
      })
      .parse(
        await apiRequest(
          `/api/businesses/${encodeURIComponent(id)}/reviews?limit=5`,
          { signal },
        ),
      );
  },
};
