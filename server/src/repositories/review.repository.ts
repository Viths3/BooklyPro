import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { BusinessReviewsQuery } from '../schemas/review.schema.js';

const createdSelect = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
} satisfies Prisma.ReviewSelect;
const publicSelect = {
  ...createdSelect,
  customer: { select: { firstName: true } },
} satisfies Prisma.ReviewSelect;
type NewReview = Pick<
  Prisma.ReviewUncheckedCreateInput,
  'appointmentId' | 'customerId' | 'businessId' | 'rating' | 'comment'
>;

export class ReviewRepository {
  constructor(private readonly db: PrismaClient) {}
  findAppointmentForReview(id: string) {
    return this.db.appointment.findUnique({
      where: { id },
      select: { customerId: true, businessId: true, status: true },
    });
  }
  findReviewByAppointmentId(appointmentId: string) {
    return this.db.review.findUnique({
      where: { appointmentId },
      select: { id: true },
    });
  }
  createReview(data: NewReview) {
    return this.db.review.create({ data, select: createdSelect });
  }
  findReviewById(id: string) {
    return this.db.review.findUnique({
      where: { id },
      select: {
        ...publicSelect,
        business: { select: { id: true, name: true } },
      },
    });
  }
  findBusinessReviews(businessId: string, query: BusinessReviewsQuery) {
    const where = { businessId };
    return this.db.$transaction(
      [
        this.db.business.findUnique({
          where: { id: businessId },
          select: { id: true },
        }),
        this.db.review.findMany({
          where,
          select: publicSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.db.review.aggregate({
          where,
          _avg: { rating: true },
          _count: { _all: true },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
