export function buildReceiptNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const phoneSuffix = digits.slice(-4).padStart(4, "0");
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}${hour}${minute}-${phoneSuffix}`;
}
