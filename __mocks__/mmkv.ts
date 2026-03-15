export class MMKV {
  private store = new Map<string, string | number | boolean>();

  getString(key: string): string | undefined {
    return this.store.get(key) as string | undefined;
  }

  set(key: string, value: string | number | boolean): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  contains(key: string): boolean {
    return this.store.has(key);
  }

  getAllKeys(): string[] {
    return Array.from(this.store.keys());
  }

  clearAll(): void {
    this.store.clear();
  }
}
