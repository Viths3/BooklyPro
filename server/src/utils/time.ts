// Local wall-clock times; callers validate HH:mm before converting.
export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours! * 60 + minutes!;
}
export function minutesToTime(minutes: number) {
  return (
    String(Math.floor(minutes / 60)).padStart(2, '0') +
    ':' +
    String(minutes % 60).padStart(2, '0')
  );
}
