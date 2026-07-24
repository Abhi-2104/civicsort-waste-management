// PII masking utilities. Applied at the application/API layer just before a
// response is serialized — the database always retains the real values.
//
// Mobile: first two and last two digits stay visible, everything between is
// masked. Non-digit formatting characters (+, -, spaces) are left in place.
//   "9123456701" -> "91******01"
//
// Email: the first up-to-3 characters of the local part stay visible, the
// rest of the local part is masked 1:1 (so length isn't fully hidden, but
// the exact characters are), the domain is never masked.
//   "ramesh@gmail.com"     -> "ram***@gmail.com"
//   "sureshkumar@yahoo.com" -> "sur********@yahoo.com"

export function maskMobile(value) {
  if (value === null || value === undefined || value === '') return value;
  const str = String(value);
  const digitPositions = [];
  for (let i = 0; i < str.length; i++) {
    if (/\d/.test(str[i])) digitPositions.push(i);
  }
  const n = digitPositions.length;
  if (n === 0) return str;

  // Fewer than 5 digits: not enough to safely reveal 2+2 without exposing
  // most of the number, so mask every digit.
  const visible = n <= 4
    ? new Set()
    : new Set([digitPositions[0], digitPositions[1], digitPositions[n - 2], digitPositions[n - 1]]);

  return str.split('').map((ch, i) => (/\d/.test(ch) && !visible.has(i)) ? '*' : ch).join('');
}

export function maskEmail(value) {
  if (value === null || value === undefined || value === '') return value;
  const str = String(value);
  const at = str.indexOf('@');
  if (at <= 0) return str; // not a recognizable email shape — leave as-is rather than guess

  const local = str.slice(0, at);
  const domain = str.slice(at);
  const visibleLen = Math.min(3, Math.max(1, local.length - 1));
  const visible = local.slice(0, visibleLen);
  const masked = '*'.repeat(Math.max(local.length - visibleLen, 3));
  return `${visible}${masked}${domain}`;
}

/** Returns a shallow copy of `row` with known PII fields masked. `row` itself is never mutated. */
export function maskRow(row, extraFieldMap) {
  if (!row || typeof row !== 'object') return row;
  const copy = { ...row };
  if (copy.mobile_number !== undefined) copy.mobile_number = maskMobile(copy.mobile_number);
  if (copy.email !== undefined) copy.email = maskEmail(copy.email);
  if (extraFieldMap) {
    for (const [key, fn] of Object.entries(extraFieldMap)) {
      if (copy[key] !== undefined) copy[key] = fn(copy[key]);
    }
  }
  return copy;
}

export function maskRows(rows, extraFieldMap) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(r => maskRow(r, extraFieldMap));
}
