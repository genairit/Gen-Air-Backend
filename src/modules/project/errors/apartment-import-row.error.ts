export class ApartmentImportRowError extends Error {
  constructor(readonly reasons: readonly string[]) {
    super('Apartment import row validation failed');
  }
}
