import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '../../components/common/ui';
import { reviewSchema, type ReviewInput } from './api';
export function ReviewForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (input: ReviewInput) => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ReviewInput>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: 0, comment: '' },
  });
  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="review-form">
      <fieldset disabled={busy}>
        <legend>Valoración de 1 a 5</legend>
        <Controller
          name="rating"
          control={control}
          render={({ field }) => (
            <div className="rating-options">
              {[1, 2, 3, 4, 5].map((rating) => (
                <label key={rating}>
                  <input
                    type="radio"
                    value={rating}
                    name={field.name}
                    ref={rating === 1 ? field.ref : undefined}
                    checked={field.value === rating}
                    onBlur={field.onBlur}
                    onChange={() => field.onChange(rating)}
                    aria-describedby={
                      errors.rating ? 'rating-error' : undefined
                    }
                  />
                  {rating} <span aria-hidden="true">★</span>
                </label>
              ))}
            </div>
          )}
        />
        {errors.rating && (
          <p id="rating-error" className="field-error" role="alert">
            {errors.rating.message}
          </p>
        )}
        <div className="field">
          <label htmlFor="review-comment">Comentario (opcional)</label>
          <textarea
            id="review-comment"
            rows={4}
            maxLength={1000}
            {...register('comment')}
            aria-invalid={Boolean(errors.comment)}
            aria-describedby={errors.comment ? 'comment-error' : 'comment-hint'}
          />
          <small id="comment-hint">Máximo 1000 caracteres.</small>
          {errors.comment && (
            <span className="field-error" id="comment-error">
              {errors.comment.message}
            </span>
          )}
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Publicando…' : 'Publicar reseña'}
        </Button>
      </fieldset>
      {busy && <p role="status">Publicando tu reseña…</p>}
    </form>
  );
}
