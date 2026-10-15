export function cleanWhatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const number = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  if (!/^62[0-9]{8,13}$/.test(number))
    throw new Error("Nomor WhatsApp Indonesia tidak valid.");
  return number;
}
export function createWhatsappUrl(phone: string, message: string) {
  return `https://wa.me/${cleanWhatsappNumber(phone)}?text=${encodeURIComponent(message)}`;
}
