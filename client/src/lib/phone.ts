import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';
export type { CountryCode } from 'libphonenumber-js/min';
const names = new Intl.DisplayNames(['es'], { type: 'region' });
export const countries = getCountries()
  .map((code) => ({
    code,
    name: names.of(code) ?? code,
    prefix: `+${getCountryCallingCode(code)}`,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));
export function phoneParts(value = '') {
  const parsed = value.startsWith('+')
    ? parsePhoneNumberFromString(value)
    : undefined;
  if (parsed?.country && parsed.isPossible())
    return {
      country: parsed.country,
      national: String(parsed.nationalNumber),
      legacy: false,
    };
  return {
    country: 'EC' as CountryCode,
    national: value,
    legacy: Boolean(value),
  };
}
export function normalizePhone(
  value: string,
  country: string = 'EC',
): string | null {
  const input = value.trim();
  if (!input) return null;
  if (
    !countries.some((item) => item.code === country) ||
    !/^\+?[\d\s().-]+$/.test(input)
  )
    throw new Error(
      'Escribe un teléfono válido, sin letras ni prefijos duplicados.',
    );
  const parsed = parsePhoneNumberFromString(input, {
    defaultCountry: country as CountryCode,
    extract: false,
  });
  if (
    !parsed ||
    !parsed.isPossible() ||
    parsed.countryCallingCode !==
      getCountryCallingCode(country as CountryCode) ||
    (parsed.country && parsed.country !== country)
  )
    throw new Error('Revisa el país y la cantidad de dígitos del teléfono.');
  return parsed.number;
}
