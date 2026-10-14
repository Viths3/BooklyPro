import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageUpload } from '../components/common/ImageUpload';
import { EntityImage } from '../components/common/EntityImage';
import { OwnerForm } from '../features/owner/OwnerForm';
import { uploadBusinessImage } from '../api/uploads';
import type { SessionManager } from '../features/auth/session';

const url =
  'https://res.cloudinary.com/fixture/image/upload/v1/booklypro/businesses/test.jpg';
beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:preview'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});
const image = () => new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
function choose(file: File) {
  fireEvent.change(
    screen.getByLabelText('Foto del negocio', { selector: 'input' }),
    { target: { files: [file] } },
  );
}
function setup(upload = vi.fn().mockResolvedValue(url), value = '') {
  const onChange = vi.fn();
  const pending = vi.fn();
  const view = render(
    <ImageUpload
      value={value}
      onChange={onChange}
      upload={upload}
      onPendingChange={pending}
    />,
  );
  return { upload, onChange, pending, ...view };
}
describe('image upload', () => {
  it('shows accessible file input without manual URL entry', () => {
    setup();
    expect(
      screen.getByRole('button', { name: 'Subir imagen' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('URL de imagen')).not.toBeInTheDocument();
  });
  it.each(['image/svg+xml', 'application/x-msdownload'])(
    'rejects %s',
    async (type) => {
      const { upload } = setup();
      choose(new File(['bad'], 'bad', { type }));
      expect(await screen.findByRole('alert')).toHaveTextContent('JPEG');
      expect(upload).not.toHaveBeenCalled();
    },
  );
  it('rejects oversized files', () => {
    const { upload } = setup();
    choose(
      new File([new Uint8Array(5242881)], 'large.jpg', { type: 'image/jpeg' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('5 MB');
    expect(upload).not.toHaveBeenCalled();
  });
  it('previews, blocks duplicates, then stores URL and cleans preview', async () => {
    let finish!: (value: string) => void;
    const { upload, onChange } = setup(
      vi.fn(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    choose(image());
    expect(screen.getByAltText('Foto del negocio')).toHaveAttribute(
      'src',
      'blob:preview',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Subiendo');
    choose(image());
    expect(upload).toHaveBeenCalledTimes(1);
    finish(url);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(url));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
  it('preserves old image on provider failure', async () => {
    const { onChange } = setup(
      vi.fn().mockRejectedValue(new Error('private provider message')),
      url,
    );
    choose(image());
    expect(await screen.findByRole('alert')).toHaveTextContent('foto anterior');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByAltText('Foto del negocio')).toHaveAttribute('src', url);
  });
  it('replaces an existing image', async () => {
    const { onChange } = setup(undefined, url);
    expect(
      screen.getByRole('button', { name: 'Cambiar imagen' }),
    ).toBeInTheDocument();
    choose(image());
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(url));
  });
  it('removes the URL without deleting provider assets', () => {
    const { onChange, upload } = setup(undefined, url);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar imagen' }));
    expect(onChange).toHaveBeenCalledWith('');
    expect(upload).not.toHaveBeenCalled();
  });
  it('aborts cancelled upload and ignores late results', async () => {
    let finish!: (value: string) => void;
    const { onChange, upload } = setup(
      vi.fn<(file: File, signal: AbortSignal) => Promise<string>>(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    choose(image());
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar carga' }));
    expect(upload.mock.calls[0]![1].aborted).toBe(true);
    finish(url);
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('aborts and revokes previews on unmount', () => {
    const { upload, unmount } = setup(
      vi.fn<(file: File, signal: AbortSignal) => Promise<string>>(
        () => new Promise<string>(() => {}),
      ),
    );
    choose(image());
    unmount();
    expect(upload.mock.calls[0]![1].aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
  it('blocks business submission while uploading and saves the resulting URL', async () => {
    let finish!: (value: string) => void;
    const save = vi.fn();
    render(
      <OwnerForm
        kind="business"
        initial={{ name: 'Oliva' }}
        busy={false}
        onSave={save}
        onClose={() => {}}
        uploadImage={() =>
          new Promise<string>((resolve) => {
            finish = resolve;
          })
        }
      />,
    );
    choose(image());
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    fireEvent.submit(
      screen.getByRole('button', { name: 'Guardar' }).closest('form')!,
    );
    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();
    finish(url);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: url }),
      ),
    );
  });
  it('uses a fallback for a broken image and recovers after replacement', () => {
    const { rerender } = render(<EntityImage url={url} name="Oliva" />);
    fireEvent.error(screen.getByAltText('Oliva'));
    expect(
      screen.getByRole('img', { name: 'Sin imagen de Oliva' }),
    ).toBeInTheDocument();
    rerender(<EntityImage url={url + '?v=2'} name="Oliva" />);
    expect(screen.getByAltText('Oliva')).toBeInTheDocument();
  });
  it('posts directly to Cloudinary without a BooklyPro token and optimizes delivery', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        cloudName: 'fixture',
        apiKey: '123',
        signature: 'signed',
        params: { public_id: 'booklypro/businesses/test', timestamp: '1' },
        expiresAt: Date.now() / 1000 + 100,
      },
    });
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          secure_url: url,
          public_id: 'booklypro/businesses/test',
          resource_type: 'image',
          format: 'jpg',
          bytes: 5,
        }),
        { status: 200 },
      ),
    );
    const result = await uploadBusinessImage(
      { request } as unknown as SessionManager,
      image(),
      new AbortController().signal,
    );
    expect(result).toContain('/f_auto,q_auto,c_limit,w_1600,h_1600/');
    expect(fetcher.mock.calls[0]![0]).toBe(
      'https://api.cloudinary.com/v1_1/fixture/image/upload',
    );
    expect(fetcher.mock.calls[0]![1]?.headers).toBeUndefined();
  });
});
