import { createHash, randomUUID } from 'node:crypto';
import type { BusinessRepository } from '../repositories/business.repository.js';
import type { UploadInput } from '../schemas/upload.schema.js';
import { assertBusinessOwner } from '../utils/business-access.js';
import { AppError } from '../utils/app-error.js';

export type UploadConfig = {
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
};

export class UploadService {
  constructor(
    private readonly businesses: Pick<BusinessRepository, 'findOwnership'>,
    private readonly config: UploadConfig,
  ) {}

  async sign(userId: string, input: UploadInput) {
    if (input.businessId)
      assertBusinessOwner(
        await this.businesses.findOwnership(input.businessId),
        userId,
      );
    const {
      CLOUDINARY_CLOUD_NAME: cloudName,
      CLOUDINARY_API_KEY: apiKey,
      CLOUDINARY_API_SECRET: secret,
    } = this.config;
    if (!cloudName || !apiKey || !secret)
      throw new AppError(
        503,
        'Image uploads are not configured',
        'UPLOADS_UNAVAILABLE',
      );
    const timestamp = Math.floor(Date.now() / 1000);
    // Never sign client-supplied Cloudinary options. A unique ID and no overwrite
    // bound replays to the same asset; the provider controls the one-hour TTL.
    const params = {
      allowed_formats: 'jpg,png,webp',
      overwrite: 'false',
      public_id: `booklypro/businesses/${userId}/${randomUUID()}`,
      timestamp: String(timestamp),
      transformation: 'c_limit,w_1600,h_1600',
    };
    const payload = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const signature = createHash('sha256')
      .update(payload + secret)
      .digest('hex');
    return {
      cloudName,
      apiKey,
      signature,
      params,
      expiresAt: timestamp + 3600,
    };
  }
}
