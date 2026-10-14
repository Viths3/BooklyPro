import { forwardRef } from 'react';
import { Select } from './Select';
import { Input } from './ui';
import { countries, type CountryCode } from '../../lib/phone';
export const PhoneInput = forwardRef<
  HTMLInputElement,
  {
    id: string;
    value: string;
    country: CountryCode;
    onChange: (value: string) => void;
    onCountryChange: (value: CountryCode) => void;
    onBlur: () => void;
    error?: string;
    legacy?: boolean;
  }
>(function PhoneInput(
  { id, value, country, onChange, onCountryChange, onBlur, error, legacy },
  ref,
) {
  return (
    <div className="phone-control">
      <Select
        id={`${id}-country`}
        label="País del teléfono"
        value={country}
        onChange={(event) => onCountryChange(event.target.value as CountryCode)}
      >
        {countries.map((item) => (
          <option key={item.code} value={item.code}>
            {item.name} {item.prefix}
          </option>
        ))}
      </Select>
      <Input
        ref={ref}
        id={id}
        label="Teléfono"
        type="tel"
        autoComplete="tel-national"
        inputMode="tel"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        error={error}
        hint={
          legacy
            ? 'Número existente: se conservará si no lo modificas.'
            : 'Opcional. Escribe el número nacional; añadiremos el prefijo del país.'
        }
      />
    </div>
  );
});
