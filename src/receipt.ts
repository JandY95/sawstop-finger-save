const KST_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

export function buildReceiptNumber(phone: string, clock: () => Date = () => new Date()) {
  const digits = phone.replace(/\D/g, "");
  const phoneSuffix = digits.slice(-4).padStart(4, "0");
  const dateTimeParts = Object.fromEntries(
    KST_DATE_TIME_FORMATTER.formatToParts(clock()).map(({ type, value }) => [type, value])
  );
  const { year, month, day, hour, minute } = dateTimeParts;
  return `${year}${month}${day}${hour}${minute}-${phoneSuffix}`;
}
