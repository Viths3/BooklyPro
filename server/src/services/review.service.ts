import { Prisma } from '../generated/prisma/client.js';
import type { ReviewRepository } from '../repositories/review.repository.js';
import type {
  CreateReviewInput,
  BusinessReviewsQuery,
} from '../schemas/review.schema.js';
import { AppError } from '../utils/app-error.js';

function duplicateReview() {
  return new AppError(
    409,
    'This appointment has already been reviewed',
    'REVIEW_ALREADY_EXISTS',
  );
}
export class ReviewService {
  constructor(private readonly repository: ReviewRepository) {}
  async create(
    appointmentId: string,
    customerId: string,
    input: CreateReviewInput,
  ) {
    const appointment =
      await this.repository.findAppointmentForReview(appointmentId);
    if (!appointment)
      throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
    if (appointment.customerId !== customerId)
      throw new AppError(403, 'Only the customer can review this appointment');
    if (appointment.status !== 'COMPLETED')
      throw new AppError(
        409,
        'Only completed appointments can be reviewed',
        'APPOINTMENT_NOT_REVIEWABLE',
      );
    if (await this.repository.findReviewByAppointmentId(appointmentId))
      throw duplicateReview();
    // COMPLETED is terminal. The existing FK guarantees a valid business and
    // matching customer/business; UNIQUE remains the authority for concurrent creates.
    try {
      return await this.repository.createReview({
        appointmentId,
        customerId,
        businessId: appointment.businessId,
        rating: input.rating,
        comment: input.comment ?? null,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw duplicateReview();
        if (error.code === 'P2003')
          throw new AppError(
            409,
            'The appointment is no longer available for review',
            'CONFLICT',
          );
      }
      throw error;
    }
  }
  async get(id: string) {
    const review = await this.repository.findReviewById(id);
    if (!review)
      throw new AppError(404, 'Review not found', 'REVIEW_NOT_FOUND');
    return review;
  }
  async list(businessId: string, query: BusinessReviewsQuery) {
    const [business, data, aggregate] =
      await this.repository.findBusinessReviews(businessId, query);
    if (!business)
      throw new AppError(404, 'Business not found', 'BUSINESS_NOT_FOUND');
    const total = aggregate._count._all;
    const average = aggregate._avg.rating;
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      summary: {
        averageRating: average === null ? null : Math.round(average * 10) / 10,
        totalReviews: total,
      },
    };
  }
}
