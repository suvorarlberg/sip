const germanCollator = new Intl.Collator('de', {
  sensitivity: 'base',
  numeric: true,
});

function surnameKey(name: string): string {
  const cleanName = name.trim();
  if (!cleanName) return '';

  // Unterstützt auch das Format „Nachname, Vorname“.
  if (cleanName.includes(',')) {
    return cleanName.split(',')[0].trim();
  }

  const parts = cleanName.split(/\s+/);
  return parts[parts.length - 1] ?? cleanName;
}

export function comparePeopleByLastName(a: string, b: string): number {
  return (
    germanCollator.compare(surnameKey(a), surnameKey(b)) ||
    germanCollator.compare(a.trim(), b.trim())
  );
}